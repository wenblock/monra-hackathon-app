import type { PoolClient } from "pg";

import { isOfframpSourceAsset, isOnrampDestinationAsset, isYieldAsset } from "../../lib/assets.js";
import { parseDecimalAmountToRaw } from "../../lib/amounts.js";
import type {
  BridgeTransferState,
  OfframpSourceAsset,
  OnrampDestinationAsset,
  TransactionDirection,
  TransactionEntryType,
  TransactionStatus,
  TransferAsset,
} from "../../types.js";
import { withTransaction } from "../tx.js";
import {
  transactionSelection,
  type ConfirmedTransferReconciliationRow,
  type PendingOfframpMatchRow,
  type PendingOnrampMatchRow,
  type TransactionRow,
} from "../rows.js";
import {
  addBalanceDelta,
  applyBalanceDeltas,
  applyRecipientLastPayments,
} from "./transactionsWriteRepo.js";
import { applyYieldPositionAction, getYieldPositionByUserIdWithClient } from "./yieldPositionsRepo.js";
import { markUsdcYieldCurrentPositionCacheStale } from "../../lib/yieldPortfolioCache.js";

export interface WebhookLedgerEntryInput {
  userId: number;
  recipientId: number | null;
  direction: TransactionDirection;
  entryType: TransactionEntryType;
  asset: TransferAsset;
  amountDecimal: string;
  amountRaw: string;
  trackedWalletAddress: string;
  fromWalletAddress: string;
  counterpartyName?: string | null;
  counterpartyWalletAddress?: string | null;
  transactionSignature: string;
  normalizationKey: string;
  webhookEventId: string;
  confirmedAt: Date;
}

export interface AlchemyOnrampCompletionEffectInput {
  type: "onramp_completion";
  txHash: string;
  amountDecimal: string;
  amountRaw: string;
  fromWalletAddress: string;
  counterpartyName?: string | null;
  counterpartyWalletAddress?: string | null;
  confirmedAt: Date;
}

export interface AlchemyOfframpBroadcastEffectInput {
  type: "offramp_broadcast";
  transactionId: number;
  txHash: string;
  amountDecimal: string;
  amountRaw: string;
  fromWalletAddress: string;
  toWalletAddress?: string | null;
  confirmedAt: Date;
}

export type AlchemyWebhookEffectInput =
  | {
      type: "ledger";
      entry: WebhookLedgerEntryInput;
    }
  | AlchemyOnrampCompletionEffectInput
  | AlchemyOfframpBroadcastEffectInput;

function collectOnrampReconciliationTxHashes(effects: AlchemyWebhookEffectInput[]) {
  const txHashes = new Set<string>();

  for (const effect of effects) {
    if (effect.type === "onramp_completion") {
      txHashes.add(effect.txHash);
      continue;
    }

    if (
      effect.type === "ledger" &&
      effect.entry.entryType === "transfer" &&
      effect.entry.direction === "inbound" &&
      isOnrampDestinationAsset(effect.entry.asset)
    ) {
      txHashes.add(effect.entry.transactionSignature);
    }
  }

  return txHashes;
}

