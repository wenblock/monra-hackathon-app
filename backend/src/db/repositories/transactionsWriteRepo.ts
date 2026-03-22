import type { PoolClient } from "pg";

import { TRANSFER_ASSETS, getTransferAssetDecimals } from "../../lib/assets.js";
import { formatAssetAmount, parseDecimalAmountToRaw } from "../../lib/amounts.js";
import type {
  BridgeSourceDepositInstructions,
  BridgeTransferState,
  OfframpSourceAsset,
  OnrampDestinationAsset,
  SolanaBalancesResponse,
  TransferAsset,
} from "../../types.js";
import { createEmptyBalance, mapBalances, mapCollapsedTransaction, mapLedgerTransaction } from "../mappers.js";
import { pool } from "../pool.js";
import { transactionSelection, type TransactionRow } from "../rows.js";
import { withTransaction } from "../tx.js";
import { ensureUserBalanceRecord, getUserBalanceRow } from "./usersRepo.js";

export interface CreatePendingOnrampTransactionInput {
  asset: OnrampDestinationAsset;
  userId: number;
  walletAddress: string;
  bridgeTransferId: string;
  bridgeTransferStatus: BridgeTransferState;
  sourceAmount: string;
  sourceCurrency: string;
  expectedDestinationAmount: string;
  depositInstructions: BridgeSourceDepositInstructions | null;
  receiptUrl?: string | null;
}

export interface CreatePendingOfframpTransactionInput {
  asset: OfframpSourceAsset;
  amount: string;
  bridgeTransferId: string;
  bridgeTransferStatus: BridgeTransferState;
  depositInstructions: BridgeSourceDepositInstructions;
  recipientId: number;
  recipientName: string;
  receiptUrl?: string | null;
  sourceAmount: string;
  sourceCurrency: string;
  userId: number;
  walletAddress: string;
}

export interface CreateConfirmedSwapTransactionInput {
  inputAmountRaw: string;
  inputAsset: TransferAsset;
  outputAmountRaw: string;
  outputAsset: TransferAsset;
  transactionSignature: string;
  userId: number;
  walletAddress: string;
}

function buildOnrampCounterpartyName(paymentRail: string | null | undefined) {
  const normalizedRail = paymentRail?.trim();
  return normalizedRail ? `Bridge ${normalizedRail.toUpperCase()} On-ramp` : "Bridge On-ramp";
}

function buildOfframpNormalizationKey(bridgeTransferId: string) {
  return `offramp:${bridgeTransferId}`;
}

function buildSwapNormalizationKey(transactionSignature: string, trackedWalletAddress: string) {
  return `swap:${transactionSignature}:${trackedWalletAddress}`;
}

export function addBalanceDelta(
  balanceDeltas: Map<number, Record<TransferAsset, bigint>>,
  userId: number,
  asset: TransferAsset,
  amountRaw: bigint,
) {
  const current =
    balanceDeltas.get(userId) ??
    (Object.fromEntries(TRANSFER_ASSETS.map(balanceAsset => [balanceAsset, 0n])) as Record<
      TransferAsset,
      bigint
    >);

  current[asset] += amountRaw;
  balanceDeltas.set(userId, current);
}

export async function applyBalanceDeltas(
  client: PoolClient,
  balanceDeltas: Map<number, Record<TransferAsset, bigint>>,
) {
  for (const [userId, delta] of balanceDeltas.entries()) {
    await ensureUserBalanceRecord(client, userId);

    for (const asset of TRANSFER_ASSETS) {
      if (delta[asset] === 0n) {
        continue;
      }

      const balanceColumn = `${asset}_raw`;
      await client.query(
        `
          UPDATE user_balances
          SET ${balanceColumn} = ((${balanceColumn})::NUMERIC + $2::NUMERIC)::TEXT, updated_at = NOW()
          WHERE user_id = $1
        `,
        [userId, delta[asset].toString()],
      );
    }
  }
}

