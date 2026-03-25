import type { PoolClient } from "pg";

import { formatAssetAmount } from "../../lib/amounts.js";
import type { YieldAction, YieldAsset, YieldTrackedPosition } from "../../types.js";
import { withClient } from "../tx.js";
import { yieldPositionSelection, type YieldPositionRow } from "../rows.js";

interface YieldPositionHistoryEntry {
  action: YieldAction;
  amountRaw: string;
  confirmedAt: string | null;
  createdAt: string;
  transactionSignature: string;
}

const YIELD_POSITION_ASSET: YieldAsset = "usdc";

export function createEmptyYieldTrackedPosition(): YieldTrackedPosition {
  return {
    grossWithdrawn: {
      formatted: "0",
      raw: "0",
    },
    principal: {
      formatted: "0",
      raw: "0",
    },
    totalDeposited: {
      formatted: "0",
      raw: "0",
    },
    updatedAt: null,
  };
}

export function replayYieldPositionHistory(entries: YieldPositionHistoryEntry[]): YieldTrackedPosition {
  let principalRaw = 0n;
  let totalDepositedRaw = 0n;
  let grossWithdrawnRaw = 0n;
  let updatedAt: string | null = null;

  for (const entry of entries) {
    const amountRaw = BigInt(entry.amountRaw);

    if (entry.action === "deposit") {
      principalRaw += amountRaw;
      totalDepositedRaw += amountRaw;
    } else {
      principalRaw = principalRaw > amountRaw ? principalRaw - amountRaw : 0n;
      grossWithdrawnRaw += amountRaw;
    }

    updatedAt = entry.confirmedAt ?? entry.createdAt;
  }

  return {
    grossWithdrawn: {
      formatted: formatAssetAmount(grossWithdrawnRaw.toString(), YIELD_POSITION_ASSET),
      raw: grossWithdrawnRaw.toString(),
    },
    principal: {
      formatted: formatAssetAmount(principalRaw.toString(), YIELD_POSITION_ASSET),
      raw: principalRaw.toString(),
    },
    totalDeposited: {
      formatted: formatAssetAmount(totalDepositedRaw.toString(), YIELD_POSITION_ASSET),
      raw: totalDepositedRaw.toString(),
    },
    updatedAt,
  };
}

export async function getYieldPositionByUserId(userId: number) {
  return withClient(client => getYieldPositionByUserIdWithClient(client, userId));
}

export async function getYieldPositionByUserIdWithClient(client: PoolClient, userId: number) {
  const existingPosition = await getYieldPositionRow(client, userId);
  if (existingPosition) {
    return mapYieldPositionRow(existingPosition);
  }

  const history = await getYieldPositionHistoryByUserId(client, userId);
  if (history.length === 0) {
    return createEmptyYieldTrackedPosition();
  }

  const replayedPosition = replayYieldPositionHistory(history);
  await client.query(
    `
      INSERT INTO yield_positions (
        user_id,
        asset,
        principal_raw,
        total_deposited_raw,
        gross_withdrawn_raw,
        last_confirmed_signature,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)
      ON CONFLICT (user_id, asset) DO UPDATE
      SET
        principal_raw = EXCLUDED.principal_raw,
        total_deposited_raw = EXCLUDED.total_deposited_raw,
        gross_withdrawn_raw = EXCLUDED.gross_withdrawn_raw,
        last_confirmed_signature = EXCLUDED.last_confirmed_signature,
        updated_at = EXCLUDED.updated_at
    `,
    [
      userId,
      YIELD_POSITION_ASSET,
      replayedPosition.principal.raw,
      replayedPosition.totalDeposited.raw,
      replayedPosition.grossWithdrawn.raw,
      history.at(-1)?.transactionSignature ?? null,
      replayedPosition.updatedAt ?? new Date().toISOString(),
    ],
  );

  return replayedPosition;
}

