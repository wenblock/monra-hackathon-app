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

const { buildTreasurySnapshotForUser } = await import("./treasuryService.js");
const {
  markUsdcYieldCurrentPositionCacheStale,
  readCachedUsdcYieldCurrentPositionRaw,
  resetYieldPortfolioCacheForTests,
} = await import("../lib/yieldPortfolioCache.js");

test("buildTreasurySnapshotForUser reuses the cached yield position across repeated reads", async () => {
  resetYieldPortfolioCacheForTests();
  let fetchCount = 0;

  const dependencies = createTreasuryDependencies(async () => {
    fetchCount += 1;
    return "5000000";
  });

  const firstSnapshot = await buildTreasurySnapshotForUser(7, undefined, dependencies as any);
  const secondSnapshot = await buildTreasurySnapshotForUser(7, undefined, dependencies as any);

  assert.equal(fetchCount, 1);
  assert.equal(firstSnapshot.yield.positions.usdc.currentPosition.raw, "5000000");
  assert.equal(secondSnapshot.yield.positions.usdc.currentPosition.raw, "5000000");
});

test("buildTreasurySnapshotForUser serves stale cached yield values immediately while refreshing in background", async () => {
  resetYieldPortfolioCacheForTests();
  let fetchCount = 0;
  let resolveRefresh: ((value: string) => void) | null = null;

  const dependencies = createTreasuryDependencies(async () => {
    fetchCount += 1;

    if (fetchCount === 1) {
      return "5000000";
    }

    return await new Promise<string>(resolve => {
      resolveRefresh = resolve;
    });
  });

  await buildTreasurySnapshotForUser(7, undefined, dependencies as any);
  markUsdcYieldCurrentPositionCacheStale("Wallet1111111111111111111111111111111111111");

  const staleSnapshot = await buildTreasurySnapshotForUser(7, undefined, dependencies as any);
  assert.equal(fetchCount, 2);
  assert.equal(staleSnapshot.yield.positions.usdc.currentPosition.raw, "5000000");

  resolveRefresh?.("6500000");
  await Promise.resolve();
  await Promise.resolve();

  const refreshedSnapshot = await buildTreasurySnapshotForUser(7, undefined, dependencies as any);
  assert.equal(refreshedSnapshot.yield.positions.usdc.currentPosition.raw, "6500000");
});

function createTreasuryDependencies(fetchYieldPosition: () => Promise<string>) {
  return {
    buildTreasuryValuation: () => ({
      assetValuesUsd: { eurc: "0.00", sol: "150.00", usdc: "4.00" },
      isStale: false,
      lastUpdatedAt: "2026-03-25T00:00:00.000Z",
      liquidTreasuryValueUsd: "154.00",
      pricesUsd: { eurc: "1.00", sol: "150.00", usdc: "1.00" },
      treasuryValueUsd: "159.00",
      unavailableAssets: [],
      yieldInvestedValueUsd: "5.00",
    }),
    fetchUsdcYieldCurrentPositionRaw: async () => fetchYieldPosition(),
    getTreasuryPrices: async () => ({
      expiresAt: Date.now() + 30_000,
      fetchedAt: Date.now(),
      lastUpdatedAt: "2026-03-25T00:00:00.000Z",
      pricesUsd: {
        eurc: "1.00",
        sol: "150.00",
        usdc: "1.00",
      },
    }),
    getUserBalancesByUserId: async () => ({
      eurc: { formatted: "0", raw: "0" },
      sol: { formatted: "1", raw: "1000000000" },
      usdc: { formatted: "4", raw: "4000000" },
    }),
    getUserById: async () => ({
      id: 7,
      solanaAddress: "Wallet1111111111111111111111111111111111111",
    }),
    getYieldPositionByUserId: async () => ({
      grossWithdrawn: { formatted: "0", raw: "0" },
      principal: { formatted: "4", raw: "4000000" },
      totalDeposited: { formatted: "4", raw: "4000000" },
      updatedAt: "2026-03-25T00:00:00.000Z",
    }),
    readCachedUsdcYieldCurrentPositionRaw,
  };
}
