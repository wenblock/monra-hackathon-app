import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast-provider";
import { createQueryClient } from "@/lib/query-client";
import type { AppTransaction, TransactionStreamResponse } from "@/types";

import { TransactionStreamProvider } from "./transaction-stream-provider";

const fetchTransactionStreamTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/session/use-api-client", () => ({
  useApiClient: () => ({
    fetchTransactionStreamToken: fetchTransactionStreamTokenMock,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  API_BASE_URL: "http://localhost:4000",
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: (() => void) | null = null;
  readonly url: string;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

describe("TransactionStreamProvider", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    fetchTransactionStreamTokenMock.mockReset();
    fetchTransactionStreamTokenMock.mockResolvedValue({ token: "stream-token" });
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not show transfer toasts for the initial stream snapshot", async () => {
    renderProvider();
    const stream = await waitForStream();

    emitSnapshot(
      stream,
      buildSnapshot({
        transactions: [
          buildTransaction({
            counterpartyName: "Alice Treasury",
            publicId: "initial-transfer",
          }),
        ],
      }),
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows one toast for a new inbound confirmed transfer", async () => {
    renderProvider();
    const stream = await waitForStream();

    emitSnapshot(stream, buildSnapshot());
    emitSnapshot(
      stream,
      buildSnapshot({
        transactions: [
          buildTransaction({
            counterpartyName: "Alice Treasury",
            publicId: "inbound-transfer",
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Received from Alice Treasury")).toBeInTheDocument();
    });
    expect(screen.getByText("+1.50 USDC")).toBeInTheDocument();
  });

  it("shows one toast for a new outbound confirmed transfer", async () => {
    renderProvider();
    const stream = await waitForStream();

    emitSnapshot(stream, buildSnapshot());
    emitSnapshot(
      stream,
      buildSnapshot({
        transactions: [
          buildTransaction({
            amountDisplay: "0.25",
            amountRaw: "250000000",
            asset: "sol",
            counterpartyName: "Bob Ops",
            direction: "outbound",
            publicId: "outbound-transfer",
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Sent to Bob Ops")).toBeInTheDocument();
    });
    expect(screen.getByText("-0.25 SOL")).toBeInTheDocument();
  });

  it("does not duplicate toasts for repeated snapshots", async () => {
    renderProvider();
    const stream = await waitForStream();
    const payload = buildSnapshot({
      transactions: [
        buildTransaction({
          counterpartyName: "Alice Treasury",
          publicId: "deduped-transfer",
        }),
      ],
    });

    emitSnapshot(stream, buildSnapshot());
    emitSnapshot(stream, payload);
    emitSnapshot(stream, payload);

    await waitFor(() => {
      expect(screen.getByText("Received from Alice Treasury")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Received from Alice Treasury")).toHaveLength(1);
  });

  it("does not show toasts for non-transfer transactions", async () => {
    renderProvider();
    const stream = await waitForStream();

    emitSnapshot(stream, buildSnapshot());
    emitSnapshot(
      stream,
      buildSnapshot({
        transactions: [
          buildTransaction({ entryType: "swap", outputAsset: "eurc", publicId: "swap-1" }),
          buildTransaction({ entryType: "yield_deposit", publicId: "yield-deposit-1" }),
          buildTransaction({ entryType: "yield_withdraw", publicId: "yield-withdraw-1" }),
          buildTransaction({ entryType: "onramp", publicId: "onramp-1" }),
          buildTransaction({ entryType: "offramp", publicId: "offramp-1" }),
        ],
      }),
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

function emitSnapshot(stream: MockEventSource, payload: TransactionStreamResponse) {
  act(() => {
    stream.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  });
}

async function waitForStream() {
  await waitFor(() => {
    expect(MockEventSource.instances).toHaveLength(1);
  });

  return MockEventSource.instances[0]!;
}

function renderProvider() {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TransactionStreamProvider userId="user-1">
          <div>Transaction stream test</div>
        </TransactionStreamProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function buildSnapshot(
  overrides: Partial<TransactionStreamResponse> = {},
): TransactionStreamResponse {
  return {
    balances: {
      eurc: { formatted: "10.00", raw: "10000000" },
      sol: { formatted: "1.20", raw: "1200000000" },
      usdc: { formatted: "25.00", raw: "25000000" },
    },
    transactions: [],
    valuation: {
      assetValuesUsd: {
        eurc: "10.80",
        sol: "180.00",
        usdc: "25.00",
      },
      isStale: false,
      lastUpdatedAt: "2026-03-27T10:00:02.000Z",
      liquidTreasuryValueUsd: "215.80",
      pricesUsd: {
        eurc: "1.08",
        sol: "150.00",
        usdc: "1.00",
      },
      treasuryValueUsd: "215.80",
      unavailableAssets: [],
      yieldInvestedValueUsd: "15.00",
    },
    yield: {
      positions: {
        usdc: {
          currentPosition: { formatted: "15.00", raw: "15000000" },
          earnings: { formatted: "1.25", raw: "1250000" },
          status: "tracked",
          valueUsd: "15.00",
        },
      },
    },
    ...overrides,
  };
}

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
