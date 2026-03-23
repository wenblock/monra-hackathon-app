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
  pricesUsd: {
    eurc: "1.10",
    sol: "150.00",
    usdc: "1.00",
  },
  treasuryValueUsd: "152.10",
  unavailableAssets: [],
};

describe("buildYieldOverviewViewModel", () => {
  it("computes deposits, earnings, and projected annual yield from ledger and on-chain data", () => {
    const overview = buildYieldOverviewViewModel({
      ledgerSummary: {
        eurc: {
          formatted: "0",
          raw: "0",
        },
        usdc: {
          formatted: "1",
          raw: "1000000",
        },
      },
      onchainSnapshot: createOnchainSnapshot(),
      valuation,
    });

    expect(overview.totalDepositsUsd).toBe("$1.00");
    expect(overview.totalEarningsUsd).toBe("$0.25");
    expect(overview.projectedAnnualYieldUsd).toBe("$0.04");
    expect(overview.vaults[0]?.apyDisplay).toBe("3.35%");
    expect(overview.vaults[0]?.earningsDisplay).toBe("0.25 USDC");
    expect(overview.vaults[0]?.tvlDisplay).toBe("524M USDC");
    expect(overview.vaults[0]?.tvlUsd).toBe("$524M");
  });

  it("shows a warning when Monra has no principal recorded for an existing on-chain position", () => {
    const overview = buildYieldOverviewViewModel({
      ledgerSummary: {
        eurc: {
          formatted: "0",
          raw: "0",
        },
        usdc: {
          formatted: "0",
          raw: "0",
        },
      },
      onchainSnapshot: createOnchainSnapshot(),
      valuation,
    });

    expect(overview.vaults[0]?.warning).toBe(
      "This USDC position exists on-chain, but Monra has no recorded Yield principal for it yet.",
    );
  });
});

function createOnchainSnapshot(): YieldOnchainSnapshot {
  return {
    vaults: {
      eurc: {
        asset: "eurc",
        conversionRateToSharesRaw: "998000",
        decimals: 6,
        jlTokenMintAddress: "jl-eurc",
        rewardsRateRaw: "8000000000",
        supplyRateRaw: "2600000000",
        totalAssetsRaw: "13300000000000",
        totalSupplyRaw: "13300000000000",
        underlyingAddress: "eurc-mint",
        userJlTokenSharesRaw: "0",
        userPositionRaw: "0",
        walletBalanceRaw: "0",
      },
      usdc: {
        asset: "usdc",
        conversionRateToSharesRaw: "990000",
        decimals: 6,
        jlTokenMintAddress: "jl-usdc",
        rewardsRateRaw: "50000000000",
        supplyRateRaw: "33500000000",
        totalAssetsRaw: "524000000000000",
        totalSupplyRaw: "522000000000000",
        underlyingAddress: "usdc-mint",
        userJlTokenSharesRaw: "1250000",
        userPositionRaw: "1250000",
        walletBalanceRaw: "18870000",
      },
    },
  };
}
