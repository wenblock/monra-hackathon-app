import assert from "node:assert/strict";
import test from "node:test";

process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/monra";
process.env.ALCHEMY_API_KEY = "alchemy-api-key";
process.env.ALCHEMY_WEBHOOK_ID = "alchemy-webhook-id";
process.env.ALCHEMY_WEBHOOK_AUTH_TOKEN = "alchemy-webhook-auth-token";
process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = "alchemy-webhook-signing-key";
process.env.CDP_API_KEY_ID = "cdp-api-key-id";
process.env.CDP_API_KEY_SECRET = "cdp-api-key-secret";
process.env.BRIDGE_API_KEY = "bridge-api-key";
process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = "test-public-key";
process.env.BRIDGE_WEBHOOK_MAX_AGE_MS = "600000";

const {
  collapseLedgerTransactions,
  decodeTransactionCursor,
  encodeTransactionCursor,
} = await import("./mappers.js");

function createTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    public_id: "00000000-0000-4000-8000-000000000001",
    user_id: "7",
    recipient_id: null,
    direction: "outbound",
    entry_type: "transfer",
    asset: "usdc",
    amount_decimal: "1",
    amount_raw: "1000000",
    network: "solana-mainnet",
    tracked_wallet_address: "tracked-wallet",
    from_wallet_address: "tracked-wallet",
    counterparty_name: "Recipient",
    counterparty_wallet_address: "recipient-wallet",
    bridge_transfer_id: null,
    bridge_transfer_status: null,
    bridge_source_amount: null,
    bridge_source_currency: null,
    bridge_source_deposit_instructions: null,
    bridge_destination_tx_hash: null,
    bridge_receipt_url: null,
    output_asset: null,
    output_amount_decimal: null,
    output_amount_raw: null,
    transaction_signature: "sig-1",
    webhook_event_id: null,
    normalization_key: "key-1",
    status: "confirmed",
    confirmed_at: new Date("2026-03-22T10:00:00.000Z"),
    failed_at: null,
    failure_reason: null,
    created_at: new Date("2026-03-22T10:00:00.000Z"),
    updated_at: new Date("2026-03-22T10:00:00.000Z"),
    ...overrides,
  };
}

test("encodeTransactionCursor round-trips through decodeTransactionCursor", () => {
  const cursor = encodeTransactionCursor({
    amountDecimal: "1",
    amountDisplay: "1",
    amountRaw: "1000000",
    asset: "usdc",
    bridgeDestinationTxHash: null,
    bridgeReceiptUrl: null,
    bridgeSourceAmount: null,
    bridgeSourceCurrency: null,
    bridgeSourceDepositInstructions: null,
    bridgeTransferId: null,
    bridgeTransferStatus: null,
    confirmedAt: "2026-03-22T10:00:00.000Z",
    counterpartyName: null,
    counterpartyWalletAddress: null,
    createdAt: "2026-03-22T10:00:00.000Z",
    direction: "inbound",
    entryType: "transfer",
    failedAt: null,
    failureReason: null,
    fromWalletAddress: "wallet",
    id: 42,
    network: "solana-mainnet",
    networkFeeDisplay: null,
    networkFeeRaw: null,
    outputAmountDecimal: null,
    outputAmountDisplay: null,
    outputAmountRaw: null,
    outputAsset: null,
    publicId: "00000000-0000-4000-8000-000000000042",
    recipientId: null,
    status: "confirmed",
    trackedWalletAddress: "wallet",
    transactionSignature: "sig",
    updatedAt: "2026-03-22T10:00:00.000Z",
    userId: 7,
  });

  assert.deepEqual(decodeTransactionCursor(cursor), {
    id: 42,
    sortAt: "2026-03-22T10:00:00.000Z",
  });
});

test("collapseLedgerTransactions attaches outbound fees once per transaction group", () => {
  const collapsed = collapseLedgerTransactions([
    createTransactionRow(),
    createTransactionRow({
      amount_decimal: "0.000005",
      amount_raw: "5000",
      asset: "sol",
      entry_type: "network_fee",
      id: "2",
      normalization_key: "key-2",
      transaction_signature: "sig-1",
    }),
    createTransactionRow({
      direction: "inbound",
      entry_type: "transfer",
      id: "3",
      normalization_key: "key-3",
      transaction_signature: "sig-2",
    }),
  ] as any);

  assert.equal(collapsed.length, 2);
  assert.equal(collapsed[0]?.transactionSignature, "sig-2");
  assert.equal(collapsed[1]?.transactionSignature, "sig-1");
  assert.equal(collapsed[1]?.networkFeeRaw, "5000");
  assert.equal(collapsed[1]?.networkFeeDisplay, "0.000005");
});
