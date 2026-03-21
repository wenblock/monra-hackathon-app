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
process.env.STREAM_TOKEN_SECRET = "stream-token-test-secret";

const {
  createStreamToken,
  InvalidStreamTokenError,
  verifyStreamToken,
} = await import("./streamToken.js");

test("verifyStreamToken accepts valid tokens", () => {
  const token = createStreamToken("cdp-user-1");
  const payload = verifyStreamToken(token.token);

  assert.equal(payload.cdpUserId, "cdp-user-1");
});

test("verifyStreamToken throws a typed error for malformed tokens", () => {
  assert.throws(
    () => verifyStreamToken("not-a-valid-token"),
    error => error instanceof InvalidStreamTokenError,
  );
});
