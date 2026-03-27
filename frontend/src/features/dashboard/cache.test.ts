import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { DashboardSnapshot } from "@/api";
import { createQueryClient } from "@/lib/query-client";
import type { AppTransaction, TransactionListResponse, TransactionStreamResponse } from "@/types";

import { mergeStreamedDashboardSnapshot } from "./cache";
import { dashboardKeys } from "./query-keys";
import { transactionsKeys } from "../transactions/query-keys";

describe("mergeStreamedDashboardSnapshot", () => {
  it("updates the dashboard snapshot and prepends streamed transactions into history", () => {
    const queryClient = createQueryClient();
    const existingHistoryTransactions = [
      buildTransaction({
        amountDisplay: "4.00",
        asset: "usdc",
        publicId: "existing-1",
      }),
      buildTransaction({
        amountDisplay: "3.00",
        asset: "eurc",
        publicId: "existing-2",
      }),
    ];
    const streamedTransactions = [
      buildTransaction({
        amountDisplay: "1.50",
        asset: "usdc",
        counterpartyName: "Alice Treasury",
        publicId: "streamed-1",
      }),
      buildTransaction({
        amountDisplay: "0.25",
        asset: "sol",
        counterpartyName: "Bob Ops",
        direction: "outbound",
        publicId: "streamed-2",
      }),
    ];

    queryClient.setQueryData<DashboardSnapshot>(dashboardKeys.snapshot("user-1"), {
      balances: {
        eurc: { formatted: "5.00", raw: "5000000" },
        sol: { formatted: "1.00", raw: "1000000000" },
        usdc: { formatted: "20.00", raw: "20000000" },
      },
      transactions: existingHistoryTransactions,
      valuation: buildValuation("175.40"),
      yield: buildYieldSnapshot("10.00"),
    });
    queryClient.setQueryData<InfiniteData<TransactionListResponse>>(
      transactionsKeys.history("user-1"),
      {
        pageParams: [null],
        pages: [
          {
            nextCursor: "cursor-2",
            transactions: existingHistoryTransactions,
          },
        ],
      },
    );

    const streamedSnapshot: TransactionStreamResponse = {
      balances: {
        eurc: { formatted: "8.00", raw: "8000000" },
        sol: { formatted: "1.25", raw: "1250000000" },
        usdc: { formatted: "25.00", raw: "25000000" },
      },
      transactions: streamedTransactions,
      valuation: buildValuation("220.80"),
      yield: buildYieldSnapshot("15.00"),
    };

    mergeStreamedDashboardSnapshot(queryClient, "user-1", streamedSnapshot);

    expect(queryClient.getQueryData(dashboardKeys.snapshot("user-1"))).toEqual(streamedSnapshot);

    const history = queryClient.getQueryData<InfiniteData<TransactionListResponse>>(
      transactionsKeys.history("user-1"),
    );

    expect(history?.pages[0]?.transactions).toEqual([
      ...streamedTransactions,
      ...existingHistoryTransactions,
    ]);
  });

  it("preserves existing transaction history when the stream snapshot has no recent rows", () => {
    const queryClient = createQueryClient();
    const existingHistoryTransactions = [
      buildTransaction({
        amountDisplay: "4.00",
        asset: "usdc",
        publicId: "existing-1",
      }),
      buildTransaction({
        amountDisplay: "3.00",
        asset: "eurc",
        publicId: "existing-2",
      }),
    ];

    queryClient.setQueryData<DashboardSnapshot>(dashboardKeys.snapshot("user-1"), {
      balances: {
        eurc: { formatted: "5.00", raw: "5000000" },
        sol: { formatted: "1.00", raw: "1000000000" },
        usdc: { formatted: "20.00", raw: "20000000" },
      },
      transactions: existingHistoryTransactions,
      valuation: buildValuation("175.40"),
      yield: buildYieldSnapshot("10.00"),
    });
    queryClient.setQueryData<InfiniteData<TransactionListResponse>>(
      transactionsKeys.history("user-1"),
      {
        pageParams: [null],
        pages: [
          {
            nextCursor: "cursor-2",
            transactions: existingHistoryTransactions,
          },
        ],
      },
    );

    mergeStreamedDashboardSnapshot(queryClient, "user-1", {
      balances: {
        eurc: { formatted: "8.00", raw: "8000000" },
        sol: { formatted: "1.25", raw: "1250000000" },
        usdc: { formatted: "25.00", raw: "25000000" },
      },
      transactions: [],
      valuation: buildValuation("220.80"),
      yield: buildYieldSnapshot("15.00"),
    });

    const history = queryClient.getQueryData<InfiniteData<TransactionListResponse>>(
      transactionsKeys.history("user-1"),
    );

    expect(history?.pages[0]?.transactions).toEqual(existingHistoryTransactions);
  });
});

function buildTransaction(overrides: Partial<AppTransaction> = {}): AppTransaction {
  return {
    amountDecimal: "1.5",
    amountDisplay: "1.50",
    amountRaw: "1500000",
    asset: "usdc",
    bridgeDestinationTxHash: null,
    bridgeReceiptUrl: null,
    bridgeSourceAmount: null,
    bridgeSourceCurrency: null,
    bridgeSourceDepositInstructions: null,
    bridgeTransferId: null,
    bridgeTransferStatus: null,
    confirmedAt: "2026-03-27T10:00:00.000Z",
    counterpartyName: "Counterparty",
    counterpartyWalletAddress: "RecipientWallet1111111111111111111111111111111",
    createdAt: "2026-03-27T10:00:00.000Z",
    direction: "inbound",
    entryType: "transfer",
    failedAt: null,
    failureReason: null,
    fromWalletAddress: "SenderWallet111111111111111111111111111111111",
    id: 1,
    network: "solana-mainnet",
    networkFeeDisplay: null,
    networkFeeRaw: null,
    outputAmountDecimal: null,
    outputAmountDisplay: null,
    outputAmountRaw: null,
    outputAsset: null,
    publicId: "transaction-1",
    recipientId: null,
    status: "confirmed",
    trackedWalletAddress: "TrackedWallet11111111111111111111111111111111",
    transactionSignature: "signature-1",
    updatedAt: "2026-03-27T10:00:00.000Z",
    userId: 1,
    ...overrides,
  };
}

function buildValuation(treasuryValueUsd: string) {
  return {
    assetValuesUsd: {
      eurc: "10.80",
      sol: "187.50",
      usdc: "25.00",
    },
    isStale: false,
    lastUpdatedAt: "2026-03-27T10:00:00.000Z",
    liquidTreasuryValueUsd: treasuryValueUsd,
    pricesUsd: {
      eurc: "1.08",
      sol: "150.00",
      usdc: "1.00",
    },
    treasuryValueUsd,
    unavailableAssets: [],
    yieldInvestedValueUsd: "15.00",
  };
}

function buildYieldSnapshot(valueUsd: string) {
  return {
    positions: {
      usdc: {
        currentPosition: { formatted: valueUsd, raw: "15000000" },
        earnings: { formatted: "1.00", raw: "1000000" },
        status: "tracked" as const,
        valueUsd,
      },
    },
  };
}
