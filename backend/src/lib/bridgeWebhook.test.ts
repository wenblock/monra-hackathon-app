import assert from "node:assert/strict";
import test from "node:test";

const { extractBridgeTransferWebhookEvent } = await import("./bridgeWebhook.js");

test("extractBridgeTransferWebhookEvent parses payment_processed transfer updates", () => {
  const event = extractBridgeTransferWebhookEvent({
    event_category: "transfer",
    event_created_at: "2026-03-19T18:00:00.000Z",
    event_developer_id: "bridge-webhook-id",
    event_id: "evt_123",
    event_object: {
      id: "tr_123",
      receipt: {
        destination_tx_hash: "solana-destination-signature",
        final_amount: "24.75",
        url: "https://bridge.example/receipt",
      },
      state: "payment_processed",
    },
    event_object_id: "tr_123",
    event_object_status: "payment_processed",
  });

  assert.deepEqual(event, {
    bridgeDestinationTxHash: "solana-destination-signature",
    bridgeTransferId: "tr_123",
    bridgeTransferStatus: "payment_processed",
    destinationAmountDecimal: "24.75",
    eventCreatedAt: "2026-03-19T18:00:00.000Z",
    eventId: "evt_123",
    eventObjectId: "tr_123",
    receiptUrl: "https://bridge.example/receipt",
    webhookId: "bridge-webhook-id",
  });
});

test("extractBridgeTransferWebhookEvent parses failure states", () => {
  const event = extractBridgeTransferWebhookEvent({
    event_category: "transfer",
    event_id: "evt_456",
    event_object: {
      id: "tr_456",
      state: "returned",
    },
    event_object_status: "returned",
  });

  assert.equal(event?.bridgeTransferStatus, "returned");
  assert.equal(event?.bridgeTransferId, "tr_456");
});
