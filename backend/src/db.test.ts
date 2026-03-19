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

const { getSerialSequenceRepairState } = await import("./db.js");

test("getSerialSequenceRepairState keeps the first next sequence value at 1 for empty tables", () => {
  const repairState = getSerialSequenceRepairState(null);

  assert.deepEqual(repairState, {
    isCalled: false,
    nextValue: 1,
    setValue: 1,
  });
});

test("getSerialSequenceRepairState advances the next sequence value to max id plus one", () => {
  const repairState = getSerialSequenceRepairState(4);

  assert.deepEqual(repairState, {
    isCalled: true,
    nextValue: 5,
    setValue: 4,
  });
});
