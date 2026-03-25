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

const yieldPositionsMock = vi.hoisted(() => ({
  useYieldPositions: vi.fn(),
}));

const yieldOnchainQueryMock = vi.hoisted(() => ({
  useYieldOnchainQuery: vi.fn(),
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
vi.mock("@/features/yield/use-yield-positions", () => yieldPositionsMock);
vi.mock("@/features/yield/use-yield-onchain-query", () => yieldOnchainQueryMock);
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
        balances: {
          eurc: { formatted: "10.00", raw: "10000000" },
          sol: { formatted: "1.00", raw: "1000000000" },
          usdc: { formatted: "4.46", raw: "4467116" },
        },
        valuation: {
          assetValuesUsd: {
            eurc: "10.80",
            sol: "150.00",
            usdc: "4.46",
          },
          isStale: false,
          lastUpdatedAt: "2026-03-23T10:00:00.000Z",
          liquidTreasuryValueUsd: "165.26",
          pricesUsd: {
            eurc: "1.08",
            sol: "150.00",
            usdc: "1.00",
          },
          treasuryValueUsd: "169.73",
          unavailableAssets: [],
          yieldInvestedValueUsd: "4.47",
        },
        yield: {
          positions: {
            usdc: {
              currentPosition: {
                formatted: "4.467099",
                raw: "4467099",
              },
              earnings: {
                formatted: "2.967099",
                raw: "2967099",
              },
              status: "tracked",
              valueUsd: "4.47",
            },
          },
        },
      },
    });
    persistedSolanaAddressMock.usePersistedSolanaAddress.mockReturnValue({
      effectiveSolanaAddress: "11111111111111111111111111111111",
      isPersistingSolanaAddress: false,
      persistenceError: null,
      storedSolanaAddress: "11111111111111111111111111111111",
    });
    yieldPositionsMock.useYieldPositions.mockReturnValue({
      data: {
        positions: {
          usdc: {
            grossWithdrawn: {
              formatted: "0",
              raw: "0",
            },
            principal: {
              formatted: "1.5",
              raw: "1500000",
            },
            totalDeposited: {
              formatted: "1.5",
              raw: "1500000",
            },
            updatedAt: "2026-03-25T00:00:00.000Z",
          },
        },
      },
      error: null,
    });
    yieldOnchainQueryMock.useYieldOnchainQuery.mockReturnValue({
      data: {
        vaults: {
          usdc: {
            asset: "usdc",
            conversionRateToSharesRaw: "990000",
            decimals: 6,
            jlTokenMintAddress: "jl-usdc",
            rewardsRateRaw: "0",
            supplyRateRaw: "223",
            totalAssetsRaw: "517700000000000",
            totalSupplyRaw: "515000000000000",
            underlyingAddress: "usdc-mint",
            userJlTokenSharesRaw: "4467099",
            userPositionRaw: "4467099",
            walletBalanceRaw: "4467116",
          },
        },
      },
      error: null,
    });
    yieldConfirmMutationMock.useYieldConfirmMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });
  });

  it("renders the usdc-only overview and opens the compact vault dialog", () => {
    renderWithQueryClient(<YieldPage />);

    expect(screen.getByText("Earn interest on your USDC")).toBeInTheDocument();
    expect(screen.getByText("Deposit treasury USDC into Jupiter's Earn vault.")).toBeInTheDocument();
    expect(screen.queryByText("Jupiter Lend Earn")).not.toBeInTheDocument();
    expect(screen.queryByText("USDC-only vault")).not.toBeInTheDocument();
    expect(screen.queryByText("USDC vault only")).not.toBeInTheDocument();
    expect(screen.getByText("Your Deposits")).toBeInTheDocument();
    expect(screen.getByText("Projected Annual Yield")).toBeInTheDocument();
    expect(screen.getByText("2.23%")).toBeInTheDocument();
    expect(screen.getByText("517.7M USDC")).toBeInTheDocument();
    expect(screen.queryByText("EURC")).not.toBeInTheDocument();
    expect(screen.getByAltText("USDC token icon")).toHaveAttribute("src", "/jlusdc.webp");

    const vaultRowButton = screen
      .getAllByRole("button")
      .find(button => button.textContent?.includes("USDC") && button.textContent?.includes("Jupiter Earn vault"));

    expect(vaultRowButton).toBeTruthy();
    fireEvent.click(vaultRowButton!);

    expect(screen.getByText("Deposit into the Jupiter Earn vault.")).toBeInTheDocument();
    expect(screen.getAllByText("Deposit").length).toBeGreaterThan(0);
    expect(screen.getByText("Vault TVL")).toBeInTheDocument();
    expect(screen.getAllByText("517.7M USDC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$517.7M").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ledger scope")).not.toBeInTheDocument();
  });

  it("computes the preview locally when the amount changes", () => {
    renderWithQueryClient(<YieldPage />);

    const vaultRowButton = screen
      .getAllByRole("button")
      .find(button => button.textContent?.includes("USDC") && button.textContent?.includes("Jupiter Earn vault"));

    fireEvent.click(vaultRowButton!);
    fireEvent.change(screen.getAllByPlaceholderText("0.00").at(-1)!, {
      target: { value: "1.5" },
    });

    expect(screen.getByText(/Estimated shares minted:/)).toBeInTheDocument();
    expect(screen.getByText(/1.485/)).toBeInTheDocument();
  });

  it("renders non-Error yield query failures without crashing", () => {
    yieldOnchainQueryMock.useYieldOnchainQuery.mockReturnValue({
      data: undefined,
      error: {
        message: "Buffer is not defined",
      },
    });

    renderWithQueryClient(<YieldPage />);

    expect(screen.getByText("Yield market data unavailable")).toBeInTheDocument();
    expect(screen.getByText("Buffer is not defined")).toBeInTheDocument();
  });

  it("shows zeroed values for existing positions with no recorded principal", () => {
    yieldPositionsMock.useYieldPositions.mockReturnValue({
      data: {
        positions: {
          usdc: {
            grossWithdrawn: {
              formatted: "0",
              raw: "0",
            },
            principal: {
              formatted: "0",
              raw: "0",
            },
            totalDeposited: {
              formatted: "0",
              raw: "0",
            },
            updatedAt: null,
          },
        },
      },
      error: null,
    });

    renderWithQueryClient(<YieldPage />);

    expect(screen.queryByText("Untracked position")).not.toBeInTheDocument();
    expect(screen.queryByText("Untracked")).not.toBeInTheDocument();
    expect(screen.getAllByText("0 USDC").length).toBeGreaterThan(1);

    const vaultRowButton = screen
      .getAllByRole("button")
      .find(button => button.textContent?.includes("USDC") && button.textContent?.includes("Jupiter Earn vault"));

    fireEvent.click(vaultRowButton!);

    expect(screen.queryByText("Ledger scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Untracked")).not.toBeInTheDocument();
    expect(screen.getAllByText("0 USDC").length).toBeGreaterThan(3);
    expect(screen.getAllByText("$0.00").length).toBeGreaterThan(1);
  });
});
