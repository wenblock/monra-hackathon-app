import type { SolanaBalancesResponse, TransferAsset } from "@/types";

const MIN_SOL_FOR_TRANSACTION_FEE_RAW = 100_000n;
const MIN_SOL_FOR_SPL_TRANSFER_WITH_ATA_CREATION_RAW = 3_000_000n;

export function getWalletTransferFeeHint(input: {
  asset: TransferAsset;
  balances?: SolanaBalancesResponse["balances"];
  needsRecipientTokenAccountCreation?: boolean;
}) {
  const solBalanceRaw = normalizeRawAmount(input.balances?.sol.raw);

  if (input.asset === "sol") {
    return solBalanceRaw < MIN_SOL_FOR_TRANSACTION_FEE_RAW
      ? "Add more SOL before sending. Native SOL transfers still need a small balance for network fees."
      : "Leave a small SOL balance in the wallet for network fees after this transfer.";
  }

  const minimumRequiredRaw = input.needsRecipientTokenAccountCreation
    ? MIN_SOL_FOR_SPL_TRANSFER_WITH_ATA_CREATION_RAW
    : MIN_SOL_FOR_TRANSACTION_FEE_RAW;

  if (solBalanceRaw < minimumRequiredRaw) {
    return input.needsRecipientTokenAccountCreation
      ? "Add a small SOL balance before sending. This transfer also needs to create the destination token account."
      : "Add a small SOL balance before sending. SPL token transfers require SOL for network fees.";
  }

  return input.needsRecipientTokenAccountCreation
    ? "This transaction uses SOL for network fees and may need extra SOL to create the destination token account."
    : "This transaction requires a small SOL balance for network fees. If the destination token account needs to be created, extra SOL is required.";
}

function normalizeRawAmount(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 0n;
  }

  return BigInt(trimmed);
}
