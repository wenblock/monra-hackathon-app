import { pool } from "../pool.js";

export type BridgeRequestOperationType =
  | "kyc_link"
  | "external_account"
  | "onramp_transfer"
  | "offramp_transfer";

interface BridgeRequestSessionRow {
  operation_type: BridgeRequestOperationType;
  request_id: string;
  idempotency_key: string;
  payload_hash: string;
  bridge_object_id: string | null;
  user_id: string | null;
  cdp_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BridgeRequestSessionRecord {
  operationType: BridgeRequestOperationType;
  requestId: string;
  idempotencyKey: string;
  payloadHash: string;
  bridgeObjectId: string | null;
  userId: number | null;
  cdpUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getBridgeRequestSession(
  operationType: BridgeRequestOperationType,
  requestId: string,
) {
  const result = await pool.query<BridgeRequestSessionRow>(
    `
      SELECT
        operation_type,
        request_id,
        idempotency_key,
        payload_hash,
        bridge_object_id,
        user_id,
        cdp_user_id,
        created_at,
        updated_at
      FROM bridge_request_sessions
      WHERE operation_type = $1
        AND request_id = $2
      LIMIT 1
    `,
    [operationType, requestId],
  );

  return result.rows[0] ? mapBridgeRequestSession(result.rows[0]) : null;
}

export async function createBridgeRequestSession(input: {
  operationType: BridgeRequestOperationType;
  requestId: string;
  idempotencyKey: string;
  payloadHash: string;
  userId?: number | null;
  cdpUserId?: string | null;
}) {
  const result = await pool.query<BridgeRequestSessionRow>(
    `
      INSERT INTO bridge_request_sessions (
        operation_type,
        request_id,
        idempotency_key,
        payload_hash,
        user_id,
        cdp_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        operation_type,
        request_id,
        idempotency_key,
        payload_hash,
        bridge_object_id,
        user_id,
        cdp_user_id,
        created_at,
        updated_at
    `,
    [
      input.operationType,
      input.requestId,
      input.idempotencyKey,
      input.payloadHash,
      input.userId ?? null,
      input.cdpUserId ?? null,
    ],
  );

  return mapBridgeRequestSession(result.rows[0]);
}

export async function updateBridgeRequestSessionBridgeObjectId(input: {
  operationType: BridgeRequestOperationType;
  requestId: string;
  bridgeObjectId: string;
}) {
  const result = await pool.query<BridgeRequestSessionRow>(
    `
      UPDATE bridge_request_sessions
      SET
        bridge_object_id = COALESCE($3, bridge_object_id),
        updated_at = NOW()
      WHERE operation_type = $1
        AND request_id = $2
      RETURNING
        operation_type,
        request_id,
        idempotency_key,
        payload_hash,
        bridge_object_id,
        user_id,
        cdp_user_id,
        created_at,
        updated_at
    `,
    [input.operationType, input.requestId, input.bridgeObjectId],
  );

  return result.rows[0] ? mapBridgeRequestSession(result.rows[0]) : null;
}

function mapBridgeRequestSession(row: BridgeRequestSessionRow): BridgeRequestSessionRecord {
  return {
    operationType: row.operation_type,
    requestId: row.request_id,
    idempotencyKey: row.idempotency_key,
    payloadHash: row.payload_hash,
    bridgeObjectId: row.bridge_object_id,
    userId: row.user_id === null ? null : Number(row.user_id),
    cdpUserId: row.cdp_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
