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
  port: Number(process.env.PORT ?? 4000),
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
  bridgeWebhookPublicKey: readEnv("BRIDGE_WEBHOOK_PUBLIC_KEY").replace(/\\n/g, "\n"),
  bridgeWebhookMaxAgeMs: Number(process.env.BRIDGE_WEBHOOK_MAX_AGE_MS ?? 600000),
  streamTokenSecret:
    readOptionalEnv("STREAM_TOKEN_SECRET") ??
    (process.env.NODE_ENV === "production"
      ? readEnv("STREAM_TOKEN_SECRET")
      : "dev-only-stream-token-secret"),
};
