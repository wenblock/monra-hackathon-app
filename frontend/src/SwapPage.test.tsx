import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SwapPage from "@/SwapPage";
import { renderWithQueryClient } from "@/test-utils";
import type { AppTransaction, SwapOrderResponse } from "@/types";

const signSolanaTransactionMock = vi.hoisted(() => vi.fn());
const fetchSwapOrderMock = vi.hoisted(() => vi.fn());
const executeSwapMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => ({
  useSession: vi.fn(),
}));
const dashboardSnapshotMock = vi.hoisted(() => ({
  useDashboardSnapshot: vi.fn(),
}));
const persistedAddressMock = vi.hoisted(() => ({
  usePersistedSolanaAddress: vi.fn(),
}));
const apiClientMock = vi.hoisted(() => ({
  useApiClient: vi.fn(),
}));
const swapMutationsMock = vi.hoisted(() => ({
  useExecuteSwapMutation: vi.fn(),
}));

vi.mock("@coinbase/cdp-hooks", () => ({
  useSignOut: () => ({ signOut: vi.fn() }),
  useSignSolanaTransaction: () => ({ signSolanaTransaction: signSolanaTransactionMock }),
  useSolanaAddress: () => ({ solanaAddress: "11111111111111111111111111111111" }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: Record<string, unknown>) => {
    delete props.activeProps;
    delete props.inactiveProps;
    delete props.preload;
    delete props.to;

    return (
      <a {...props}>
        {typeof children === "function"
          ? children({ isActive: false, isTransitioning: false })
          : children}
      </a>
    );
  },
}));
vi.mock("@/features/session/use-session", () => sessionMock);
vi.mock("@/features/dashboard/use-dashboard-snapshot", () => dashboardSnapshotMock);
vi.mock("@/features/session/use-persisted-solana-address", () => persistedAddressMock);
vi.mock("@/features/session/use-api-client", () => apiClientMock);
vi.mock("@/features/swaps/use-swap-mutations", () => swapMutationsMock);

