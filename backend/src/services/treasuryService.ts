import { getYieldPositionByUserId } from "../db/repositories/yieldPositionsRepo.js";
import { getUserById, getUserBalancesByUserId } from "../db/repositories/usersRepo.js";
import { buildTreasuryValuation, getTreasuryPrices } from "../lib/alchemy.js";
import { formatAssetAmount } from "../lib/amounts.js";
import { logError } from "../lib/logger.js";
import { fetchUsdcYieldCurrentPositionRaw } from "../lib/yieldRead.js";
import type {
  SolanaBalancesResponse,
  TreasuryValuation,
  YieldPortfolioSnapshot,
  YieldTrackedPosition,
} from "../types.js";

interface TreasurySnapshotDependencies {
  buildTreasuryValuation: typeof buildTreasuryValuation;
  fetchUsdcYieldCurrentPositionRaw: typeof fetchUsdcYieldCurrentPositionRaw;
  getTreasuryPrices: typeof getTreasuryPrices;
  getUserBalancesByUserId: typeof getUserBalancesByUserId;
  getUserById: typeof getUserById;
  getYieldPositionByUserId: typeof getYieldPositionByUserId;
}

const defaultDependencies: TreasurySnapshotDependencies = {
  buildTreasuryValuation,
  fetchUsdcYieldCurrentPositionRaw,
  getTreasuryPrices,
  getUserBalancesByUserId,
  getUserById,
  getYieldPositionByUserId,
};

export async function buildTreasurySnapshotForUser(
  userId: number,
  balancesOverride?: SolanaBalancesResponse["balances"],
  dependencies: TreasurySnapshotDependencies = defaultDependencies,
) {
  const [user, balances, treasuryPrices, trackedPosition] = await Promise.all([
    dependencies.getUserById(userId),
    balancesOverride ? Promise.resolve(balancesOverride) : dependencies.getUserBalancesByUserId(userId),
    dependencies.getTreasuryPrices(),
    dependencies.getYieldPositionByUserId(userId),
  ]);

  if (!user) {
    throw new Error(`Unable to build treasury snapshot for unknown user ${userId}.`);
  }

  const currentYieldPositionRaw = user.solanaAddress
    ? await dependencies
        .fetchUsdcYieldCurrentPositionRaw(user.solanaAddress)
        .catch(error => {
          logError("treasury.usdc_yield_position_read_failed", error, {
            userId,
            walletAddress: user.solanaAddress,
          });
          return trackedPosition.principal.raw;
        })
    : "0";
  const usdcPriceUsd = treasuryPrices?.pricesUsd.usdc ?? null;
  const yieldSnapshot = buildYieldPortfolioSnapshot({
    currentPositionRaw: currentYieldPositionRaw,
    trackedPosition,
    usdcPriceUsd,
  });
  const valuation = dependencies.buildTreasuryValuation(
    balances,
    treasuryPrices,
    {
      yieldInvestedValueUsd: yieldSnapshot.positions.usdc.valueUsd,
    },
  );

  return {
    balances,
    valuation,
    yield: yieldSnapshot,
  };
}

export function buildYieldPortfolioSnapshot(input: {
  currentPositionRaw: string;
  trackedPosition: YieldTrackedPosition;
  usdcPriceUsd: string | null;
}): YieldPortfolioSnapshot {
  const currentPositionRaw = input.currentPositionRaw;
  const trackedPrincipalRaw = input.trackedPosition.principal.raw;
  const hasCurrentPosition = BigInt(currentPositionRaw) > 0n;
  const hasTrackedPrincipal = BigInt(trackedPrincipalRaw) > 0n;
  const status = hasCurrentPosition ? (hasTrackedPrincipal ? "tracked" : "untracked") : "none";
  const earningsRaw =
    hasTrackedPrincipal && BigInt(currentPositionRaw) > BigInt(trackedPrincipalRaw)
      ? (BigInt(currentPositionRaw) - BigInt(trackedPrincipalRaw)).toString()
      : "0";

  return {
    positions: {
      usdc: {
        currentPosition: {
          formatted: formatAssetAmount(currentPositionRaw, "usdc"),
          raw: currentPositionRaw,
        },
        earnings: {
          formatted: formatAssetAmount(earningsRaw, "usdc"),
          raw: earningsRaw,
        },
        status,
        valueUsd: formatUsdValue(currentPositionRaw, input.usdcPriceUsd),
      },
    },
  };
}

export function createEmptyTreasuryValuation(): TreasuryValuation {
  return {
    assetValuesUsd: {
      eurc: null,
      sol: null,
      usdc: null,
    },
    isStale: true,
    lastUpdatedAt: null,
    liquidTreasuryValueUsd: null,
    pricesUsd: {
      eurc: null,
      sol: null,
      usdc: null,
    },
    treasuryValueUsd: null,
    unavailableAssets: ["sol", "usdc", "eurc"],
    yieldInvestedValueUsd: null,
  };
}

export function createEmptyYieldPortfolioSnapshot(): YieldPortfolioSnapshot {
  return {
    positions: {
      usdc: {
        currentPosition: {
          formatted: "0",
          raw: "0",
        },
        earnings: {
          formatted: "0",
          raw: "0",
        },
        status: "none",
        valueUsd: "0.00",
      },
    },
  };
}

function formatUsdValue(rawAmount: string, priceUsd: string | null) {
  const price = Number.parseFloat(priceUsd ?? "");
  const amount = Number.parseFloat(formatAssetAmount(rawAmount, "usdc"));

  if (!Number.isFinite(price) || !Number.isFinite(amount)) {
    return null;
  }

  return (amount * price).toFixed(2);
}
