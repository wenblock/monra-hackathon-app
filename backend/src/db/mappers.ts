import {
  TRANSFER_ASSETS,
  getTransferAssetDecimals,
} from "../lib/assets.js";
import {
  formatAssetAmount,
} from "../lib/amounts.js";
import type {
  AppTransaction,
  AppUser,
  BridgeSourceDepositInstructions,
  Recipient,
  SolanaBalancesResponse,
  TransferAsset,
} from "../types.js";
import type {
  LedgerTransaction,
  PaginatedTransactionRow,
  RecipientRow,
  TransactionRow,
  UserBalanceRow,
  UserRow,
} from "./rows.js";
import { userBalanceColumns } from "./rows.js";

export interface TransactionPageCursor {
  id: number;
  sortAt: string;
}

export interface ListTransactionsOptions {
  cursor?: string | null;
  limit?: number;
}

export interface ListTransactionsResult {
  nextCursor: string | null;
  transactions: AppTransaction[];
}

export function mapUser(row: UserRow): AppUser {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    cdpUserId: row.cdp_user_id,
    email: row.email,
    accountType: row.account_type,
    fullName: row.full_name,
    countryCode: row.country_code,
    countryName: row.country_name,
    businessName: row.business_name,
    solanaAddress: row.solana_address,
    bridgeKycLinkId: row.bridge_kyc_link_id,
    bridgeKycLink: row.bridge_kyc_link,
    bridgeTosLink: row.bridge_tos_link,
    bridgeKycStatus: row.bridge_kyc_status,
    bridgeTosStatus: row.bridge_tos_status,
    bridgeCustomerId: row.bridge_customer_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function mapRecipient(row: RecipientRow): Recipient {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    userId: Number(row.user_id),
    kind: row.kind,
    displayName: row.display_name,
    bankRecipientType: row.bank_recipient_type,
    walletAddress: row.wallet_address,
    bankCountryCode: row.bank_country_code,
    bankName: row.bank_name,
    iban: row.iban,
    bic: row.bic,
    firstName: row.first_name,
    lastName: row.last_name,
    businessName: row.business_name,
    bridgeExternalAccountId: row.bridge_external_account_id,
    lastPaymentAt: row.last_payment_at ? row.last_payment_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function mapBridgeSourceDepositInstructions(value: unknown): BridgeSourceDepositInstructions | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const readString = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }

    return null;
  };

  return {
    paymentRail: readString("paymentRail", "payment_rail"),
    amount: readString("amount"),
    currency: readString("currency"),
    depositMessage: readString("depositMessage", "deposit_message"),
    fromAddress: readString("fromAddress", "from_address"),
    toAddress: readString("toAddress", "to_address"),
    blockchainMemo: readString("blockchainMemo", "blockchain_memo"),
    bankName: readString("bankName", "bank_name"),
    bankAddress: readString("bankAddress", "bank_address"),
    iban: readString("iban"),
    bic: readString("bic"),
    accountHolderName: readString("accountHolderName", "account_holder_name"),
    bankRoutingNumber: readString("bankRoutingNumber", "bank_routing_number"),
    bankAccountNumber: readString("bankAccountNumber", "bank_account_number"),
    bankBeneficiaryName: readString("bankBeneficiaryName", "bank_beneficiary_name"),
    bankBeneficiaryAddress: readString("bankBeneficiaryAddress", "bank_beneficiary_address"),
  };
}