describe("SwapPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.useRealTimers();

    signSolanaTransactionMock.mockReset();
    fetchSwapOrderMock.mockReset();
    executeSwapMock.mockReset();

    signSolanaTransactionMock.mockResolvedValue({
      signedTransaction: "signed-transaction",
    });
    fetchSwapOrderMock
      .mockResolvedValueOnce(buildSwapOrder({ quotedAt: "2026-03-20T10:00:00.000Z" }))
      .mockResolvedValue(buildSwapOrder({ quotedAt: "2026-03-20T10:00:04.000Z" }));
    executeSwapMock.mockResolvedValue({
      balances: {
        sol: { formatted: "1.00", raw: "1000000000" },
        usdc: { formatted: "15.00", raw: "15000000" },
        eurc: { formatted: "18.64", raw: "18645700" },
      },
      transaction: buildSwapTransaction(),
    });

    sessionMock.useSession.mockReturnValue({
      user: {
        cdpUserId: "cdp-user-1",
      },
    });
    dashboardSnapshotMock.useDashboardSnapshot.mockReturnValue({
      data: {
        balances: {
          sol: { formatted: "1.00", raw: "1000000000" },
          usdc: { formatted: "25.00", raw: "25000000" },
          eurc: { formatted: "10.00", raw: "10000000" },
        },
        valuation: {
          treasuryValueUsd: "186.80",
          assetValuesUsd: {
            sol: "150.00",
            usdc: "25.00",
            eurc: "10.80",
          },
          pricesUsd: {
            sol: "150.00",
            usdc: "1.00",
            eurc: "1.08",
          },
          lastUpdatedAt: "2026-03-20T09:00:02.000Z",
          isStale: false,
          unavailableAssets: [],
        },
      },
      error: null,
    });
    persistedAddressMock.usePersistedSolanaAddress.mockReturnValue({
      effectiveSolanaAddress: "11111111111111111111111111111111",
      isPersistingSolanaAddress: false,
      persistenceError: null,
      storedSolanaAddress: "11111111111111111111111111111111",
    });
    apiClientMock.useApiClient.mockReturnValue({
      fetchSwapOrder: fetchSwapOrderMock,
    });
    swapMutationsMock.useExecuteSwapMutation.mockReturnValue({
      isPending: false,
      mutateAsync: executeSwapMock,
    });

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: vi.fn(() => true),
    });
  });

  it(
    "requests a debounced Jupiter quote and polls it every 4 seconds",
    async () => {
    renderWithQueryClient(<SwapPage />);

    fireEvent.change(screen.getAllByPlaceholderText("0.0")[0], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(fetchSwapOrderMock).toHaveBeenCalledTimes(1);
    }, { timeout: 1500 });

    await waitFor(() => {
      expect(fetchSwapOrderMock).toHaveBeenCalledTimes(2);
    }, { timeout: 5000 });
    },
    8000,
  );

  it(
    "refreshes stale quotes before signing and executing",
    async () => {
    fetchSwapOrderMock.mockReset();
    fetchSwapOrderMock
      .mockResolvedValueOnce(buildSwapOrder({ quotedAt: "2026-03-20T09:59:50.000Z" }))
      .mockResolvedValue(buildSwapOrder({ quotedAt: "2026-03-20T10:00:04.000Z" }));

    renderWithQueryClient(<SwapPage />);

    fireEvent.change(screen.getAllByPlaceholderText("0.0")[0], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(fetchSwapOrderMock).toHaveBeenCalled();
    }, { timeout: 1500 });

    await screen.findByText("8.6457");
    const quoteRequestsBeforeSubmit = fetchSwapOrderMock.mock.calls.length;

    const submitButton = screen
      .getAllByRole("button", { name: "Swap" })
      .find(button => !button.hasAttribute("disabled"));

    fireEvent.click(submitButton!);

    await waitFor(() => {
      expect(fetchSwapOrderMock.mock.calls.length).toBeGreaterThan(quoteRequestsBeforeSubmit);
    });

    await waitFor(() => {
      expect(signSolanaTransactionMock).toHaveBeenCalledWith({
        solanaAccount: "11111111111111111111111111111111",
        transaction: "base64-order-transaction",
      });
    });

    expect(executeSwapMock).toHaveBeenCalledWith({
      requestId: "request-1",
      signedTransaction: "signed-transaction",
    });
    expect(await screen.findByText("Swap complete")).toBeInTheDocument();
    },
    8000,
  );
});

function buildSwapOrder(
  overrides: Partial<SwapOrderResponse> = {},
): SwapOrderResponse {
  return {
    requestId: "request-1",
    quotedAt: "2026-03-20T10:00:00.000Z",
    quote: {
      feeBps: 12,
      feeMint: "fee-mint",
      inputAmountDecimal: "10",
      inputAmountRaw: "10000000",
      inputAsset: "usdc",
      mode: "ExactIn",
      outputAmountDecimal: "8.6457",
      outputAmountRaw: "8645700",
      outputAsset: "eurc",
      router: "iris",
    },
    transaction: "base64-order-transaction",
    ...overrides,
  };
}

function buildSwapTransaction(): AppTransaction {
  return {
    id: 42,
    publicId: "00000000-0000-4000-8000-000000000042",
    userId: 1,
    recipientId: null,
    direction: "outbound",
    entryType: "swap",
    asset: "usdc",
    amountDecimal: "10",
    amountRaw: "10000000",
    amountDisplay: "10",
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
    outputAsset: "eurc",
    outputAmountDecimal: "8.6457",
    outputAmountRaw: "8645700",
    outputAmountDisplay: "8.6457",
    networkFeeRaw: null,
    networkFeeDisplay: null,
    transactionSignature: "swap-signature",
    status: "confirmed",
    confirmedAt: "2026-03-20T10:01:00.000Z",
    failedAt: null,
    failureReason: null,
    createdAt: "2026-03-20T10:01:00.000Z",
    updatedAt: "2026-03-20T10:01:00.000Z",
  };
}
