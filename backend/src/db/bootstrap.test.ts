import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/monra";
process.env.ALCHEMY_API_KEY = "alchemy-api-key";
process.env.ALCHEMY_WEBHOOK_ID = "alchemy-webhook-id";
process.env.ALCHEMY_WEBHOOK_AUTH_TOKEN = "alchemy-webhook-auth-token";
process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = "alchemy-webhook-signing-key";
process.env.CDP_API_KEY_ID = "cdp-api-key-id";
process.env.CDP_API_KEY_SECRET = "cdp-api-key-secret";
process.env.BRIDGE_API_KEY = "bridge-api-key";
process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = "test-public-key";
process.env.BRIDGE_WEBHOOK_MAX_AGE_MS = "600000";

const {
  getDatabaseInitializationMode,
  getMissingPublicIdTables,
} = await import("./bootstrap.js");

test("getDatabaseInitializationMode treats an empty application schema as fresh", () => {
  assert.equal(getDatabaseInitializationMode([]), "fresh_schema");
});

test("getDatabaseInitializationMode treats existing core tables as a migration-only database", () => {
  assert.equal(getDatabaseInitializationMode(["users"]), "migrations_only");
  assert.equal(
    getDatabaseInitializationMode(["schema_migrations", "transactions"]),
    "migrations_only",
  );
});

test("getMissingPublicIdTables identifies partial public_id migration state", () => {
  assert.deepEqual(getMissingPublicIdTables(["users"]), ["recipients", "transactions"]);
  assert.deepEqual(
    getMissingPublicIdTables(["users", "recipients", "transactions"]),
    [],
  );
});
