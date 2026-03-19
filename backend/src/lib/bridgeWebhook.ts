import type { BridgeTransferState } from "../types.js";

interface BridgeTransferWebhookPayload {
  event_id?: string;
  event_developer_id?: string;
  event_category?: string;
  event_type?: string;
  event_object_id?: string;
  event_object_status?: BridgeTransferState | null;
  event_created_at?: string;
  event_object?: {
    id?: string;
    state?: BridgeTransferState;
    receipt?: {
      final_amount?: string;
      converted_amount?: string;
      subtotal_amount?: string;
      destination_tx_hash?: string;
      url?: string;
    } | null;
  } | null;
  event_object_changes?: {
    receipt?: unknown;
  } | null;
}

const bridgeTransferStates = new Set<BridgeTransferState>([
  "pending",
  "awaiting_funds",
  "in_review",
  "funds_received",
  "payment_submitted",
  "payment_processed",
  "undeliverable",
  "returned",
  "missing_return_policy",
  "refunded",
  "canceled",
  "error",
]);

export function extractBridgeTransferWebhookEvent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const event = payload as BridgeTransferWebhookPayload;
  if (event.event_category !== "transfer") {
    return null;
  }

  const bridgeTransferId =
    typeof event.event_object?.id === "string"
      ? event.event_object.id
      : typeof event.event_object_id === "string"
        ? event.event_object_id
        : null;
  const bridgeTransferStatus =
    readBridgeTransferState(event.event_object_status) ??
    readBridgeTransferState(event.event_object?.state);

  if (
    typeof event.event_id !== "string" ||
    typeof bridgeTransferId !== "string" ||
    bridgeTransferStatus === null
  ) {
    return null;
  }

  return {
    bridgeDestinationTxHash:
      readString(event.event_object?.receipt?.destination_tx_hash) ??
      readDestinationTxHashFromReceiptChanges(event.event_object_changes?.receipt),
    bridgeTransferId,
    bridgeTransferStatus,
    destinationAmountDecimal:
      readString(event.event_object?.receipt?.final_amount) ??
      readString(event.event_object?.receipt?.converted_amount) ??
      readString(event.event_object?.receipt?.subtotal_amount),
    eventCreatedAt: readString(event.event_created_at),
    eventId: event.event_id,
    eventObjectId:
      typeof event.event_object_id === "string" && event.event_object_id.trim().length > 0
        ? event.event_object_id
        : bridgeTransferId,
    receiptUrl: readString(event.event_object?.receipt?.url),
    webhookId:
      typeof event.event_developer_id === "string" && event.event_developer_id.trim().length > 0
        ? event.event_developer_id
        : "bridge",
  };
}

function readDestinationTxHashFromReceiptChanges(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (!item || typeof item !== "object") {
      continue;
    }

    if (
      "destination_tx_hash" in item &&
      typeof item.destination_tx_hash === "string" &&
      item.destination_tx_hash.trim().length > 0
    ) {
      return item.destination_tx_hash.trim();
    }
  }

  return null;
}

function readBridgeTransferState(value: unknown) {
  return typeof value === "string" && bridgeTransferStates.has(value as BridgeTransferState)
    ? (value as BridgeTransferState)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