async function reconcilePendingOnrampWithConfirmedTransfer(client: PoolClient, txHash: string) {
  const pendingOnrampResult = await client.query<PendingOnrampMatchRow>(
    `
      SELECT id, user_id, tracked_wallet_address, bridge_transfer_id, status, asset
      FROM transactions
      WHERE entry_type = 'onramp'
        AND bridge_destination_tx_hash = $1::text
        AND status IN ('pending', 'confirmed')
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [txHash],
  );

  const pendingOnramp = pendingOnrampResult.rows[0];
  if (!pendingOnramp) {
    return null;
  }

  const confirmedTransferResult = await client.query<ConfirmedTransferReconciliationRow>(
    `
      SELECT
        id,
        user_id,
        tracked_wallet_address,
        amount_decimal,
        amount_raw,
        confirmed_at,
        from_wallet_address,
        counterparty_name,
        counterparty_wallet_address,
        transaction_signature
      FROM transactions
      WHERE entry_type = 'transfer'
        AND status = 'confirmed'
        AND direction = 'inbound'
        AND asset = $4::text
        AND transaction_signature = $1::text
        AND user_id = $2::bigint
        AND tracked_wallet_address = $3::text
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [txHash, pendingOnramp.user_id, pendingOnramp.tracked_wallet_address, pendingOnramp.asset],
  );

  const confirmedTransfer = confirmedTransferResult.rows[0];
  if (!confirmedTransfer) {
    return null;
  }

  if (pendingOnramp.status === "confirmed") {
    await client.query(
      `
        DELETE FROM transactions
        WHERE id = $1::bigint
      `,
      [confirmedTransfer.id],
    );

    return Number(pendingOnramp.user_id);
  }

  const updatedOnramp = await client.query<TransactionRow>(
    `
      UPDATE transactions
      SET
        status = 'confirmed',
        confirmed_at = COALESCE($2::timestamptz, confirmed_at),
        failed_at = NULL,
        failure_reason = NULL,
        amount_decimal = $3::numeric,
        amount_raw = $4::text,
        bridge_transfer_status = 'payment_processed',
        transaction_signature = $1::text,
        from_wallet_address = $5::text,
        counterparty_name = COALESCE($6::text, counterparty_name),
        counterparty_wallet_address = COALESCE($7::text, counterparty_wallet_address),
        updated_at = NOW()
      WHERE id = $8::bigint
      RETURNING ${transactionSelection}
    `,
    [
      confirmedTransfer.transaction_signature,
      confirmedTransfer.confirmed_at,
      confirmedTransfer.amount_decimal,
      confirmedTransfer.amount_raw,
      confirmedTransfer.from_wallet_address,
      confirmedTransfer.counterparty_name ?? null,
      confirmedTransfer.counterparty_wallet_address ?? null,
      pendingOnramp.id,
    ],
  );

  await client.query(
    `
      DELETE FROM transactions
      WHERE id = $1::bigint
    `,
    [confirmedTransfer.id],
  );

  const row = updatedOnramp.rows[0];
  return row ? Number(row.user_id) : Number(pendingOnramp.user_id);
}

async function deleteDuplicateConfirmedTransferForOnramp(
  client: PoolClient,
  input: {
    asset: OnrampDestinationAsset;
    txHash: string;
    trackedWalletAddress: string;
    userId: number;
  },
) {
  const duplicateTransferResult = await client.query<{ id: string }>(
    `
      SELECT id
      FROM transactions
      WHERE entry_type = 'transfer'
        AND status = 'confirmed'
        AND direction = 'inbound'
        AND asset = $4::text
        AND transaction_signature = $1::text
        AND user_id = $2::bigint
        AND tracked_wallet_address = $3::text
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [input.txHash, input.userId, input.trackedWalletAddress, input.asset],
  );

  const duplicateTransfer = duplicateTransferResult.rows[0];
  if (!duplicateTransfer) {
    return false;
  }

  await client.query(
    `
      DELETE FROM transactions
      WHERE id = $1::bigint
    `,
    [duplicateTransfer.id],
  );

  return true;
}

async function deleteDuplicateConfirmedTransferForOfframp(
  client: PoolClient,
  input: {
    asset: OfframpSourceAsset;
    txHash: string;
    trackedWalletAddress: string;
    userId: number;
  },
) {
  const duplicateTransferResult = await client.query<{ id: string }>(
    `
      SELECT id
      FROM transactions
      WHERE entry_type = 'transfer'
        AND status = 'confirmed'
        AND direction = 'outbound'
        AND asset = $4::text
        AND transaction_signature = $1::text
        AND user_id = $2::bigint
        AND tracked_wallet_address = $3::text
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [input.txHash, input.userId, input.trackedWalletAddress, input.asset],
  );

  const duplicateTransfer = duplicateTransferResult.rows[0];
  if (!duplicateTransfer) {
    return false;
  }

  await client.query(
    `
      DELETE FROM transactions
      WHERE id = $1::bigint
    `,
    [duplicateTransfer.id],
  );

  return true;
}

async function reconcilePendingOnrampWithConfirmedTransferByTxHash(txHash: string) {
  return withTransaction(client => reconcilePendingOnrampWithConfirmedTransfer(client, txHash));
}

