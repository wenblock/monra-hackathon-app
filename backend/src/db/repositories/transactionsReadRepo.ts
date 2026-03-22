import type { OfframpSourceAsset } from "../../types.js";
import {
  decodeTransactionCursor,
  encodeTransactionCursorFromRow,
  getAttachedFeeForPaginatedRow,
  mapCollapsedTransaction,
  mapLedgerTransaction,
  normalizeTransactionLimit,
  type ListTransactionsOptions,
  type ListTransactionsResult,
} from "../mappers.js";
import { pool } from "../pool.js";
import {
  transactionSelection,
  type PaginatedTransactionRow,
  type PendingBridgeTransactionRow,
  type PendingOfframpMatchRow,
  type PendingOnrampMatchRow,
} from "../rows.js";

export type { ListTransactionsOptions, ListTransactionsResult } from "../mappers.js";

export async function listTransactionsByUserIdPaginated(
  userId: number,
  options: ListTransactionsOptions = {},
): Promise<ListTransactionsResult> {
  const limit = normalizeTransactionLimit(options.limit);
  const cursor = decodeTransactionCursor(options.cursor);
  const limitParameterPosition = cursor ? 4 : 2;
  const cursorClause = cursor
    ? `
      AND (
        sort_at < $2::timestamptz
        OR (
          sort_at = $2::timestamptz
          AND id < $3::bigint
        )
      )
    `
    : "";
  const result = await pool.query<PaginatedTransactionRow>(
    `
      WITH fee_totals AS (
        SELECT
          transaction_signature,
          tracked_wallet_address,
          SUM((amount_raw)::NUMERIC)::TEXT AS fee_raw
        FROM transactions
        WHERE user_id = $1
          AND entry_type = 'network_fee'
          AND direction = 'outbound'
        GROUP BY transaction_signature, tracked_wallet_address
      ),
      ranked_entries AS (
        SELECT
          t.*,
          fee_totals.fee_raw,
          ROW_NUMBER() OVER (
            PARTITION BY t.transaction_signature, t.tracked_wallet_address
            ORDER BY
              CASE WHEN t.direction = 'outbound' THEN 0 ELSE 1 END,
              COALESCE(t.confirmed_at, t.created_at) DESC,
              t.id DESC
          ) AS fee_rank,
          COALESCE(t.confirmed_at, t.created_at) AS sort_at
        FROM transactions t
        LEFT JOIN fee_totals
          ON fee_totals.transaction_signature = t.transaction_signature
          AND fee_totals.tracked_wallet_address = t.tracked_wallet_address
        WHERE t.user_id = $1
          AND t.entry_type IN ('transfer', 'onramp', 'offramp', 'swap')
      )
      SELECT
        *
      FROM ranked_entries
      WHERE 1 = 1
        ${cursorClause}
      ORDER BY sort_at DESC, id DESC
      LIMIT $${limitParameterPosition}
    `,
    cursor ? [userId, cursor.sortAt, cursor.id, limit + 1] : [userId, limit + 1],
  );

  const hasMore = result.rows.length > limit;
  const pageRows = result.rows.slice(0, limit);
  const transactions = pageRows.map(row =>
    mapCollapsedTransaction(mapLedgerTransaction(row), getAttachedFeeForPaginatedRow(row)),
  );
  const lastRow = pageRows[pageRows.length - 1];

  return {
    nextCursor: hasMore && lastRow ? encodeTransactionCursorFromRow(lastRow) : null,
    transactions,
  };
}

export async function getSwapTransactionUserIdsBySignature(signature: string) {
  const result = await pool.query<{ user_id: string }>(
    `
      SELECT DISTINCT user_id
      FROM transactions
      WHERE entry_type = 'swap'
        AND transaction_signature = $1::text
    `,
    [signature],
  );

  return result.rows.map(row => Number(row.user_id));
}

export async function getPendingOnrampByDestinationTxHash(txHash: string) {
  const result = await pool.query<PendingOnrampMatchRow>(
    `
      SELECT id, user_id, tracked_wallet_address, bridge_transfer_id, asset
      FROM transactions
      WHERE entry_type = 'onramp'
        AND status = 'pending'
        AND bridge_destination_tx_hash = $1
      LIMIT 1
    `,
    [txHash],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    asset: row.asset,
    bridgeTransferId: row.bridge_transfer_id,
    trackedWalletAddress: row.tracked_wallet_address,
    userId: Number(row.user_id),
  };
}

export async function getOfframpByBroadcastDetails(input: {
  amountRaw: string;
  asset: OfframpSourceAsset;
  trackedWalletAddress: string;
  userId: number;
  walletAddress: string | null;
}) {
  if (!input.walletAddress) {
    return null;
  }

  const result = await pool.query<PendingOfframpMatchRow>(
    `
      SELECT id, user_id, asset, tracked_wallet_address, recipient_id, transaction_signature, status
      FROM transactions
      WHERE entry_type = 'offramp'
        AND status IN ('pending', 'confirmed')
        AND user_id = $1::bigint
        AND asset = $2::text
        AND amount_raw = $3::text
        AND tracked_wallet_address = $4::text
        AND COALESCE(
          bridge_source_deposit_instructions ->> 'toAddress',
          bridge_source_deposit_instructions ->> 'to_address'
        ) = $5::text
      ORDER BY
        CASE WHEN transaction_signature = bridge_transfer_id THEN 0 ELSE 1 END,
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        id DESC
      LIMIT 1
    `,
    [
      input.userId,
      input.asset,
      input.amountRaw,
      input.trackedWalletAddress,
      input.walletAddress,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    asset: row.asset,
    id: Number(row.id),
    recipientId: row.recipient_id === null ? null : Number(row.recipient_id),
    status: row.status,
    trackedWalletAddress: row.tracked_wallet_address,
    transactionSignature: row.transaction_signature,
    userId: Number(row.user_id),
  };
}

export async function listStalePendingBridgeTransactions() {
  const result = await pool.query<PendingBridgeTransactionRow>(
    `
      SELECT id, user_id, entry_type, bridge_transfer_id, created_at, updated_at
      FROM transactions
      WHERE entry_type IN ('onramp', 'offramp')
        AND status = 'pending'
        AND bridge_transfer_id IS NOT NULL
        AND updated_at < NOW() - INTERVAL '15 minutes'
      ORDER BY updated_at ASC, id ASC
    `,
  );

  return result.rows.map(row => ({
    bridgeTransferId: row.bridge_transfer_id,
    createdAt: row.created_at.toISOString(),
    entryType: row.entry_type,
    id: Number(row.id),
    updatedAt: row.updated_at.toISOString(),
    userId: Number(row.user_id),
  }));
}
