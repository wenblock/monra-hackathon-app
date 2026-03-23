import {
  getTransferAssetIconPath,
  getTransferAssetLabel,
} from "@/assets";
import type {
  TreasuryValuation,
  YieldAsset,
  YieldLedgerSummary,
} from "@/types";

import { formatYieldCompactAsset, formatYieldCompactUsd } from "./formatters";
import { formatYieldRawAmount, type YieldOnchainSnapshot } from "./runtime";

const YIELD_ASSETS = ["usdc", "eurc"] as const satisfies YieldAsset[];
const YIELD_SUPPLY_RATE_PRECISION = 10_000_000_000;

export interface YieldVaultViewModel {
  apyDisplay: string;
  apyPercent: number;
  asset: YieldAsset;
  conversionRateToSharesRaw: string;
  currentPositionDisplay: string;
  currentPositionRaw: string;
  currentPositionUsd: string | null;
  depositedDisplay: string;
  depositedRaw: string;
  depositedUsd: string | null;
  earningsDisplay: string;
  earningsRaw: string;
  earningsUsd: string | null;
  iconPath: string;
  label: string;
  projectedAnnualYieldUsd: string | null;
  tvlDisplay: string;
  tvlRaw: string;
  tvlUsd: string | null;
  warning: string | null;
  walletBalanceDisplay: string;
  walletBalanceRaw: string;
}

export interface YieldOverviewViewModel {
  projectedAnnualYieldUsd: string | null;
  totalDepositsUsd: string | null;
  totalEarningsUsd: string | null;
  vaults: YieldVaultViewModel[];
}

export function buildYieldOverviewViewModel(input: {
  ledgerSummary: YieldLedgerSummary;
  onchainSnapshot: YieldOnchainSnapshot;
  valuation: TreasuryValuation | null | undefined;
}): YieldOverviewViewModel {
  const vaults = YIELD_ASSETS.map(asset =>
    buildYieldVaultViewModel({
      asset,
      depositedRaw: input.ledgerSummary[asset].raw,
      onchainSnapshot: input.onchainSnapshot,
      valuation: input.valuation,
    }),
  );

  return {
    projectedAnnualYieldUsd: formatUsd(sumFinite(vaults.map(vault => parseUsd(vault.projectedAnnualYieldUsd)))),
    totalDepositsUsd: formatUsd(sumFinite(vaults.map(vault => parseUsd(vault.depositedUsd)))),
    totalEarningsUsd: formatUsd(sumFinite(vaults.map(vault => parseUsd(vault.earningsUsd)))),
    vaults,
  };
}

export function buildYieldVaultViewModel(input: {
  asset: YieldAsset;
  depositedRaw: string;
  onchainSnapshot: YieldOnchainSnapshot;
  valuation: TreasuryValuation | null | undefined;
}): YieldVaultViewModel {
  const vault = input.onchainSnapshot.vaults[input.asset];
  const label = getTransferAssetLabel(input.asset);
  const depositedRaw = input.depositedRaw;
  const currentPositionRaw = vault.userPositionRaw;
  const earningsRaw = (BigInt(currentPositionRaw) - BigInt(depositedRaw)).toString();
  const apyPercent = Number(vault.supplyRateRaw) / YIELD_SUPPLY_RATE_PRECISION;
  const currentPositionUsdValue = calculateUsdValue(currentPositionRaw, input.asset, input.valuation);
  const projectedAnnualYieldUsdValue =
    currentPositionUsdValue !== null ? currentPositionUsdValue * (apyPercent / 100) : null;

  return {
    apyDisplay: `${apyPercent.toFixed(2)}%`,
    apyPercent,
    asset: input.asset,
    conversionRateToSharesRaw: vault.conversionRateToSharesRaw,
    currentPositionDisplay: `${formatYieldRawAmount(currentPositionRaw, input.asset)} ${label}`,
    currentPositionRaw,
    currentPositionUsd: formatUsd(currentPositionUsdValue),
    depositedDisplay: `${formatYieldRawAmount(depositedRaw, input.asset)} ${label}`,
    depositedRaw,
    depositedUsd: formatUsd(calculateUsdValue(depositedRaw, input.asset, input.valuation)),
    earningsDisplay: `${formatYieldRawAmount(earningsRaw, input.asset)} ${label}`,
    earningsRaw,
    earningsUsd: formatUsd(calculateUsdValue(earningsRaw, input.asset, input.valuation)),
    iconPath: getTransferAssetIconPath(input.asset),
    label,
    projectedAnnualYieldUsd: formatUsd(projectedAnnualYieldUsdValue),
    tvlDisplay: formatYieldCompactAsset(vault.totalAssetsRaw, input.asset),
    tvlRaw: vault.totalAssetsRaw,
    tvlUsd: formatYieldCompactUsd(calculateUsdValue(vault.totalAssetsRaw, input.asset, input.valuation)),
    warning:
      BigInt(currentPositionRaw) > 0n && BigInt(depositedRaw) === 0n
        ? `This ${label} position exists on-chain, but Monra has no recorded Yield principal for it yet.`
        : null,
    walletBalanceDisplay: `${formatYieldRawAmount(vault.walletBalanceRaw, input.asset)} ${label}`,
    walletBalanceRaw: vault.walletBalanceRaw,
  };
}

function calculateUsdValue(
  rawAmount: string,
  asset: YieldAsset,
  valuation: TreasuryValuation | null | undefined,
) {
  const price = Number.parseFloat(valuation?.pricesUsd[asset] ?? "");
  const amount = Number.parseFloat(formatYieldRawAmount(rawAmount, asset));

  if (!Number.isFinite(price) || !Number.isFinite(amount)) {
    return null;
  }

  return amount * price;
}

function parseUsd(value: string | null) {
  if (!value) {
    return null;
  }

  return Number.parseFloat(value.replace(/[$,]/g, ""));
}

function sumFinite(values: Array<number | null>) {
  let total = 0;

  for (const value of values) {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    total += value;
  }

  return total;
}

function formatUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}
