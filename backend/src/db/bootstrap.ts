import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { Pool, PoolClient } from "pg";

import { logInfo } from "../lib/logger.js";
import { pool } from "./pool.js";

let databaseInitialized: Promise<void> | null = null;
const coreApplicationTables = ["recipients", "transactions", "user_balances", "users"] as const;
type DatabaseInitializationMode = "fresh_schema" | "migrations_only";
const publicIdTables = ["recipients", "transactions", "users"] as const;
const PUBLIC_ID_MIGRATION_NAME = "011_public_ids.sql";

const managedSerialSequences = [
  {
    columnName: "id",
    tableName: "users",
  },
  {
    columnName: "id",
    tableName: "recipients",
  },
  {
    columnName: "id",
    tableName: "transactions",
  },
  {
    columnName: "id",
    tableName: "transaction_stream_events",
  },
] as const;

export function getSerialSequenceRepairState(maxId: number | null) {
  if (maxId === null) {
    return {
      isCalled: false,
      nextValue: 1,
      setValue: 1,
    };
  }

  return {
    isCalled: true,
    nextValue: maxId + 1,
    setValue: maxId,
  };
}

export async function repairManagedSerialSequences(client: Pool | PoolClient = pool) {
  for (const sequence of managedSerialSequences) {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('${sequence.tableName}', '${sequence.columnName}'),
        COALESCE(MAX(${sequence.columnName}), 1),
        MAX(${sequence.columnName}) IS NOT NULL
      )
      FROM ${sequence.tableName}
    `);
  }
}

export async function initializeDatabase() {
  if (!databaseInitialized) {
    databaseInitialized = initializeDatabaseInternal();
  }

  return databaseInitialized;
}

export function getDatabaseInitializationMode(existingCoreTables: Iterable<string>): DatabaseInitializationMode {
  const tableSet = new Set(existingCoreTables);

  return coreApplicationTables.some(tableName => tableSet.has(tableName))
    ? "migrations_only"
    : "fresh_schema";
}

export function getMissingPublicIdTables(existingTablesWithPublicId: Iterable<string>) {
  const tableSet = new Set(existingTablesWithPublicId);

  return publicIdTables.filter(tableName => !tableSet.has(tableName));
}

async function initializeDatabaseInternal() {
  const schemaPath = path.resolve(process.cwd(), "src", "db", "schema.sql");
  const migrationsDirectory = path.resolve(process.cwd(), "src", "db", "migrations");
  const [schemaSql, migrationFiles] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readMigrationFiles(migrationsDirectory),
  ]);
  const client = await pool.connect();

  try {
    await ensureSchemaMigrationsTable(client);

    const existingCoreTables = await listExistingCoreTables(client);
    const mode = getDatabaseInitializationMode(existingCoreTables);
    logInfo("db.bootstrap_mode_selected", {
      existingCoreTables,
      migrationFileCount: migrationFiles.length,
      mode,
    });

    if (mode === "fresh_schema") {
      await applyFreshSchema(client, schemaSql, migrationFiles);
    } else {
      await validatePublicIdMigrationConsistency(client);
      await applyPendingMigrations(client, migrationsDirectory, migrationFiles);
    }

    await repairManagedSerialSequences(client);
  } finally {
    client.release();
  }
}

function isMissingDirectoryError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

async function ensureSchemaMigrationsTable(client: Pool | PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readMigrationFiles(migrationsDirectory: string) {
  try {
    return (await readdir(migrationsDirectory))
      .filter(fileName => fileName.endsWith(".sql"))
      .sort();
  } catch (error) {
    if (!isMissingDirectoryError(error)) {
      throw error;
    }

    return [];
  }
}

async function listExistingCoreTables(client: Pool | PoolClient) {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::TEXT[])
      ORDER BY table_name ASC
    `,
    [coreApplicationTables],
  );

  return result.rows.map(row => row.table_name);
}

async function validatePublicIdMigrationConsistency(client: PoolClient) {
  const publicIdMigrationApplied = await hasAppliedMigration(client, PUBLIC_ID_MIGRATION_NAME);
  if (!publicIdMigrationApplied) {
    return;
  }

  const tablesWithPublicId = await listTablesWithColumn(client, publicIdTables, "public_id");
  const missingPublicIdTables = getMissingPublicIdTables(tablesWithPublicId);
  if (missingPublicIdTables.length === 0) {
    return;
  }

  throw new Error(
    `Detected partial ${PUBLIC_ID_MIGRATION_NAME} state. Missing public_id columns for: ${missingPublicIdTables.join(", ")}. Run backend/src/db/manual/check_public_id_recovery.sql and repair the migration state before restarting the backend.`,
  );
}

async function hasAppliedMigration(client: PoolClient, migrationFile: string) {
  const result = await client.query<{ name: string }>(
    "SELECT name FROM schema_migrations WHERE name = $1",
    [migrationFile],
  );

  return result.rows.length > 0;
}

async function listTablesWithColumn(
  client: PoolClient,
  tableNames: readonly string[],
  columnName: string,
) {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::TEXT[])
        AND column_name = $2::TEXT
      ORDER BY table_name ASC
    `,
    [tableNames, columnName],
  );

  return result.rows.map(row => row.table_name);
}

async function applyFreshSchema(
  client: PoolClient,
  schemaSql: string,
  migrationFiles: string[],
) {
  if (schemaSql.trim().length === 0) {
    return;
  }

  await client.query("BEGIN");

  try {
    await client.query(schemaSql);
    await recordAppliedMigrations(client, migrationFiles);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function applyPendingMigrations(
  client: PoolClient,
  migrationsDirectory: string,
  migrationFiles: string[],
) {
  for (const migrationFile of migrationFiles) {
    const alreadyApplied = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migrationFile],
    );

    if (alreadyApplied.rows.length > 0) {
      continue;
    }

    const migrationPath = path.join(migrationsDirectory, migrationFile);
    const migrationSql = await readFile(migrationPath, "utf8");

    await client.query("BEGIN");

    try {
      await client.query(migrationSql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationFile]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function recordAppliedMigrations(client: PoolClient, migrationFiles: string[]) {
  if (migrationFiles.length === 0) {
    return;
  }

  const placeholders = migrationFiles.map((_, index) => `($${index + 1})`).join(", ");
  await client.query(
    `INSERT INTO schema_migrations (name) VALUES ${placeholders} ON CONFLICT (name) DO NOTHING`,
    migrationFiles,
  );
}
