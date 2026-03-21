import { Pool } from "pg";

import { config } from "../config.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function closeDatabase() {
  await pool.end();
}
