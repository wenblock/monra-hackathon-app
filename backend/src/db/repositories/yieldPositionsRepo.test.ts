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

const { createEmptyYieldTrackedPosition, replayYieldPositionHistory } = await import("./yieldPositionsRepo.js");

test("createEmptyYieldTrackedPosition returns zeroed usdc amounts", () => {
  const position = createEmptyYieldTrackedPosition();

  assert.equal(position.principal.raw, "0");
  assert.equal(position.totalDeposited.raw, "0");
  assert.equal(position.grossWithdrawn.raw, "0");
  assert.equal(position.updatedAt, null);
});

test("replayYieldPositionHistory replays deposits and withdrawals in order with a zero floor", () => {
  const position = replayYieldPositionHistory([
    {
      action: "withdraw",
      amountRaw: "500000",
      confirmedAt: "2026-03-25T00:00:00.000Z",
      createdAt: "2026-03-25T00:00:00.000Z",
      transactionSignature: "sig-1",
    },
    {
      action: "deposit",
      amountRaw: "1000000",
      confirmedAt: "2026-03-25T00:01:00.000Z",
      createdAt: "2026-03-25T00:01:00.000Z",
      transactionSignature: "sig-2",
    },
    {
      action: "withdraw",
      amountRaw: "250000",
      confirmedAt: "2026-03-25T00:02:00.000Z",
      createdAt: "2026-03-25T00:02:00.000Z",
      transactionSignature: "sig-3",
    },
  ]);

  assert.equal(position.principal.raw, "750000");
  assert.equal(position.totalDeposited.raw, "1000000");
  assert.equal(position.grossWithdrawn.raw, "750000");
  assert.equal(position.updatedAt, "2026-03-25T00:02:00.000Z");
});
