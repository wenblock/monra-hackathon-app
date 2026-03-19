import type { SolanaBalancesResponse } from "@/types";

const MIN_SOL_FOR_SPL_TRANSFER_RAW = 100_000n;
const MIN_SOL_FOR_SPL_TRANSFER_WITH_ATA_CREATION_RAW = 3_000_000n;

export function ensureSufficientSolForSplTransfer(input: {
  needsRecipientTokenAccountCreation: boolean;
  solBalanceRaw?: string | null;
}) {
  const solBalanceRaw = normalizeRawAmount(input.solBalanceRaw);
  const minimumRequiredRaw = input.needsRecipientTokenAccountCreation
    ? MIN_SOL_FOR_SPL_TRANSFER_WITH_ATA_CREATION_RAW
    : MIN_SOL_FOR_SPL_TRANSFER_RAW;

  if (solBalanceRaw >= minimumRequiredRaw) {
    return;
  }

  throw new Error(
    input.needsRecipientTokenAccountCreation
      ? "You need more SOL to cover network fees and create the destination token account for this transaction."
      : "You need more SOL to cover network fees for this transaction.",
  );
}

export function getSplTransferFeeHint(input: {
  balances?: SolanaBalancesResponse["balances"];
  needsRecipientTokenAccountCreation?: boolean;
}) {
  const solBalanceRaw = normalizeRawAmount(input.balances?.sol.raw);
  const minimumRequiredRaw = input.needsRecipientTokenAccountCreation
    ? MIN_SOL_FOR_SPL_TRANSFER_WITH_ATA_CREATION_RAW
    : MIN_SOL_FOR_SPL_TRANSFER_RAW;

  if (solBalanceRaw < minimumRequiredRaw) {
    return input.needsRecipientTokenAccountCreation
      ? "Add a small SOL balance before sending. This transfer also needs to create the destination token account."
      : "Add a small SOL balance before sending. SPL token transfers require SOL for network fees.";
  }

  return input.needsRecipientTokenAccountCreation
    ? "This transaction uses SOL for network fees and may need extra SOL to create the destination token account."
    : "This transaction requires a small SOL balance for network fees. If the destination token account needs to be created, extra SOL is required.";
}

export function normalizeSolanaSendError(error: unknown) {
  const details = extractSolanaSendErrorDetails(error);
  const message = details.message.toLowerCase();

  if (
    details.errorType === "malformed_transaction" ||
    message.includes("transaction simulation failed") ||
    message.includes("instructionerror:custom") ||
    message.includes("instruction error: custom")
  ) {
    return "You need more SOL to cover network fees for this transaction.";
  }

  if (
    message.includes("insufficient") &&
    (message.includes("sol") || message.includes("fee") || message.includes("fund"))
  ) {
    return "You need more SOL to cover network fees for this transaction.";
  }

  return details.message;
}

function extractSolanaSendErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const record = error as Error & {
      correlationId?: string;
      errorMessage?: string;
      errorType?: string;
    };

    return {
      correlationId: readString(record.correlationId),
      errorType: readString(record.errorType),
      message:
        readString(record.errorMessage) ??
        readString(record.message) ??
        "Unable to broadcast the Solana transaction.",
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    return {
      correlationId: readString(record.correlationId),
      errorType: readString(record.errorType),
      message:
        readString(record.errorMessage) ??
        readString(record.message) ??
        "Unable to broadcast the Solana transaction.",
    };
  }

  return {
    correlationId: null,
    errorType: null,
    message: "Unable to broadcast the Solana transaction.",
  };
}

function normalizeRawAmount(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 0n;
  }

  return BigInt(trimmed);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
