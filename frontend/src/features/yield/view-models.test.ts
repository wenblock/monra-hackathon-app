import { describe, expect, it } from "vitest";

import type { TreasuryValuation } from "@/types";

import { buildYieldOverviewViewModel } from "./view-models";
import type { YieldOnchainSnapshot } from "./runtime";

const valuation: TreasuryValuation = {
  assetValuesUsd: {
    eurc: "1.10",
    sol: "150.00",
    usdc: "1.00",
  },
  isStale: false,
  lastUpdatedAt: "2026-03-23T10:00:00.000Z",
  liquidTreasuryValueUsd: "151.00",
  pricesUsd: {
    eurc: "1.10",
    sol: "150.00",
    usdc: "1.00",
  },
  treasuryValueUsd: "152.25",
  unavailableAssets: [],
  yieldInvestedValueUsd: "1.25",
};

describe("buildYieldOverviewViewModel", () => {
  it("computes deposits, earnings, and projected annual yield from tracked positions and on-chain data", () => {
    const overview = buildYieldOverviewViewModel({
      onchainSnapshot: createOnchainSnapshot(),
      positions: {
        positions: {
          usdc: {
            grossWithdrawn: {
              formatted: "0",
              raw: "0",
            },
            principal: {
              formatted: "1",
              raw: "1000000",
            },
            totalDeposited: {
              formatted: "1",
              raw: "1000000",
            },
            updatedAt: "2026-03-25T00:00:00.000Z",
          },
        },
      },
      valuation,
    });

    expect(overview.totalDepositsUsd).toBe("$1.00");
    expect(overview.totalEarningsUsd).toBe("$0.25");
    expect(overview.projectedAnnualYieldUsd).toBe("$0.03");
    expect(overview.vaults[0]?.apyDisplay).toBe("2.23%");
    expect(overview.vaults[0]?.earningsDisplay).toBe("0.25 USDC");
    expect(overview.vaults[0]?.tvlDisplay).toBe("517.7M USDC");
    expect(overview.vaults[0]?.tvlUsd).toBe("$517.7M");
  });

  it("zeros existing untracked positions on yield surfaces instead of surfacing an untracked label", () => {
    const overview = buildYieldOverviewViewModel({
      onchainSnapshot: createOnchainSnapshot(),
      positions: {
        positions: {
          usdc: {
            grossWithdrawn: {
              formatted: "0",
              raw: "0",
            },
            principal: {
              formatted: "0",
              raw: "0",
            },
            totalDeposited: {
              formatted: "0",
              raw: "0",
            },
            updatedAt: null,
          },
        },
      },
      valuation,
    });

    expect(overview.totalDepositsUsd).toBe("$0.00");
    expect(overview.totalEarningsUsd).toBe("$0.00");
    expect(overview.projectedAnnualYieldUsd).toBe("$0.00");
    expect(overview.vaults[0]?.depositedDisplay).toBe("0 USDC");
    expect(overview.vaults[0]?.depositedUsd).toBe("$0.00");
    expect(overview.vaults[0]?.earningsDisplay).toBe("0 USDC");
    expect(overview.vaults[0]?.earningsUsd).toBe("$0.00");
    expect(overview.vaults[0]?.trackingBadge).toBeNull();
    expect(overview.vaults[0]?.warning).toBeNull();
    expect(overview.vaults[0]?.isUntrackedPosition).toBe(true);
  });
});

function createOnchainSnapshot(): YieldOnchainSnapshot {
  return {
    vaults: {
      usdc: {
        asset: "usdc",
        conversionRateToSharesRaw: "990000",
        decimals: 6,
        jlTokenMintAddress: "jl-usdc",
        rewardsRateRaw: "0",
        supplyRateRaw: "223",
        totalAssetsRaw: "517700000000000",
        totalSupplyRaw: "515000000000000",
        underlyingAddress: "usdc-mint",
        userJlTokenSharesRaw: "1250000",
        userPositionRaw: "1250000",
        walletBalanceRaw: "18870000",
      },
    },
  };
}
