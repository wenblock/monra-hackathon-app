import { getTransferAssetLabel } from "./assets";
import type { AppTransaction } from "./types";

export function isOnrampTransaction(transaction: AppTransaction) {
  return transaction.entryType === "onramp";
}

export function isOfframpTransaction(transaction: AppTransaction) {
  return transaction.entryType === "offramp";
}

export function isSwapTransaction(transaction: AppTransaction) {
  return transaction.entryType === "swap";
}

export function getTransactionDirectionTone(transaction: AppTransaction) {
  return transaction.direction === "inbound"
    ? "text-emerald-600"
    : "text-[var(--danger)]";
}

export function formatActivityTimestamp(value: string | null, now = Date.now()) {
  if (!value) {
    return "Pending";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const elapsedMs = now - timestamp;
  if (elapsedMs < 60_000) {
    return "Just now";
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;
  }

  const elapsedHours = Math.floor(elapsedMs / 3_600_000);
  if (elapsedHours < 24) {
    return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;
  }

  const elapsedDays = Math.floor(elapsedMs / 86_400_000);
  if (elapsedDays < 7) {
    return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatActivityTitle(transaction: AppTransaction) {
  if (isOnrampTransaction(transaction)) {
    return `On-ramp to ${getTransferAssetLabel(transaction.asset)}`;
  }

  if (isOfframpTransaction(transaction)) {
    return `Off-ramp to ${transaction.counterpartyName ?? "bank recipient"}`;
  }

  if (isSwapTransaction(transaction)) {
    return `Swap ${getTransferAssetLabel(transaction.asset)} → ${getTransferAssetLabel(transaction.outputAsset ?? transaction.asset)}`;
  }

  const counterpartyDisplay = getTransactionCounterpartyDisplay(transaction);

  return transaction.direction === "inbound"
    ? `Received from ${counterpartyDisplay}`
    : `Send to ${counterpartyDisplay}`;
}

export function formatActivityStatus(transaction: AppTransaction) {
  switch (transaction.status) {
    case "confirmed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return isOfframpTransaction(transaction) ? "Processing" : "Pending";
  }
}

export function formatActivityAmount(transaction: AppTransaction) {
  if (isSwapTransaction(transaction)) {
    return `-${transaction.amountDisplay} ${getAssetLabel(transaction.asset)}`;
  }

  const prefix = transaction.direction === "inbound" ? "+" : "-";
  if (isOnrampTransaction(transaction)) {
    const pendingAmount = formatPendingOnrampAmount(transaction);
    if (pendingAmount) {
      return `${prefix}${pendingAmount}`;
    }
  }

  if (isOfframpTransaction(transaction)) {
    const sourceAmount = formatOfframpSourceAmount(transaction);
    if (sourceAmount) {
      return `${prefix}${sourceAmount}`;
    }
  }

  return `${prefix}${transaction.amountDisplay} ${getAssetLabel(transaction.asset)}`;
}

export function formatActivityAbsoluteTimestamp(value: string | null) {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatCounterpartyLabel(transaction: AppTransaction) {
  if (isOnrampTransaction(transaction)) {
    return "Destination wallet";
  }

  if (isOfframpTransaction(transaction)) {
    return "Bank recipient";
  }

  if (isSwapTransaction(transaction)) {
    return "Received";
  }

  return transaction.direction === "inbound" ? "From" : "To";
}

export function getTransactionCounterpartyDisplay(transaction: AppTransaction) {
  if (isOnrampTransaction(transaction)) {
    return transaction.counterpartyName ?? "Bridge On-ramp";
  }

  if (isOfframpTransaction(transaction)) {
    return transaction.counterpartyName ?? "Bridge Off-ramp";
  }

  if (isSwapTransaction(transaction)) {
    return transaction.outputAmountDisplay && transaction.outputAsset
      ? `${transaction.outputAmountDisplay} ${getTransferAssetLabel(transaction.outputAsset)}`
      : "Quoted output";
  }

  return (
    transaction.counterpartyName ??
    getTransactionCounterpartyWalletAddress(transaction) ??
    "Unknown wallet"
  );
}

export function getTransactionCounterpartyWalletAddress(transaction: AppTransaction) {
  if (isOnrampTransaction(transaction)) {
    return transaction.trackedWalletAddress;
  }

  if (isOfframpTransaction(transaction)) {
    return transaction.bridgeSourceDepositInstructions?.toAddress ?? transaction.counterpartyWalletAddress ?? null;
  }

  if (isSwapTransaction(transaction)) {
    return transaction.trackedWalletAddress;
  }

  return transaction.counterpartyWalletAddress ?? transaction.fromWalletAddress ?? null;
}

export function getAssetLabel(asset: AppTransaction["asset"]) {
  return getTransferAssetLabel(asset);
}

function formatPendingOnrampAmount(transaction: AppTransaction) {
  if (transaction.status === "confirmed") {
    return null;
  }

  if (!transaction.bridgeSourceAmount) {
    return null;
  }

  return transaction.bridgeSourceCurrency
    ? `${transaction.bridgeSourceAmount} ${transaction.bridgeSourceCurrency.toUpperCase()}`
    : transaction.bridgeSourceAmount;
}

function formatOfframpSourceAmount(transaction: AppTransaction) {
  if (!transaction.bridgeSourceAmount) {
    return null;
  }

  return transaction.bridgeSourceCurrency
    ? `${transaction.bridgeSourceAmount} ${transaction.bridgeSourceCurrency.toUpperCase()}`
    : transaction.bridgeSourceAmount;
}

export function getTransactionExplorerSignature(transaction: AppTransaction) {
  if (isOnrampTransaction(transaction)) {
    return transaction.bridgeDestinationTxHash ?? null;
  }

  if (isOfframpTransaction(transaction)) {
    return transaction.transactionSignature === transaction.bridgeTransferId
      ? null
      : transaction.transactionSignature;
  }

  return transaction.transactionSignature;
}
