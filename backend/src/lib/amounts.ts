import {
  getTransferAssetDecimals,
  getTransferAssetLabel,
} from "./assets.js";
import type { TransferAsset } from "../types.js";

interface NormalizeDecimalOptions {
  decimals: number;
  invalidMessage: string;
  minimum?: number;
  minimumMessage?: string;
  requirePositive?: boolean;
}

function normalizeDecimalAmount(value: string, options: NormalizeDecimalOptions) {
  const trimmed = value.trim();
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${options.decimals}})?$`);

  if (!pattern.test(trimmed)) {
    throw new Error(options.invalidMessage);
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const decimal = normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
  const raw = BigInt(`${normalizedWhole}${fractionPart.padEnd(options.decimals, "0")}` || "0").toString();

  if (options.requirePositive !== false && BigInt(raw) <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  if (typeof options.minimum === "number") {
    const parsedAmount = Number.parseFloat(decimal);

    if (!Number.isFinite(parsedAmount) || parsedAmount < options.minimum) {
      throw new Error(options.minimumMessage ?? `Amount must be at least ${options.minimum}.`);
    }
  }

  return {
    decimal,
    raw,
  };
}

export function parseDecimalAmountToRaw(value: string, decimals: number) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(`Amount exceeds supported precision for ${decimals} decimal places.`);
  }

  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.padEnd(decimals, "0");
  return BigInt(`${normalizedWhole}${normalizedFraction}` || "0").toString();
}

export function formatAssetAmount(rawAmount: string, asset: TransferAsset) {
  const decimals = getTransferAssetDecimals(asset);
  const isNegative = rawAmount.startsWith("-");
  const unsignedAmount = isNegative ? rawAmount.slice(1) : rawAmount;
  const normalizedAmount = unsignedAmount.replace(/^0+/, "") || "0";
  const paddedAmount = normalizedAmount.padStart(decimals + 1, "0");
  const whole = paddedAmount.slice(0, -decimals);
  const fraction = paddedAmount.slice(-decimals).replace(/0+$/, "");

  return `${isNegative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function normalizeMinimumCurrencyAmount(input: {
  currencyCode: string;
  decimals: number;
  minimum: number;
  minimumMessage: string;
  value: string;
}) {
  return normalizeDecimalAmount(input.value, {
    decimals: input.decimals,
    invalidMessage: `Enter a valid ${input.currencyCode} amount with up to ${input.decimals} decimal places.`,
    minimum: input.minimum,
    minimumMessage: input.minimumMessage,
  }).decimal;
}

export function normalizeSwapAmount(value: string, asset: TransferAsset) {
  const decimals = getTransferAssetDecimals(asset);

  return normalizeDecimalAmount(value, {
    decimals,
    invalidMessage: `Enter a valid ${getTransferAssetLabel(asset)} amount with up to ${decimals} decimal places.`,
  });
}
