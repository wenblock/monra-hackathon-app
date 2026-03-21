import { Pool } from "pg";

import { config } from "../config.js";
import { logError } from "../lib/logger.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: config.pgPoolConnectionTimeoutMs,
  idleTimeoutMillis: config.pgPoolIdleTimeoutMs,
  max: config.pgPoolMax,
  maxLifetimeSeconds: config.pgPoolMaxLifetimeSeconds,
});

pool.on("error", error => {
  logError("db.pool_error", error);
});

export async function closeDatabase() {
  await pool.end();
}
