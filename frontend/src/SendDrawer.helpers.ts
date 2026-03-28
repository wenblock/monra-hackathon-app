import { getTransferAssetDecimals } from "@/assets";
import type { TransferAsset } from "@/types";

const MIN_SOL_FEE_RESERVE_RAW = 100_000n;

function getSendMaxAmount(input: {
  asset: TransferAsset;
  availableRawBalance: string;
}) {
  const availableRawBalance = normalizeRawAmount(input.availableRawBalance);
  const maxRawAmount =
    input.asset === "sol"
      ? availableRawBalance - MIN_SOL_FEE_RESERVE_RAW
      : availableRawBalance;

  if (maxRawAmount <= 0n) {
    return null;
  }

  return formatRawAmount(maxRawAmount, getTransferAssetDecimals(input.asset));
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

export { getSendMaxAmount };