async function insertConfirmedLedgerEntry(client: PoolClient, entry: WebhookLedgerEntryInput) {
  const result = await client.query<TransactionRow>(
    `
      INSERT INTO transactions (
        user_id,
        recipient_id,
        direction,
        entry_type,
        asset,
        amount_decimal,
        amount_raw,
        network,
        tracked_wallet_address,
        from_wallet_address,
        counterparty_name,
        counterparty_wallet_address,
        transaction_signature,
        webhook_event_id,
        normalization_key,
        status,
        confirmed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'solana-mainnet', $8, $9, $10, $11, $12, $13, $14,
        'confirmed', $15
      )
      ON CONFLICT (normalization_key) DO NOTHING
      RETURNING ${transactionSelection}
    `,
    [
      entry.userId,
      entry.recipientId,
      entry.direction,
      entry.entryType,
      entry.asset,
      entry.amountDecimal,
      entry.amountRaw,
      entry.trackedWalletAddress,
      entry.fromWalletAddress,
      entry.counterpartyName ?? null,
      entry.counterpartyWalletAddress ?? null,
      entry.transactionSignature,
      entry.webhookEventId,
      entry.normalizationKey,
      entry.confirmedAt,
    ],
  );

  return result.rows[0] ?? null;
}

async function applyOfframpBroadcastEffect(
  client: PoolClient,
  effect: AlchemyOfframpBroadcastEffectInput,
) {
  const existingResult = await client.query<PendingOfframpMatchRow>(
    `
      SELECT id, user_id, asset, tracked_wallet_address, recipient_id, transaction_signature, status
      FROM transactions
      WHERE id = $1::bigint
        AND entry_type = 'offramp'
      LIMIT 1
      FOR UPDATE
    `,
    [effect.transactionId],
  );

  const existing = existingResult.rows[0];
  if (!existing || !isOfframpSourceAsset(existing.asset)) {
    return null;
  }

  const alreadyBroadcasted = existing.transaction_signature === effect.txHash;
  const updated = await client.query<TransactionRow>(
    `
      UPDATE transactions
      SET
        transaction_signature = $2::text,
        from_wallet_address = $3::text,
        amount_decimal = $4::numeric,
        amount_raw = $5::text,
        counterparty_wallet_address = COALESCE($6::text, counterparty_wallet_address),
        updated_at = NOW()
      WHERE id = $1::bigint
      RETURNING ${transactionSelection}
    `,
    [
      effect.transactionId,
      effect.txHash,
      effect.fromWalletAddress,
      effect.amountDecimal,
      effect.amountRaw,
      effect.toWalletAddress ?? null,
    ],
  );

  const row = updated.rows[0];
  if (!row || !isOfframpSourceAsset(row.asset)) {
    return null;
  }

  const removedDuplicateTransfer = await deleteDuplicateConfirmedTransferForOfframp(client, {
    asset: row.asset,
    trackedWalletAddress: row.tracked_wallet_address,
    txHash: effect.txHash,
    userId: Number(row.user_id),
  });

  return {
    alreadyBroadcasted,
    removedDuplicateTransfer,
    row,
  };
}

const bridgeFailureStates = new Set<BridgeTransferState>([
  "undeliverable",
  "returned",
  "missing_return_policy",
  "refunded",
  "canceled",
  "error",
]);

