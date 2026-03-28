import { createHash, randomUUID } from "node:crypto";

import { isUniqueViolation } from "../db/errors.js";
import {
  createBridgeRequestSession,
  getBridgeRequestSession,
  type BridgeRequestOperationType,
  type BridgeRequestSessionRecord,
  updateBridgeRequestSessionBridgeObjectId,
} from "../db.js";
import { ServiceError } from "./errors.js";

interface BridgeRequestSessionDependencies {
  createBridgeRequestSession: typeof createBridgeRequestSession;
  getBridgeRequestSession: typeof getBridgeRequestSession;
  updateBridgeRequestSessionBridgeObjectId: typeof updateBridgeRequestSessionBridgeObjectId;
}

const defaultDependencies: BridgeRequestSessionDependencies = {
  createBridgeRequestSession,
  getBridgeRequestSession,
  updateBridgeRequestSessionBridgeObjectId,
};

export async function getOrCreateBridgeRequestSession(
  input: {
    operationType: BridgeRequestOperationType;
    requestId: string;
    payload: unknown;
    userId?: number | null;
    cdpUserId?: string | null;
  },
  dependencies: BridgeRequestSessionDependencies = defaultDependencies,
): Promise<BridgeRequestSessionRecord> {
  const payloadHash = hashBridgeRequestPayload(input.payload);
  const existing = await dependencies.getBridgeRequestSession(input.operationType, input.requestId);

  if (existing) {
    assertRequestSessionCompatibility(existing, {
      cdpUserId: input.cdpUserId ?? null,
      payloadHash,
      userId: input.userId ?? null,
    });
    return existing;
  }

  try {
    return await dependencies.createBridgeRequestSession({
      operationType: input.operationType,
      requestId: input.requestId,
      idempotencyKey: randomUUID(),
      payloadHash,
      userId: input.userId ?? null,
      cdpUserId: input.cdpUserId ?? null,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const raced = await dependencies.getBridgeRequestSession(input.operationType, input.requestId);
    if (!raced) {
      throw error;
    }

    assertRequestSessionCompatibility(raced, {
      cdpUserId: input.cdpUserId ?? null,
      payloadHash,
      userId: input.userId ?? null,
    });
    return raced;
  }
}

export async function completeBridgeRequestSession(
  input: {
    operationType: BridgeRequestOperationType;
    requestId: string;
    bridgeObjectId: string;
  },
  dependencies: BridgeRequestSessionDependencies = defaultDependencies,
) {
  await dependencies.updateBridgeRequestSessionBridgeObjectId(input);
}

export function hashBridgeRequestPayload(payload: unknown) {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function assertRequestSessionCompatibility(
  session: BridgeRequestSessionRecord,
  input: {
    payloadHash: string;
    userId: number | null;
    cdpUserId: string | null;
  },
) {
  if (session.payloadHash !== input.payloadHash) {
    throw new ServiceError("This request is stale. Refresh and try again.", 409);
  }

  if (
    input.userId !== null &&
    session.userId !== null &&
    session.userId !== input.userId
  ) {
    throw new ServiceError("This request does not belong to the current user.", 409);
  }

  if (
    input.cdpUserId !== null &&
    session.cdpUserId !== null &&
    session.cdpUserId !== input.cdpUserId
  ) {
    throw new ServiceError("This request does not belong to the current user.", 409);
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );

  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
    .join(",")}}`;
}