export async function applyYieldPositionAction(
  client: PoolClient,
  input: {
    action: YieldAction;
    amountRaw: string;
    asset: YieldAsset;
    currentPosition: YieldTrackedPosition;
    transactionSignature: string;
    updatedAt: Date;
    userId: number;
  },
) {
  const nextPrincipalRaw =
    input.action === "deposit"
      ? BigInt(input.currentPosition.principal.raw) + BigInt(input.amountRaw)
      : maxBigInt(BigInt(input.currentPosition.principal.raw) - BigInt(input.amountRaw), 0n);
  const nextTotalDepositedRaw =
    input.action === "deposit"
      ? BigInt(input.currentPosition.totalDeposited.raw) + BigInt(input.amountRaw)
      : BigInt(input.currentPosition.totalDeposited.raw);
  const nextGrossWithdrawnRaw =
    input.action === "withdraw"
      ? BigInt(input.currentPosition.grossWithdrawn.raw) + BigInt(input.amountRaw)
      : BigInt(input.currentPosition.grossWithdrawn.raw);

  await client.query(
    `
      INSERT INTO yield_positions (
        user_id,
        asset,
        principal_raw,
        total_deposited_raw,
        gross_withdrawn_raw,
        last_confirmed_signature,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (user_id, asset) DO UPDATE
      SET
        principal_raw = EXCLUDED.principal_raw,
        total_deposited_raw = EXCLUDED.total_deposited_raw,
        gross_withdrawn_raw = EXCLUDED.gross_withdrawn_raw,
        last_confirmed_signature = EXCLUDED.last_confirmed_signature,
        updated_at = EXCLUDED.updated_at
    `,
    [
      input.userId,
      input.asset,
      nextPrincipalRaw.toString(),
      nextTotalDepositedRaw.toString(),
      nextGrossWithdrawnRaw.toString(),
      input.transactionSignature,
      input.updatedAt,
    ],
  );

  return {
    grossWithdrawn: {
      formatted: formatAssetAmount(nextGrossWithdrawnRaw.toString(), input.asset),
      raw: nextGrossWithdrawnRaw.toString(),
    },
    principal: {
      formatted: formatAssetAmount(nextPrincipalRaw.toString(), input.asset),
      raw: nextPrincipalRaw.toString(),
    },
    totalDeposited: {
      formatted: formatAssetAmount(nextTotalDepositedRaw.toString(), input.asset),
      raw: nextTotalDepositedRaw.toString(),
    },
    updatedAt: input.updatedAt.toISOString(),
  } satisfies YieldTrackedPosition;
}

async function getYieldPositionRow(client: PoolClient, userId: number) {
  const result = await client.query<YieldPositionRow>(
    `
      SELECT ${yieldPositionSelection}
      FROM yield_positions
      WHERE user_id = $1::bigint
        AND asset = $2::text
      LIMIT 1
    `,
    [userId, YIELD_POSITION_ASSET],
  );

  return result.rows[0] ?? null;
}

async function getYieldPositionHistoryByUserId(client: PoolClient, userId: number) {
  const result = await client.query<{
    amount_raw: string;
    confirmed_at: Date | null;
    created_at: Date;
    entry_type: "yield_deposit" | "yield_withdraw";
    transaction_signature: string;
  }>(
    `
      SELECT amount_raw, confirmed_at, created_at, entry_type, transaction_signature
      FROM transactions
      WHERE user_id = $1::bigint
        AND status = 'confirmed'
        AND asset = $2::text
        AND entry_type IN ('yield_deposit', 'yield_withdraw')
      ORDER BY COALESCE(confirmed_at, created_at) ASC, id ASC
    `,
    [userId, YIELD_POSITION_ASSET],
  );

  return result.rows.map<YieldPositionHistoryEntry>(row => ({
    action: row.entry_type === "yield_deposit" ? "deposit" : "withdraw",
    amountRaw: row.amount_raw,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    transactionSignature: row.transaction_signature,
  }));
}

function mapYieldPositionRow(row: YieldPositionRow): YieldTrackedPosition {
  return {
    grossWithdrawn: {
      formatted: formatAssetAmount(row.gross_withdrawn_raw, YIELD_POSITION_ASSET),
      raw: row.gross_withdrawn_raw,
    },
    principal: {
      formatted: formatAssetAmount(row.principal_raw, YIELD_POSITION_ASSET),
      raw: row.principal_raw,
    },
    totalDeposited: {
      formatted: formatAssetAmount(row.total_deposited_raw, YIELD_POSITION_ASSET),
      raw: row.total_deposited_raw,
    },
    updatedAt: row.updated_at.toISOString(),
  };
}

function maxBigInt(value: bigint, minimum: bigint) {
  return value > minimum ? value : minimum;
}