export async function applyBridgeTransferWebhookUpdate(input: {
  eventId: string;
  webhookId: string;
  eventObjectId: string;
  bridgeTransferId: string;
  bridgeTransferStatus: BridgeTransferState;
  bridgeDestinationTxHash?: string | null;
  destinationAmountDecimal?: string | null;
  receiptUrl?: string | null;
  eventCreatedAt?: Date | null;
}) {
  const bridgeDestinationTxHash = input.bridgeDestinationTxHash ?? null;
  const result = await withTransaction(async client => {
    const processed = await client.query<{ event_id: string }>(
      `
        INSERT INTO processed_bridge_webhook_events (event_id, webhook_id, event_object_id, event_created_at)
        VALUES ($1::text, $2::text, $3::text, $4::timestamptz)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `,
      [input.eventId, input.webhookId, input.eventObjectId, input.eventCreatedAt ?? null],
    );

    if (!processed.rows[0]) {
      return {
        affectedUserIds: new Set<number>(),
        applied: false,
      };
    }

    const nextAmountDecimal =
      typeof input.destinationAmountDecimal === "string" && input.destinationAmountDecimal.trim().length > 0
        ? input.destinationAmountDecimal.trim()
        : null;
    const nextAmountRaw = nextAmountDecimal ? parseDecimalAmountToRaw(nextAmountDecimal, 6) : null;
    const shouldMarkFailed = bridgeFailureStates.has(input.bridgeTransferStatus);
    const shouldConfirmOfframp = input.bridgeTransferStatus === "payment_processed";

    const updateResult = await client.query<TransactionRow>(
      `
        UPDATE transactions
        SET
          bridge_transfer_status = $2::text,
          bridge_destination_tx_hash = CASE
            WHEN entry_type = 'onramp' AND $3::text IS NOT NULL AND status <> 'confirmed' THEN $3::text
            ELSE bridge_destination_tx_hash
          END,
          bridge_receipt_url = COALESCE($4::text, bridge_receipt_url),
          amount_decimal = CASE
            WHEN entry_type = 'onramp' AND $5::numeric IS NOT NULL THEN $5::numeric
            ELSE amount_decimal
          END,
          amount_raw = CASE
            WHEN entry_type = 'onramp' AND $6::text IS NOT NULL THEN $6::text
            ELSE amount_raw
          END,
          status = CASE
            WHEN $7::boolean AND status = 'pending' THEN 'failed'
            WHEN entry_type = 'offramp' AND $8::boolean AND status = 'pending' THEN 'confirmed'
            ELSE status
          END,
          confirmed_at = CASE
            WHEN entry_type = 'offramp' AND $8::boolean AND status = 'pending' THEN COALESCE($9::timestamptz, NOW())
            ELSE confirmed_at
          END,
          failed_at = CASE
            WHEN $7::boolean AND status = 'pending' THEN NOW()
            WHEN entry_type = 'offramp' AND $8::boolean AND status = 'pending' THEN NULL
            ELSE failed_at
          END,
          failure_reason = CASE
            WHEN $7::boolean AND status = 'pending' THEN CONCAT('Bridge transfer moved to ', $2::text, '.')
            WHEN entry_type = 'offramp' AND $8::boolean AND status = 'pending' THEN NULL
            ELSE failure_reason
          END,
          updated_at = NOW()
        WHERE bridge_transfer_id = $1::text
        RETURNING ${transactionSelection}
      `,
      [
        input.bridgeTransferId,
        input.bridgeTransferStatus,
        input.bridgeDestinationTxHash ?? null,
        input.receiptUrl ?? null,
        nextAmountDecimal,
        nextAmountRaw,
        shouldMarkFailed,
        shouldConfirmOfframp,
        input.eventCreatedAt ?? null,
      ],
    );

    const affectedUserIds = new Set(updateResult.rows.map(row => Number(row.user_id)));
    const updatedRecipientPayments = new Map<number, Date>();

    if (shouldConfirmOfframp) {
      const recipientConfirmedAt = input.eventCreatedAt ?? new Date();

      for (const row of updateResult.rows) {
        if (row.entry_type === "offramp" && row.recipient_id !== null) {
          updatedRecipientPayments.set(Number(row.recipient_id), recipientConfirmedAt);
        }
      }
    }

    await applyRecipientLastPayments(client, updatedRecipientPayments);

    return {
      affectedUserIds,
      applied: true,
    };
  });

  if (bridgeDestinationTxHash) {
    const reconciledUserId = await reconcilePendingOnrampWithConfirmedTransferByTxHash(
      bridgeDestinationTxHash,
    );

    if (reconciledUserId !== null) {
      result.affectedUserIds.add(reconciledUserId);
    }
  }

  return {
    affectedUserIds: Array.from(result.affectedUserIds),
    applied: result.applied,
  };
}

