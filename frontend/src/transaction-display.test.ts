import { describe, expect, it } from "vitest";

import {
  formatActivityAmount,
  formatActivityStatus,
  formatActivityTimestamp,
  formatActivityTitle,
} from "@/transaction-display";
import type { AppTransaction } from "@/types";

describe("transaction-display", () => {
  it("formats relative timestamps", () => {
    expect(
      formatActivityTimestamp(
        "2026-03-20T10:00:00.000Z",
        new Date("2026-03-20T10:30:00.000Z").getTime(),
      ),
    ).toBe("30 mins ago");
  });

  it("formats processing offramp status", () => {
    expect(
      formatActivityStatus({
        ...buildTransaction(),
        entryType: "offramp",
        status: "pending",
      }),
    ).toBe("Processing");
  });

  it("formats swap activity titles and amounts", () => {
    expect(
      formatActivityTitle({
        ...buildTransaction(),
        asset: "usdc",
        entryType: "swap",
        outputAsset: "eurc",
      }),
    ).toBe("Swap USDC → EURC");

    expect(
      formatActivityAmount({
        ...buildTransaction(),
        asset: "usdc",
        entryType: "swap",
      }),
    ).toBe("-1.00 USDC");
  });
});

function buildTransaction(): AppTransaction {
  return {
    id: 1,
    userId: 1,
    recipientId: null,
    direction: "outbound",
    entryType: "transfer",
    asset: "sol",
    amountDecimal: "1",
    amountRaw: "1000000000",
    amountDisplay: "1.00",
    network: "solana-mainnet",
    trackedWalletAddress: "11111111111111111111111111111111",
    fromWalletAddress: "11111111111111111111111111111111",
    counterpartyName: null,
    counterpartyWalletAddress: null,
    bridgeTransferId: null,
    bridgeTransferStatus: null,
    bridgeSourceAmount: null,
    bridgeSourceCurrency: null,
    bridgeSourceDepositInstructions: null,
    bridgeDestinationTxHash: null,
    bridgeReceiptUrl: null,
    outputAsset: null,
    outputAmountDecimal: null,
    outputAmountRaw: null,
    outputAmountDisplay: null,
    networkFeeRaw: null,
    networkFeeDisplay: null,
    transactionSignature: "sig-1",
    status: "confirmed",
    confirmedAt: "2026-03-20T10:00:00.000Z",
    failedAt: null,
    failureReason: null,
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
  };
}
