import type { TransactionStreamResponse, TransferAsset } from "../types.js";
import { pool } from "./pool.js";

const STREAM_EVENT_CHANNEL = "monra_transaction_stream_event";
const STREAM_EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const SWAP_QUOTE_TTL_MS = 10 * 60 * 1000;

export interface SharedSwapQuote {
  createdAt: string;
  inputAsset: TransferAsset;
  inputAmountRaw: string;
  outputAsset: TransferAsset;
  outputAmountRaw: string;
  requestId: string;
  userId: number;
  walletAddress: string;
}

interface SharedSwapQuoteRow {
  request_id: string;
  user_id: string;
  wallet_address: string;
  input_asset: TransferAsset;
  input_amount_raw: string;
  output_asset: TransferAsset;
  output_amount_raw: string;
  created_at: Date;
}

interface TransactionStreamEventRow {
  id: string;
  payload: TransactionStreamResponse;
  user_id: string;
}

export async function storeSharedSwapQuote(input: Omit<SharedSwapQuote, "createdAt">) {
  await pool.query(
    `
      INSERT INTO swap_quote_sessions (
        request_id,
        user_id,
        wallet_address,
        input_asset,
        input_amount_raw,
        output_asset,
        output_amount_raw,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + ($8::bigint * INTERVAL '1 millisecond'))
      ON CONFLICT (request_id) DO UPDATE
      SET
        user_id = EXCLUDED.user_id,
        wallet_address = EXCLUDED.wallet_address,
        input_asset = EXCLUDED.input_asset,
        input_amount_raw = EXCLUDED.input_amount_raw,
        output_asset = EXCLUDED.output_asset,
        output_amount_raw = EXCLUDED.output_amount_raw,
        expires_at = EXCLUDED.expires_at
    `,
    [
      input.requestId,
      input.userId,
      input.walletAddress,
      input.inputAsset,
      input.inputAmountRaw,
      input.outputAsset,
      input.outputAmountRaw,
      SWAP_QUOTE_TTL_MS,
    ],
  );
}

export async function getSharedSwapQuote(requestId: string) {
  const result = await pool.query<SharedSwapQuoteRow>(
    `
      SELECT request_id, user_id, wallet_address, input_asset, input_amount_raw, output_asset,
        output_amount_raw, created_at
      FROM swap_quote_sessions
      WHERE request_id = $1
        AND expires_at > NOW()
      LIMIT 1
    `,
    [requestId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    createdAt: row.created_at.toISOString(),
    inputAsset: row.input_asset,
    inputAmountRaw: row.input_amount_raw,
    outputAsset: row.output_asset,
    outputAmountRaw: row.output_amount_raw,
    requestId: row.request_id,
    userId: Number(row.user_id),
    walletAddress: row.wallet_address,
  } satisfies SharedSwapQuote;
}

export async function publishTransactionStreamEvent(
  userId: number,
  payload: TransactionStreamResponse,
) {
  const client = await pool.connect();
  let committed = false;

  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO transaction_stream_events (user_id, payload)
        VALUES ($1, $2::jsonb)
        RETURNING id
      `,
      [userId, JSON.stringify(payload)],
    );

    const eventId = inserted.rows[0]?.id;
    if (!eventId) {
      throw new Error("Unable to create transaction stream event.");
    }

    await client.query("SELECT pg_notify($1, $2)", [STREAM_EVENT_CHANNEL, eventId]);
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK");
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupRuntimeState() {
  await pool.query(
    `
      DELETE FROM swap_quote_sessions
      WHERE expires_at <= NOW()
    `,
  );

  await pool.query(
    `
      DELETE FROM transaction_stream_events
      WHERE created_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')
    `,
    [STREAM_EVENT_TTL_MS],
  );
}

export async function getTransactionStreamEventById(eventId: number) {
  const result = await pool.query<TransactionStreamEventRow>(
    `
      SELECT id, user_id, payload
      FROM transaction_stream_events
      WHERE id = $1
      LIMIT 1
    `,
    [eventId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    payload: row.payload,
    userId: Number(row.user_id),
  };
}

export function getTransactionStreamChannelName() {
  return STREAM_EVENT_CHANNEL;
}
