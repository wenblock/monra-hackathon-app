import {
  getTransferAssetLabel,
} from "@/assets";
import type {
  TreasuryValuation,
  YieldAsset,
  YieldTrackedPosition,
  YieldTrackedPositionsResponse,
} from "@/types";

import { formatYieldCompactAsset, formatYieldCompactUsd } from "./formatters";
import { getYieldAssetIconPath } from "./metadata";
import { formatYieldRawAmount, type YieldOnchainSnapshot } from "./runtime";

const YIELD_SUPPLY_RATE_PRECISION = 100;

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
  isUntrackedPosition: boolean;
  label: string;
  projectedAnnualYieldUsd: string | null;
  trackingBadge: string | null;
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
  positions: YieldTrackedPositionsResponse;
  onchainSnapshot: YieldOnchainSnapshot;
  valuation: TreasuryValuation | null | undefined;
}): YieldOverviewViewModel {
  const vaults = [
    buildYieldVaultViewModel({
      asset: "usdc",
      onchainSnapshot: input.onchainSnapshot,
      position: input.positions.positions.usdc,
      valuation: input.valuation,
    }),
  ];

  const totalDepositsUsd = sumPresent(vaults.map(vault => parseUsd(vault.depositedUsd))) ?? 0;
  const totalEarningsUsd = sumPresent(vaults.map(vault => parseUsd(vault.earningsUsd))) ?? 0;
  const projectedAnnualYieldUsd =
    sumPresent(vaults.map(vault => parseUsd(vault.projectedAnnualYieldUsd))) ?? 0;

  return {
    projectedAnnualYieldUsd: formatUsd(projectedAnnualYieldUsd),
    totalDepositsUsd: formatUsd(totalDepositsUsd),
    totalEarningsUsd: formatUsd(totalEarningsUsd),
    vaults,
  };
}

export function buildYieldVaultViewModel(input: {
  asset: YieldAsset;
  onchainSnapshot: YieldOnchainSnapshot;
  position: YieldTrackedPosition;
  valuation: TreasuryValuation | null | undefined;
}): YieldVaultViewModel {
  const vault = input.onchainSnapshot.vaults[input.asset];
  const label = getTransferAssetLabel(input.asset);
  const depositedRaw = input.position.principal.raw;
  const currentPositionRaw = vault.userPositionRaw;
  const isUntrackedPosition = BigInt(currentPositionRaw) > 0n && BigInt(depositedRaw) === 0n;
  const earningsRaw = maxBigIntString(BigInt(currentPositionRaw) - BigInt(depositedRaw));
  const apyPercent = Number(vault.supplyRateRaw) / YIELD_SUPPLY_RATE_PRECISION;
  const currentPositionUsdValue = calculateUsdValue(currentPositionRaw, input.asset, input.valuation);
  const zeroAssetDisplay = `${formatYieldRawAmount("0", input.asset)} ${label}`;
  const projectedAnnualYieldUsdValue =
    !isUntrackedPosition && currentPositionUsdValue !== null
      ? currentPositionUsdValue * (apyPercent / 100)
      : null;
  const trackedDepositedUsdValue = isUntrackedPosition
    ? 0
    : calculateUsdValue(depositedRaw, input.asset, input.valuation);
  const trackedEarningsUsdValue = isUntrackedPosition
    ? 0
    : calculateUsdValue(earningsRaw, input.asset, input.valuation);

  return {
    apyDisplay: `${apyPercent.toFixed(2)}%`,
    apyPercent,
    asset: input.asset,
    conversionRateToSharesRaw: vault.conversionRateToSharesRaw,
    currentPositionDisplay: `${formatYieldRawAmount(currentPositionRaw, input.asset)} ${label}`,
    currentPositionRaw,
    currentPositionUsd: formatUsd(currentPositionUsdValue),
    depositedDisplay: isUntrackedPosition
      ? zeroAssetDisplay
      : `${formatYieldRawAmount(depositedRaw, input.asset)} ${label}`,
    depositedRaw,
    depositedUsd: formatUsd(trackedDepositedUsdValue),
    earningsDisplay: isUntrackedPosition
      ? zeroAssetDisplay
      : `${formatYieldRawAmount(earningsRaw, input.asset)} ${label}`,
    earningsRaw,
    earningsUsd: formatUsd(trackedEarningsUsdValue),
    iconPath: getYieldAssetIconPath(input.asset),
    isUntrackedPosition,
    label,
    projectedAnnualYieldUsd: formatUsd(projectedAnnualYieldUsdValue),
    trackingBadge: null,
    tvlDisplay: formatYieldCompactAsset(vault.totalAssetsRaw, input.asset),
    tvlRaw: vault.totalAssetsRaw,
    tvlUsd: formatYieldCompactUsd(calculateUsdValue(vault.totalAssetsRaw, input.asset, input.valuation)),
    warning: null,
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

function sumPresent(values: Array<number | null>) {
  let total = 0;
  let hasValue = false;

  for (const value of values) {
    if (value === null || !Number.isFinite(value)) {
      continue;
    }

    hasValue = true;
    total += value;
  }

  return hasValue ? total : null;
}

function maxBigIntString(value: bigint) {
  return value > 0n ? value.toString() : "0";
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
