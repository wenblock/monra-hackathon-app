import type { PoolClient } from "pg";

import { pool } from "./pool.js";

export async function withClient<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    return await run(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async client => {
    let committed = false;

    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      committed = true;
      return result;
    } catch (error) {
      if (!committed) {
        await client.query("ROLLBACK");
      }

      throw error;
    }
  });
}