export async function applyRecipientLastPayments(
  client: PoolClient,
  updatedRecipientPayments: Map<number, Date>,
) {
  for (const [recipientId, confirmedAt] of updatedRecipientPayments.entries()) {
    await client.query(
      `
        UPDATE recipients
        SET last_payment_at = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [recipientId, confirmedAt],
    );
  }
}

export async function createPendingOnrampTransaction(input: CreatePendingOnrampTransactionInput) {
  const amountRaw = parseDecimalAmountToRaw(
    input.expectedDestinationAmount,
    getTransferAssetDecimals(input.asset),
  );
  const result = await pool.query<TransactionRow>(
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
        bridge_transfer_id,
        bridge_transfer_status,
        bridge_source_amount,
        bridge_source_currency,
        bridge_source_deposit_instructions,
        bridge_destination_tx_hash,
        bridge_receipt_url,
        transaction_signature,
        webhook_event_id,
        normalization_key,
        status,
        confirmed_at,
        failed_at,
        failure_reason
      )
      VALUES (
        $1, NULL, 'inbound', 'onramp', $2, $3, $4, 'solana-mainnet', $5, $6, $7, NULL, $8, $9,
        $10, $11, $12::JSONB, NULL, $13, $8, NULL, $14, 'pending', NULL, NULL, NULL
      )
      RETURNING ${transactionSelection}
    `,
    [
      input.userId,
      input.asset,
      input.expectedDestinationAmount,
      amountRaw,
      input.walletAddress,
      input.walletAddress,
      buildOnrampCounterpartyName(input.depositInstructions?.paymentRail),
      input.bridgeTransferId,
      input.bridgeTransferStatus,
      input.sourceAmount,
      input.sourceCurrency,
      input.depositInstructions ? JSON.stringify(input.depositInstructions) : null,
      input.receiptUrl ?? null,
      `onramp:${input.bridgeTransferId}`,
    ],
  );

  return mapCollapsedTransaction(mapLedgerTransaction(result.rows[0]), null);
}

export async function createPendingOfframpTransaction(input: CreatePendingOfframpTransactionInput) {
  const amountRaw = parseDecimalAmountToRaw(input.amount, getTransferAssetDecimals(input.asset));
  const result = await pool.query<TransactionRow>(
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
        bridge_transfer_id,
        bridge_transfer_status,
        bridge_source_amount,
        bridge_source_currency,
        bridge_source_deposit_instructions,
        bridge_destination_tx_hash,
        bridge_receipt_url,
        transaction_signature,
        webhook_event_id,
        normalization_key,
        status,
        confirmed_at,
        failed_at,
        failure_reason
      )
      VALUES (
        $1, $2, 'outbound', 'offramp', $3, $4, $5, 'solana-mainnet', $6, $7, $8, NULL, $9, $10,
        $11, $12, $13::JSONB, NULL, $14, $9, NULL, $15, 'pending', NULL, NULL, NULL
      )
      RETURNING ${transactionSelection}
    `,
    [
      input.userId,
      input.recipientId,
      input.asset,
      input.amount,
      amountRaw,
      input.walletAddress,
      input.walletAddress,
      input.recipientName,
      input.bridgeTransferId,
      input.bridgeTransferStatus,
      input.sourceAmount,
      input.sourceCurrency,
      JSON.stringify(input.depositInstructions),
      input.receiptUrl ?? null,
      buildOfframpNormalizationKey(input.bridgeTransferId),
    ],
  );

  return mapCollapsedTransaction(mapLedgerTransaction(result.rows[0]), null);
}

export async function createConfirmedSwapTransaction(input: CreateConfirmedSwapTransactionInput) {
  const normalizationKey = buildSwapNormalizationKey(input.transactionSignature, input.walletAddress);

  return withTransaction(async client => {
    const inserted = await client.query<TransactionRow>(
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
          bridge_transfer_id,
          bridge_transfer_status,
          bridge_source_amount,
          bridge_source_currency,
          bridge_source_deposit_instructions,
          bridge_destination_tx_hash,
          bridge_receipt_url,
          output_asset,
          output_amount_decimal,
          output_amount_raw,
          transaction_signature,
          webhook_event_id,
          normalization_key,
          status,
          confirmed_at,
          failed_at,
          failure_reason
        )
        VALUES (
          $1, NULL, 'outbound', 'swap', $2, $3, $4, 'solana-mainnet', $5, $6, NULL, NULL, NULL, NULL,
          NULL, NULL, NULL, NULL, NULL, $7, $8, $9, $10, NULL, $11, 'confirmed', NOW(), NULL, NULL
        )
        ON CONFLICT (normalization_key) DO NOTHING
        RETURNING ${transactionSelection}
      `,
      [
        input.userId,
        input.inputAsset,
        formatAssetAmount(input.inputAmountRaw, input.inputAsset),
        input.inputAmountRaw,
        input.walletAddress,
        input.walletAddress,
        input.outputAsset,
        formatAssetAmount(input.outputAmountRaw, input.outputAsset),
        input.outputAmountRaw,
        input.transactionSignature,
        normalizationKey,
      ],
    );

    const row =
      inserted.rows[0] ??
      (
        await client.query<TransactionRow>(
          `
            SELECT ${transactionSelection}
            FROM transactions
            WHERE normalization_key = $1::text
            LIMIT 1
          `,
          [normalizationKey],
        )
      ).rows[0];

    if (!row) {
      throw new Error("Unable to load the stored swap transaction.");
    }

    if (inserted.rows[0]) {
      const balanceDeltas = new Map<number, Record<TransferAsset, bigint>>();
      addBalanceDelta(balanceDeltas, input.userId, input.inputAsset, BigInt(input.inputAmountRaw) * -1n);
      addBalanceDelta(balanceDeltas, input.userId, input.outputAsset, BigInt(input.outputAmountRaw));
      await applyBalanceDeltas(client, balanceDeltas);
    }

    const balanceRow = await getUserBalanceRow(client, input.userId);

    return {
      balances: balanceRow
        ? mapBalances(balanceRow)
        : (Object.fromEntries(
            TRANSFER_ASSETS.map(asset => [asset, createEmptyBalance(getTransferAssetDecimals(asset))]),
          ) as SolanaBalancesResponse["balances"]),
      transaction: mapCollapsedTransaction(mapLedgerTransaction(row), null),
    };
  });
}
