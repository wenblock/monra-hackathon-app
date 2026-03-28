import { getTransferAssetDecimals } from "@/assets";
import type { OfframpSourceAsset } from "@/types";

function getMaxAmountForAsset(input: {
  asset: OfframpSourceAsset;
  availableRawBalance: string;
}) {
  const availableRawBalance = normalizeRawAmount(input.availableRawBalance);
  if (availableRawBalance <= 0n) {
    return null;
  }

  return formatRawAmount(availableRawBalance, getTransferAssetDecimals(input.asset));
}

function formatRawAmount(rawAmount: bigint, decimals: number) {
  const paddedAmount = rawAmount.toString().padStart(decimals + 1, "0");
  const wholePart = paddedAmount.slice(0, -decimals) || "0";
  const fractionalPart = paddedAmount.slice(-decimals).replace(/0+$/, "");
  return fractionalPart ? `${wholePart}.${fractionalPart}` : wholePart;
}

function normalizeRawAmount(value: string | null | undefined) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return 0n;
  }

  return BigInt(trimmedValue);
}

export { getMaxAmountForAsset };
