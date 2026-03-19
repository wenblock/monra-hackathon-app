import type { AppTransaction } from "./types";

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
      return "Pending";
  }
}

export function formatActivityAmount(transaction: AppTransaction) {
  const prefix = transaction.direction === "inbound" ? "+" : "-";
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
  return transaction.direction === "inbound" ? "From" : "To";
}

export function getTransactionCounterpartyDisplay(transaction: AppTransaction) {
  return (
    transaction.counterpartyName ??
    getTransactionCounterpartyWalletAddress(transaction) ??
    "Unknown wallet"
  );
}

export function getTransactionCounterpartyWalletAddress(transaction: AppTransaction) {
  return transaction.counterpartyWalletAddress ?? transaction.fromWalletAddress ?? null;
}

export function getAssetLabel(asset: AppTransaction["asset"]) {
  return asset === "sol" ? "SOL" : "USDC";
}
