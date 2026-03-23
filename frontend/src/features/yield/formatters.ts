import { getTransferAssetLabel } from "@/assets";
import type { YieldAsset } from "@/types";

import { formatYieldRawAmount } from "./runtime";

export function formatYieldCompactAsset(rawAmount: string, asset: YieldAsset) {
  const label = getTransferAssetLabel(asset);
  const amount = Number.parseFloat(formatYieldRawAmount(rawAmount, asset));

  if (!Number.isFinite(amount)) {
    return `0 ${label}`;
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(amount)} ${label}`;
}

export function formatYieldCompactUsd(value: number | string | null) {
  const amount =
    typeof value === "string"
      ? Number.parseFloat(value.replace(/[$,]/g, ""))
      : value;

  if (amount === null || !Number.isFinite(amount)) {
    return null;
  }

  if (Math.abs(amount) < 1_000) {
    return new Intl.NumberFormat("en-US", {
      currency: "USD",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: "currency",
    }).format(amount);
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  })
    .format(amount)
    .replace(/\.0(?=[KMBT])/, "");
}
