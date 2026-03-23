import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import YieldPage from "@/YieldPage";
import { renderWithQueryClient } from "@/test-utils";

const cdpHooksMock = vi.hoisted(() => ({
  useSendSolanaTransaction: vi.fn(),
  useSignOut: vi.fn(),
  useSolanaAddress: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

const dashboardSnapshotMock = vi.hoisted(() => ({
  useDashboardSnapshot: vi.fn(),
}));

const persistedSolanaAddressMock = vi.hoisted(() => ({
  usePersistedSolanaAddress: vi.fn(),
}));

const yieldLedgerSummaryMock = vi.hoisted(() => ({
  useYieldLedgerSummary: vi.fn(),
}));

const yieldOnchainQueryMock = vi.hoisted(() => ({
  useYieldOnchainQuery: vi.fn(),
}));

const yieldPreviewQueryMock = vi.hoisted(() => ({
  useYieldPreviewQuery: vi.fn(),
}));

const yieldConfirmMutationMock = vi.hoisted(() => ({
  useYieldConfirmMutation: vi.fn(),
}));

vi.mock("@coinbase/cdp-hooks", () => cdpHooksMock);
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
vi.mock("@/features/session/use-persisted-solana-address", () => persistedSolanaAddressMock);
vi.mock("@/features/yield/use-yield-ledger-summary", () => yieldLedgerSummaryMock);
vi.mock("@/features/yield/use-yield-onchain-query", () => yieldOnchainQueryMock);
vi.mock("@/features/yield/use-yield-preview-query", () => yieldPreviewQueryMock);
vi.mock("@/features/yield/use-yield-confirm-mutation", () => yieldConfirmMutationMock);

describe("YieldPage", () => {
  beforeEach(() => {
    cdpHooksMock.useSendSolanaTransaction.mockReturnValue({
      sendSolanaTransaction: vi.fn(),
    });
    cdpHooksMock.useSignOut.mockReturnValue({
      signOut: vi.fn(),
    });
    cdpHooksMock.useSolanaAddress.mockReturnValue({
      solanaAddress: "11111111111111111111111111111111",
    });
    sessionMock.useSession.mockReturnValue({
      user: {
        cdpUserId: "cdp-user-1",
        solanaAddress: "11111111111111111111111111111111",
      },
    });
    dashboardSnapshotMock.useDashboardSnapshot.mockReturnValue({
      data: {
        valuation: {
          assetValuesUsd: {
            eurc: "0.55",
            sol: "150.00",
            usdc: "1.75",
          },
          isStale: false,
          lastUpdatedAt: "2026-03-23T10:00:00.000Z",
          pricesUsd: {
            eurc: "1.10",
            sol: "150.00",
            usdc: "1.00",
          },
          treasuryValueUsd: "152.30",
          unavailableAssets: [],
        },
      },
    });
    persistedSolanaAddressMock.usePersistedSolanaAddress.mockReturnValue({
      effectiveSolanaAddress: "11111111111111111111111111111111",
      isPersistingSolanaAddress: false,
      persistenceError: null,
      storedSolanaAddress: "11111111111111111111111111111111",
    });
    yieldLedgerSummaryMock.useYieldLedgerSummary.mockReturnValue({
      data: {
        ledgerSummary: {
          eurc: {
            formatted: "0.5",
            raw: "500000",
          },
          usdc: {
            formatted: "1.5",
            raw: "1500000",
          },
        },
      },
      error: null,
    });
    yieldOnchainQueryMock.useYieldOnchainQuery.mockReturnValue({
      data: {
        vaults: {
          eurc: {
            asset: "eurc",
            decimals: 6,
            jlTokenMintAddress: "jl-eurc",
            rewardsRateRaw: "2600000000",
            supplyRateRaw: "0",
            totalAssetsRaw: "13300000000000",
            totalSupplyRaw: "13300000000000",
            underlyingAddress: "eurc-mint",
            userJlTokenSharesRaw: "500000",
            userPositionRaw: "500000",
            walletBalanceRaw: "0",
          },
          usdc: {
            asset: "usdc",
            decimals: 6,
            jlTokenMintAddress: "jl-usdc",
            rewardsRateRaw: "5000000000",
            supplyRateRaw: "30000000000",
            totalAssetsRaw: "524000000000000",
            totalSupplyRaw: "522000000000000",
            underlyingAddress: "usdc-mint",
            userJlTokenSharesRaw: "1750000",
            userPositionRaw: "1750000",
            walletBalanceRaw: "18870000",
          },
        },
      },
      error: null,
    });
    yieldPreviewQueryMock.useYieldPreviewQuery.mockReturnValue({
      data: null,
      error: null,
    });
    yieldConfirmMutationMock.useYieldConfirmMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });
  });

  it("renders the earn overview and opens the vault dialog", () => {
    renderWithQueryClient(<YieldPage />);

    expect(screen.getByText("Earn interest on your stablecoins")).toBeInTheDocument();
    expect(screen.getByText("Your Deposits")).toBeInTheDocument();
    expect(screen.getByText("Projected Annual Yield")).toBeInTheDocument();
    expect(screen.getByText("Stablecoin vaults only")).toBeInTheDocument();

    const vaultRowButton = screen
      .getAllByRole("button")
      .find(button => button.textContent?.includes("USDC") && button.textContent?.includes("Jupiter Earn vault"));

    expect(vaultRowButton).toBeTruthy();
    fireEvent.click(vaultRowButton!);

    expect(
      screen.getByText("Manage your Jupiter Earn position and record it in the Monra ledger."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Deposit").length).toBeGreaterThan(0);
  });
});
