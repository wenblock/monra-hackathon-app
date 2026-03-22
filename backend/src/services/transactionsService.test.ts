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

const { buildLatestTransactionSnapshot } = await import("./transactionsService.js");

test("buildLatestTransactionSnapshot honors a provided balance override", async () => {
  let balanceReadCount = 0;

  const balances = {
    eurc: { formatted: "0", raw: "0" },
    sol: { formatted: "1", raw: "1000000000" },
    usdc: { formatted: "2", raw: "2000000" },
  };

  const snapshot = await buildLatestTransactionSnapshot(
    7,
    balances,
    {
      buildTreasuryValuation(currentBalances, prices) {
        assert.equal(currentBalances, balances);
        return {
          assetValuesUsd: { eurc: "0", sol: "150", usdc: "2" },
          isStale: false,
          lastUpdatedAt: "2026-03-22T00:00:00.000Z",
          pricesUsd: prices,
          treasuryValueUsd: "152",
          unavailableAssets: [],
        };
      },
      async getTreasuryPrices() {
        return { eurc: "1", sol: "150", usdc: "1" };
      },
      async getUserBalancesByUserId() {
        balanceReadCount += 1;
        return balances as any;
      },
      async listTransactionsByUserIdPaginated() {
        return {
          nextCursor: null,
          transactions: [{ id: 1 }, { id: 2 }],
        } as any;
      },
    },
  );

  assert.equal(balanceReadCount, 0);
  assert.equal(snapshot.transactions.length, 2);
  assert.equal(snapshot.valuation.treasuryValueUsd, "152");
});
