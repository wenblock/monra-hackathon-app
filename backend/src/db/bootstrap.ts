import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { Pool, PoolClient } from "pg";

import { pool } from "./pool.js";

let databaseInitialized: Promise<void> | null = null;

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

async function initializeDatabaseInternal() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const schemaPath = path.resolve(process.cwd(), "src", "db", "schema.sql");
  const migrationsDirectory = path.resolve(process.cwd(), "src", "db", "migrations");

  const schemaSql = await readFile(schemaPath, "utf8");
  if (schemaSql.trim().length > 0) {
    await pool.query(schemaSql);
  }

  let migrationFiles: string[] = [];

  try {
    migrationFiles = (await readdir(migrationsDirectory))
      .filter(fileName => fileName.endsWith(".sql"))
      .sort();
  } catch (error) {
    if (!isMissingDirectoryError(error)) {
      throw error;
    }
  }

  for (const migrationFile of migrationFiles) {
    const alreadyApplied = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migrationFile],
    );

    if (alreadyApplied.rowCount) {
      continue;
    }

    const migrationPath = path.join(migrationsDirectory, migrationFile);
    const migrationSql = await readFile(migrationPath, "utf8");

    await pool.query("BEGIN");

    try {
      await pool.query(migrationSql);
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationFile]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }

  await repairManagedSerialSequences();
}

function isMissingDirectoryError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