export async function applyAlchemyWebhookEffects(input: {
  eventId: string;
  webhookId: string;
  eventCreatedAt?: Date | null;
  effects: AlchemyWebhookEffectInput[];
}) {
  const onrampReconciliationTxHashes = collectOnrampReconciliationTxHashes(input.effects);
  const result = await withTransaction(async client => {
    const processed = await client.query<{ event_id: string }>(
      `
        INSERT INTO processed_webhook_events (event_id, webhook_id, event_created_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `,
      [input.eventId, input.webhookId, input.eventCreatedAt ?? null],
    );

    if (!processed.rows[0]) {
      return {
        affectedUserIds: new Set<number>(),
        applied: false,
      };
    }

    const affectedUserIds = new Set<number>();
    const balanceDeltas = new Map<number, Record<TransferAsset, bigint>>();
    const updatedRecipientPayments = new Map<number, Date>();

    for (const effect of input.effects) {
      if (effect.type === "ledger") {
        const currentYieldPosition =
          (effect.entry.entryType === "yield_deposit" || effect.entry.entryType === "yield_withdraw") &&
          isYieldAsset(effect.entry.asset)
            ? await getYieldPositionByUserIdWithClient(client, effect.entry.userId)
            : null;
        const inserted = await insertConfirmedLedgerEntry(client, effect.entry);
        if (!inserted) {
          continue;
        }

        affectedUserIds.add(Number(inserted.user_id));
        addBalanceDelta(
          balanceDeltas,
          Number(inserted.user_id),
          inserted.asset,
          inserted.direction === "inbound" ? BigInt(inserted.amount_raw) : BigInt(inserted.amount_raw) * -1n,
        );

        if (
          (inserted.entry_type === "yield_deposit" || inserted.entry_type === "yield_withdraw") &&
          isYieldAsset(inserted.asset)
        ) {
          await applyYieldPositionAction(client, {
            action: inserted.entry_type === "yield_deposit" ? "deposit" : "withdraw",
            amountRaw: inserted.amount_raw,
            asset: inserted.asset,
            currentPosition: currentYieldPosition!,
            transactionSignature: inserted.transaction_signature,
            updatedAt: inserted.confirmed_at ?? effect.entry.confirmedAt,
            userId: Number(inserted.user_id),
          });
          markUsdcYieldCurrentPositionCacheStale(inserted.tracked_wallet_address);
        }

        if (
          inserted.recipient_id !== null &&
          inserted.direction === "outbound" &&
          inserted.entry_type === "transfer"
        ) {
          updatedRecipientPayments.set(Number(inserted.recipient_id), effect.entry.confirmedAt);
        }

        continue;
      }

      if (effect.type === "offramp_broadcast") {
        const applied = await applyOfframpBroadcastEffect(client, effect);
        if (!applied) {
          continue;
        }

        const userId = Number(applied.row.user_id);
        affectedUserIds.add(userId);

        if (!applied.alreadyBroadcasted && !applied.removedDuplicateTransfer) {
          addBalanceDelta(balanceDeltas, userId, applied.row.asset, BigInt(effect.amountRaw) * -1n);
        }

        continue;
      }

      const completed = await client.query<TransactionRow>(
        `
          UPDATE transactions
          SET
            status = 'confirmed',
            confirmed_at = $2,
            failed_at = NULL,
            failure_reason = NULL,
            amount_decimal = $3,
            amount_raw = $4,
            bridge_transfer_status = 'payment_processed',
            transaction_signature = $1,
            from_wallet_address = $5,
            counterparty_name = COALESCE($6, counterparty_name),
            counterparty_wallet_address = COALESCE($7, counterparty_wallet_address),
            updated_at = NOW()
          WHERE entry_type = 'onramp'
            AND status = 'pending'
            AND bridge_destination_tx_hash = $1
          RETURNING ${transactionSelection}
        `,
        [
          effect.txHash,
          effect.confirmedAt,
          effect.amountDecimal,
          effect.amountRaw,
          effect.fromWalletAddress,
          effect.counterpartyName ?? null,
          effect.counterpartyWalletAddress ?? null,
        ],
      );

      const row = completed.rows[0];
      if (!row) {
        continue;
      }

      const userId = Number(row.user_id);
      affectedUserIds.add(userId);

      if (!isOnrampDestinationAsset(row.asset)) {
        continue;
      }

      const removedDuplicateTransfer = await deleteDuplicateConfirmedTransferForOnramp(client, {
        asset: row.asset,
        trackedWalletAddress: row.tracked_wallet_address,
        txHash: effect.txHash,
        userId,
      });

      if (!removedDuplicateTransfer) {
        addBalanceDelta(balanceDeltas, userId, row.asset, BigInt(effect.amountRaw));
      }
    }

    await applyBalanceDeltas(client, balanceDeltas);
    await applyRecipientLastPayments(client, updatedRecipientPayments);

    return {
      affectedUserIds,
      applied: true,
    };
  });

  for (const txHash of onrampReconciliationTxHashes) {
    const reconciledUserId = await reconcilePendingOnrampWithConfirmedTransferByTxHash(txHash);

    if (reconciledUserId !== null) {
      result.affectedUserIds.add(reconciledUserId);
    }
  }

  return {
    affectedUserIds: Array.from(result.affectedUserIds),
    applied: result.applied,
  };
}

export async function applyWebhookLedgerEntries(input: {
  eventId: string;
  webhookId: string;
  eventCreatedAt?: Date | null;
  entries: WebhookLedgerEntryInput[];
}) {
  return applyAlchemyWebhookEffects({
    ...input,
    effects: input.entries.map(entry => ({
      entry,
      type: "ledger" as const,
    })),
  });
}
