import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { isTransactionStreamReady } from "./transactionStream.js";

export async function getReadinessStatus() {
  let databaseReady = true;
  let databaseError: string | null = null;

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    databaseReady = false;
    databaseError = error instanceof Error ? error.message : "Database ping failed.";
  }

  const providers = {
    alchemy: "configured",
    bridge: "configured",
    cdp: "configured",
    jupiter: config.jupiterApiKey ? "configured" : "missing",
  } as const;
  const streamReady = isTransactionStreamReady();

  return {
    checks: {
      database: databaseReady ? "ok" : "error",
      transactionStream: streamReady ? "ok" : "error",
    },
    errors: {
      database: databaseError,
    },
    ok: databaseReady && streamReady,
    providers,
  };
}
