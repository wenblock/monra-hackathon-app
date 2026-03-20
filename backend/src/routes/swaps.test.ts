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

const { normalizeSwapAmount } = await import("./swaps.js");

test("normalizeSwapAmount converts exact-in decimals to raw units", () => {
  assert.deepEqual(normalizeSwapAmount("10.5", "usdc"), {
    decimal: "10.5",
    raw: "10500000",
  });

  assert.deepEqual(normalizeSwapAmount("0.000000001", "sol"), {
    decimal: "0.000000001",
    raw: "1",
  });
});

test("normalizeSwapAmount rejects zero and over-precision values", () => {
  assert.throws(() => normalizeSwapAmount("0", "eurc"), /greater than zero/i);
  assert.throws(
    () => normalizeSwapAmount("1.0000001", "usdc"),
    /up to 6 decimal places/i,
  );
});
