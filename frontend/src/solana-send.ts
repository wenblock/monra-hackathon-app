import type { SolanaBalancesResponse, TransferAsset } from "@/types";

const MIN_SOL_FOR_TRANSACTION_FEE_RAW = 100_000n;
const MIN_SOL_FOR_SPL_TRANSFER_WITH_ATA_CREATION_RAW = 3_000_000n;

type SolanaSendContext = {
  asset: TransferAsset;
  amountRaw?: bigint;
  needsRecipientTokenAccountCreation?: boolean;
};

export function ensureSufficientSolForTransfer(input: SolanaSendContext & {
  solBalanceRaw?: string | null;
}) {
  const solBalanceRaw = normalizeRawAmount(input.solBalanceRaw);

  if (input.asset === "sol") {
    const amountRaw = input.amountRaw ?? 0n;
    if (solBalanceRaw - amountRaw >= MIN_SOL_FOR_TRANSACTION_FEE_RAW) {
      return;
    }

    throw new Error(getSolanaFeeMessage(input));
  }

  const minimumRequiredRaw = getMinimumRequiredSolRaw(input);
  if (solBalanceRaw >= minimumRequiredRaw) {
    return;
  }

  throw new Error(getSolanaFeeMessage(input));
}

export function getSolanaTransferFeeHint(input: SolanaSendContext & {
  balances?: SolanaBalancesResponse["balances"];
}) {
  const solBalanceRaw = normalizeRawAmount(input.balances?.sol.raw);

  if (input.asset === "sol") {
    return solBalanceRaw < MIN_SOL_FOR_TRANSACTION_FEE_RAW
      ? "Add more SOL before sending. Native SOL transfers still need a small balance for network fees."
      : "Leave a small SOL balance in the wallet for network fees after this transfer.";
  }

  const minimumRequiredRaw = getMinimumRequiredSolRaw(input);
  if (solBalanceRaw < minimumRequiredRaw) {
    return input.needsRecipientTokenAccountCreation
      ? "Add a small SOL balance before sending. This transfer also needs to create the destination token account."
      : "Add a small SOL balance before sending. SPL token transfers require SOL for network fees.";
  }

  return input.needsRecipientTokenAccountCreation
    ? "This transaction uses SOL for network fees and may need extra SOL to create the destination token account."
    : "This transaction requires a small SOL balance for network fees. If the destination token account needs to be created, extra SOL is required.";
}

export function normalizeSolanaSendError(error: unknown, context: SolanaSendContext) {
  const details = extractSolanaSendErrorDetails(error);
  const message = details.message.toLowerCase();
  const errorType = details.errorType?.toLowerCase() ?? "";

  if (
    errorType === "malformed_transaction" ||
    message.includes("transaction simulation failed") ||
    message.includes("instructionerror:custom") ||
    message.includes("instruction error: custom")
  ) {
    return getSolanaFeeMessage(context);
  }

  if (
    message.includes("insufficient") &&
    (message.includes("sol") || message.includes("fee") || message.includes("fund"))
  ) {
    return getSolanaFeeMessage(context);
  }

  return details.message;
}

function extractSolanaSendErrorDetails(error: unknown) {
  const visited = new Set<object>();
  const queue: unknown[] = [error];
  let correlationId: string | null = null;
  let errorType: string | null = null;
  let message: string | null = null;

  while (queue.length > 0) {
    const current = queue.shift();
    if (typeof current === "string") {
      message ??= readString(current);
      continue;
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const record = current as Record<string, unknown>;
    correlationId ??= readString(record.correlationId);
    errorType ??= readString(record.errorType);
    message ??= readString(record.errorMessage) ?? readString(record.message);

    if (current instanceof Error) {
      const cause = (current as Error & { cause?: unknown }).cause;
      if (cause !== undefined) {
        queue.push(cause);
      }
    }

    pushIfObject(queue, record.cause);
    pushIfObject(queue, record.error);
    pushIfObject(queue, record.data);
    pushIfObject(queue, record.response);

    const response = record.response;
    if (response && typeof response === "object") {
      pushIfObject(queue, (response as Record<string, unknown>).data);
      pushIfObject(queue, (response as Record<string, unknown>).error);
    }

    const data = record.data;
    if (data && typeof data === "object") {
      pushIfObject(queue, (data as Record<string, unknown>).error);
    }
  }

  return {
    correlationId,
    errorType,
    message: message ?? "Unable to broadcast the Solana transaction.",
  };
}

function getMinimumRequiredSolRaw(input: Pick<SolanaSendContext, "needsRecipientTokenAccountCreation">) {
  return input.needsRecipientTokenAccountCreation
    ? MIN_SOL_FOR_SPL_TRANSFER_WITH_ATA_CREATION_RAW
    : MIN_SOL_FOR_TRANSACTION_FEE_RAW;
}

function getSolanaFeeMessage(input: Pick<SolanaSendContext, "asset" | "needsRecipientTokenAccountCreation">) {
  if (input.asset === "sol") {
    return "Leave a small SOL balance for network fees. Reduce the send amount slightly.";
  }

  return input.needsRecipientTokenAccountCreation
    ? "You need more SOL to cover network fees and create the destination token account for this transaction."
    : "You need more SOL to cover network fees for this transaction.";
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

function pushIfObject(queue: unknown[], value: unknown) {
  if (value && typeof value === "object") {
    queue.push(value);
  }
}