export function mapLedgerTransaction(row: TransactionRow): LedgerTransaction {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    userId: Number(row.user_id),
    recipientId: row.recipient_id === null ? null : Number(row.recipient_id),
    direction: row.direction,
    entryType: row.entry_type,
    asset: row.asset,
    amountDecimal: row.amount_decimal,
    amountRaw: row.amount_raw,
    network: row.network,
    trackedWalletAddress: row.tracked_wallet_address,
    fromWalletAddress: row.from_wallet_address,
    counterpartyName: row.counterparty_name,
    counterpartyWalletAddress: row.counterparty_wallet_address,
    bridgeTransferId: row.bridge_transfer_id,
    bridgeTransferStatus: row.bridge_transfer_status,
    bridgeSourceAmount: row.bridge_source_amount,
    bridgeSourceCurrency: row.bridge_source_currency,
    bridgeSourceDepositInstructions: mapBridgeSourceDepositInstructions(
      row.bridge_source_deposit_instructions,
    ),
    bridgeDestinationTxHash: row.bridge_destination_tx_hash,
    bridgeReceiptUrl: row.bridge_receipt_url,
    outputAsset: row.output_asset,
    outputAmountDecimal: row.output_amount_decimal,
    outputAmountRaw: row.output_amount_raw,
    transactionSignature: row.transaction_signature,
    status: row.status,
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
    failedAt: row.failed_at ? row.failed_at.toISOString() : null,
    failureReason: row.failure_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createEmptyBalance(decimals: number) {
  return {
    formatted: formatTokenAmount("0", decimals),
    raw: "0",
  };
}

export function formatTokenAmount(rawAmount: string, decimals: number) {
  const isNegative = rawAmount.startsWith("-");
  const unsignedAmount = isNegative ? rawAmount.slice(1) : rawAmount;
  const normalizedAmount = unsignedAmount.replace(/^0+/, "") || "0";

  if (decimals === 0) {
    return `${isNegative ? "-" : ""}${normalizedAmount}`;
  }

  const paddedAmount = normalizedAmount.padStart(decimals + 1, "0");
  const whole = paddedAmount.slice(0, -decimals);
  const fraction = paddedAmount.slice(-decimals).replace(/0+$/, "");

  return `${isNegative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function mapBalances(row: UserBalanceRow): SolanaBalancesResponse["balances"] {
  return Object.fromEntries(
    TRANSFER_ASSETS.map(asset => {
      const raw = row[userBalanceColumns[asset]];
      return [
        asset,
        {
          formatted: formatTokenAmount(raw, getTransferAssetDecimals(asset)),
          raw,
        },
      ];
    }),
  ) as SolanaBalancesResponse["balances"];
}

export function collapseLedgerTransactions(rows: TransactionRow[]) {
  const ledgerTransactions = rows.map(mapLedgerTransaction);
  const groupedTransactions = new Map<
    string,
    {
      feeRaw: bigint;
      transfers: LedgerTransaction[];
    }
  >();

  for (const transaction of ledgerTransactions) {
    const key = `${transaction.transactionSignature}:${transaction.trackedWalletAddress}`;
    const group = groupedTransactions.get(key) ?? {
      feeRaw: 0n,
      transfers: [],
    };

    if (transaction.entryType === "network_fee" && transaction.direction === "outbound") {
      group.feeRaw += BigInt(transaction.amountRaw);
    } else if (
      transaction.entryType === "transfer" ||
      transaction.entryType === "onramp" ||
      transaction.entryType === "offramp" ||
      transaction.entryType === "swap"
    ) {
      group.transfers.push(transaction);
    }

    groupedTransactions.set(key, group);
  }

  const collapsedTransactions: AppTransaction[] = [];

  for (const group of groupedTransactions.values()) {
    if (group.transfers.length === 0) {
      continue;
    }

    let feeAttached = false;
    const feeRaw = group.feeRaw > 0n ? group.feeRaw.toString() : null;
    const feeDisplay = feeRaw ? formatTokenAmount(feeRaw, 9) : null;

    for (const transfer of group.transfers) {
      const shouldAttachFee = !feeAttached && transfer.direction === "outbound" && feeRaw !== null;

      collapsedTransactions.push(
        mapCollapsedTransaction(transfer, shouldAttachFee ? { raw: feeRaw, display: feeDisplay } : null),
      );

      if (shouldAttachFee) {
        feeAttached = true;
      }
    }
  }

  collapsedTransactions.sort(compareTransactionsByMostRecent);

  return collapsedTransactions;
}

export function mapCollapsedTransaction(
  transaction: LedgerTransaction,
  fee:
    | {
        raw: string | null;
        display: string | null;
      }
    | null,
): AppTransaction {
  return {
    ...transaction,
    amountDecimal: formatAssetAmount(transaction.amountRaw, transaction.asset),
    amountDisplay: formatAssetAmount(transaction.amountRaw, transaction.asset),
    outputAmountDisplay:
      transaction.outputAmountRaw && transaction.outputAsset
        ? formatAssetAmount(transaction.outputAmountRaw, transaction.outputAsset)
        : null,
    networkFeeRaw: fee?.raw ?? null,
    networkFeeDisplay: fee?.display ?? null,
  };
}

export function paginateTransactions(
  transactions: AppTransaction[],
  options: ListTransactionsOptions,
): ListTransactionsResult {
  const limit = normalizeTransactionLimit(options.limit);
  const startIndex = findTransactionStartIndex(transactions, options.cursor);
  const page = transactions.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < transactions.length;

  return {
    nextCursor: hasMore && page.length > 0 ? encodeTransactionCursor(page[page.length - 1]) : null,
    transactions: page,
  };
}

export function normalizeTransactionLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit || limit < 1) {
    return 20;
  }

  return Math.min(Math.trunc(limit), 100);
}

export function findTransactionStartIndex(transactions: AppTransaction[], cursor?: string | null) {
  const parsedCursor = decodeTransactionCursor(cursor);
  if (!parsedCursor) {
    return 0;
  }

  const index = transactions.findIndex(transaction => {
    const sortAt = getTransactionSortTimestamp(transaction);
    return sortAt === parsedCursor.sortAt && transaction.id === parsedCursor.id;
  });

  return index === -1 ? 0 : index + 1;
}

export function compareTransactionsByMostRecent(left: AppTransaction, right: AppTransaction) {
  const leftTimestamp = Date.parse(getTransactionSortTimestamp(left));
  const rightTimestamp = Date.parse(getTransactionSortTimestamp(right));

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return right.id - left.id;
}

export function getTransactionSortTimestamp(transaction: Pick<AppTransaction, "confirmedAt" | "createdAt">) {
  return transaction.confirmedAt ?? transaction.createdAt;
}

export function encodeTransactionCursor(transaction: AppTransaction) {
  const payload: TransactionPageCursor = {
    id: transaction.id,
    sortAt: getTransactionSortTimestamp(transaction),
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function encodeTransactionCursorFromRow(row: Pick<PaginatedTransactionRow, "id" | "sort_at">) {
  const payload: TransactionPageCursor = {
    id: Number(row.id),
    sortAt: row.sort_at.toISOString(),
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeTransactionCursor(cursor?: string | null): TransactionPageCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const id = "id" in parsed ? parsed.id : null;
    const sortAt = "sortAt" in parsed ? parsed.sortAt : null;

    if (typeof id !== "number" || !Number.isFinite(id) || typeof sortAt !== "string" || !sortAt) {
      return null;
    }

    return {
      id,
      sortAt,
    };
  } catch {
    return null;
  }
}

export function getAttachedFeeForPaginatedRow(
  row: Pick<PaginatedTransactionRow, "direction" | "fee_rank" | "fee_raw">,
) {
  if (row.direction !== "outbound" || row.fee_raw === null || Number.parseInt(row.fee_rank, 10) !== 1) {
    return null;
  }

  return {
    display: formatTokenAmount(row.fee_raw, 9),
    raw: row.fee_raw,
  };
}
