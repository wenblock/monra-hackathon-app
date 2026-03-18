import type { AppTransaction } from "./types";

export function formatActivityTimestamp(value: string | null) {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatActivityTitle(transaction: AppTransaction) {
  return transaction.direction === "inbound" ? "Received" : "Send";
}

export function formatActivitySubtitle(transaction: AppTransaction) {
  const baseSubtitle =
    transaction.direction === "inbound"
      ? `From ${
          transaction.counterpartyName ??
          transaction.counterpartyWalletAddress ??
          transaction.fromWalletAddress
        }`
      : `To ${transaction.counterpartyName ?? transaction.counterpartyWalletAddress ?? "Unknown wallet"}`;

  if (transaction.direction === "outbound" && transaction.networkFeeDisplay) {
    return `${baseSubtitle} | Fee ${transaction.networkFeeDisplay} SOL`;
  }

  return baseSubtitle;
}

export function formatActivityAmount(transaction: AppTransaction) {
  const prefix = transaction.direction === "inbound" ? "+" : "-";
  return `${prefix}${transaction.amountDisplay} ${getAssetLabel(transaction.asset)}`;
}

export function getAssetLabel(asset: AppTransaction["asset"]) {
  return asset === "sol" ? "SOL" : "USDC";
}
