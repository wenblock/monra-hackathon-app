import dotenv from "dotenv";

dotenv.config();

const LOCAL_ALLOWED_ORIGINS = ["http://localhost:3000"];

function readEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readNumberEnv(name: string, defaultValue: number, minimum = 0) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue.trim().length === 0) {
    return defaultValue;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue < minimum) {
    throw new Error(`Environment variable ${name} must be a number greater than or equal to ${minimum}.`);
  }

  return parsedValue;
}

function parseAllowedOrigins() {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

  const origins =
    process.env.NODE_ENV === "production"
      ? configuredOrigins
      : Array.from(new Set([...LOCAL_ALLOWED_ORIGINS, ...configuredOrigins]));

  if (origins.length === 0) {
    throw new Error("Missing required environment variable: ALLOWED_ORIGINS");
  }

  return new Set(origins);
}

export const config = {
  port: readNumberEnv("PORT", 4000, 1),
  allowedOrigins: parseAllowedOrigins(),
  databaseUrl: readEnv("DATABASE_URL"),
  alchemyApiKey: readEnv("ALCHEMY_API_KEY"),
  alchemyWebhookId: readEnv("ALCHEMY_WEBHOOK_ID"),
  alchemyWebhookAuthToken: readEnv("ALCHEMY_WEBHOOK_AUTH_TOKEN"),
  alchemyWebhookSigningKey: readEnv("ALCHEMY_WEBHOOK_SIGNING_KEY"),
  cdpApiKeyId: readEnv("CDP_API_KEY_ID"),
  cdpApiKeySecret: readEnv("CDP_API_KEY_SECRET"),
  bridgeApiKey: readEnv("BRIDGE_API_KEY"),
  bridgeApiBaseUrl: (process.env.BRIDGE_API_BASE_URL ?? "https://api.bridge.xyz/v0").replace(
    /\/$/,
    "",
  ),
  jupiterApiBaseUrl: (process.env.JUPITER_API_BASE_URL ?? "https://api.jup.ag/swap/v2").replace(
    /\/$/,
    "",
  ),
  jupiterApiKey: readOptionalEnv("JUPITER_API_KEY"),
  bridgeWebhookPublicKey: readEnv("BRIDGE_WEBHOOK_PUBLIC_KEY").replace(/\\n/g, "\n"),
  bridgeWebhookMaxAgeMs: readNumberEnv("BRIDGE_WEBHOOK_MAX_AGE_MS", 600000, 0),
  outboundRequestRetries: readNumberEnv("OUTBOUND_REQUEST_RETRIES", 1, 0),
  outboundRequestTimeoutMs: readNumberEnv("OUTBOUND_REQUEST_TIMEOUT_MS", 8000, 1),
  reconciliationIntervalMs: readNumberEnv("RECONCILIATION_INTERVAL_MS", 0, 0),
  pgPoolMax: readNumberEnv("PG_POOL_MAX", 10, 1),
  pgPoolIdleTimeoutMs: readNumberEnv("PG_POOL_IDLE_TIMEOUT_MS", 10000, 0),
  pgPoolConnectionTimeoutMs: readNumberEnv("PG_POOL_CONNECTION_TIMEOUT_MS", 3000, 1),
  pgPoolMaxLifetimeSeconds: readNumberEnv("PG_POOL_MAX_LIFETIME_SECONDS", 300, 1),
  alchemyWebhookConcurrency: readNumberEnv("ALCHEMY_WEBHOOK_CONCURRENCY", 4, 1),
  streamTokenSecret:
    readOptionalEnv("STREAM_TOKEN_SECRET") ??
    (process.env.NODE_ENV === "production"
      ? readEnv("STREAM_TOKEN_SECRET")
      : "dev-only-stream-token-secret"),
};
