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
  buildYieldNormalizationKey,
  getYieldLedgerDirection,
  getYieldLedgerDirectionForEntryType,
  getYieldLedgerEntryType,
} = await import("./yield.js");

test("buildYieldNormalizationKey is deterministic for deposits", () => {
  const entryType = getYieldLedgerEntryType("deposit");

  assert.equal(entryType, "yield_deposit");
  assert.equal(getYieldLedgerDirection("deposit"), "outbound");
  assert.equal(getYieldLedgerDirectionForEntryType(entryType), "outbound");
  assert.equal(
    buildYieldNormalizationKey({
      asset: "usdc",
      entryType,
      signature: "yield-signature-1",
      trackedWalletAddress: "Wallet1111111111111111111111111111111111111",
    }),
    "yield-signature-1:yield:usdc:Wallet1111111111111111111111111111111111111:yield_deposit:outbound",
  );
});

test("buildYieldNormalizationKey is deterministic for withdrawals", () => {
  const entryType = getYieldLedgerEntryType("withdraw");

  assert.equal(entryType, "yield_withdraw");
  assert.equal(getYieldLedgerDirection("withdraw"), "inbound");
  assert.equal(getYieldLedgerDirectionForEntryType(entryType), "inbound");
  assert.equal(
    buildYieldNormalizationKey({
      asset: "usdc",
      entryType,
      signature: "yield-signature-2",
      trackedWalletAddress: "Wallet2222222222222222222222222222222222222",
    }),
    "yield-signature-2:yield:usdc:Wallet2222222222222222222222222222222222222:yield_withdraw:inbound",
  );
});
