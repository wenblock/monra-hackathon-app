import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    signSolanaTransactionMock.mockReset();
    fetchSwapOrderMock.mockReset();
    executeSwapMock.mockReset();

    signSolanaTransactionMock.mockResolvedValue({
      signedTransaction: "signed-transaction",
    });
    fetchSwapOrderMock.mockResolvedValue(buildSwapOrder());
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
  });

  it("requests a Jupiter quote after the sell amount changes", async () => {
    renderWithQueryClient(<SwapPage />);

    fireEvent.change(screen.getAllByPlaceholderText("0.0")[0], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(fetchSwapOrderMock).toHaveBeenCalledWith(
        {
          amount: "10",
          inputAsset: "usdc",
          outputAsset: "eurc",
        },
        expect.anything(),
      );
    }, { timeout: 3000 });
  });

  it("signs and executes the swap, then shows a success toast", async () => {
    renderWithQueryClient(<SwapPage />);

    fireEvent.change(screen.getAllByPlaceholderText("0.0")[0], {
      target: { value: "10" },
    });

    await screen.findByText("8.6457", {}, { timeout: 3000 });

    let submitButton: HTMLElement | undefined;

    await waitFor(() => {
      submitButton = screen
        .getAllByRole("button", { name: "Swap" })
        .find(button => !button.hasAttribute("disabled"));
      expect(submitButton).toBeDefined();
      expect(submitButton).toBeEnabled();
    }, { timeout: 3000 });

    fireEvent.click(submitButton!);

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
  });
});

function buildSwapOrder(): SwapOrderResponse {
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
  };
}

function buildSwapTransaction(): AppTransaction {
  return {
    id: 42,
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
