import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Dashboard, { TOS_IFRAME_SANDBOX } from "@/Dashboard";
import type {
  AppUser,
  BridgeComplianceState,
  SolanaBalancesResponse,
} from "@/types";

const qrCodeDataUrlMock = vi.hoisted(() => vi.fn());

vi.mock("qrcode", () => ({
  default: {
    toDataURL: qrCodeDataUrlMock,
  },
}));

vi.mock("@coinbase/cdp-hooks", () => ({
  useSignOut: () => ({ signOut: vi.fn() }),
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

describe("Dashboard hardening", () => {
  beforeEach(() => {
    qrCodeDataUrlMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a hardened Bridge terms iframe with an external fallback", () => {
    render(
      <Dashboard
        balances={buildBalances()}
        valuation={buildValuation()}
        bridge={buildBridgeState({ showTosAlert: true })}
        onCreateOfframp={vi.fn()}
        onCreateOnramp={vi.fn()}
        onCreateRecipient={vi.fn()}
        onFetchSolanaTransactionContext={vi.fn()}
        onPersistSolanaAddress={vi.fn()}
        onRefreshBridgeStatus={vi.fn()}
        recipients={[]}
        transactions={[]}
        transactionsError={null}
        transactionsLoading={false}
        user={buildUser()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /review & accept/i }));

    const iframe = screen.getByTitle("Bridge Terms of Service");
    expect(iframe).toHaveAttribute("sandbox", TOS_IFRAME_SANDBOX);
    expect(iframe).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    expect(iframe).toHaveAttribute("loading", "lazy");

    const fallbackLink = screen.getByRole("link", { name: /open terms in new tab/i });
    expect(fallbackLink).toHaveAttribute("href", "https://bridge.example.com/terms");
  });

  it("shows a notice when Bridge KYC QR generation fails", async () => {
    qrCodeDataUrlMock.mockRejectedValueOnce(new Error("QR unavailable"));

    render(
      <Dashboard
        balances={buildBalances()}
        valuation={buildValuation()}
        bridge={buildBridgeState({ showKycAlert: true, showTosAlert: false })}
        onCreateOfframp={vi.fn()}
        onCreateOnramp={vi.fn()}
        onCreateRecipient={vi.fn()}
        onFetchSolanaTransactionContext={vi.fn()}
        onPersistSolanaAddress={vi.fn()}
        onRefreshBridgeStatus={vi.fn()}
        recipients={[]}
        transactions={[]}
        transactionsError={null}
        transactionsLoading={false}
        user={buildUser()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start verification/i }));

    await waitFor(() => {
      expect(
        screen.getByText("We could not generate the QR code. Continue in a new tab on this device instead."),
      ).toBeInTheDocument();
    });
  });

  it("renders the deposit action before on-ramp and removes the welcome wallet block", () => {
    render(
      <Dashboard
        balances={buildBalances()}
        valuation={buildValuation()}
        bridge={buildBridgeState()}
        onCreateOfframp={vi.fn()}
        onCreateOnramp={vi.fn()}
        onCreateRecipient={vi.fn()}
        onFetchSolanaTransactionContext={vi.fn()}
        onPersistSolanaAddress={vi.fn()}
        onRefreshBridgeStatus={vi.fn()}
        recipients={[]}
        transactions={[]}
        transactionsError={null}
        transactionsLoading={false}
        user={buildUser()}
      />,
    );

    const actionButtons = screen.getAllByRole("button");
    const depositIndex = actionButtons.findIndex(button => button.textContent?.includes("Deposit"));
    const onrampIndex = actionButtons.findIndex(button => button.textContent?.includes("On-ramp"));

    expect(depositIndex).toBeGreaterThan(-1);
    expect(onrampIndex).toBeGreaterThan(-1);
    expect(depositIndex).toBeLessThan(onrampIndex);
    expect(screen.queryByText("Wallet")).not.toBeInTheDocument();
    expect(screen.getAllByText("Treasury Value")[0]).toBeInTheDocument();
    expect(screen.queryByText(/live pricing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/price delayed/i)).not.toBeInTheDocument();
  });

  it("opens the deposit drawer with QR, address, and supported assets", async () => {
    qrCodeDataUrlMock.mockResolvedValueOnce("data:image/png;base64,deposit-qr");

    render(
      <Dashboard
        balances={buildBalances()}
        valuation={buildValuation()}
        bridge={buildBridgeState()}
        onCreateOfframp={vi.fn()}
        onCreateOnramp={vi.fn()}
        onCreateRecipient={vi.fn()}
        onFetchSolanaTransactionContext={vi.fn()}
        onPersistSolanaAddress={vi.fn()}
        onRefreshBridgeStatus={vi.fn()}
        recipients={[]}
        transactions={[]}
        transactionsError={null}
        transactionsLoading={false}
        user={buildUser()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /deposit/i })[0]);

    expect(await screen.findByText("Supported network")).toBeInTheDocument();
    expect(screen.getAllByText("Solana Mainnet")[0]).toBeInTheDocument();
    expect(screen.getByText("Supported assets")).toBeInTheDocument();
    expect(screen.getAllByText("USDC")[0]).toBeInTheDocument();
    expect(screen.getAllByText("EURC")[0]).toBeInTheDocument();
    expect(screen.getAllByText("SOL")[0]).toBeInTheDocument();
    expect(screen.getByText("11111111111111111111111111111111")).toBeInTheDocument();
    expect(await screen.findByAltText("Treasury deposit QR code")).toBeInTheDocument();
  });

  it("shows a notice when deposit QR generation fails", async () => {
    qrCodeDataUrlMock.mockRejectedValueOnce(new Error("QR unavailable"));

    render(
      <Dashboard
        balances={buildBalances()}
        valuation={buildValuation()}
        bridge={buildBridgeState()}
        onCreateOfframp={vi.fn()}
        onCreateOnramp={vi.fn()}
        onCreateRecipient={vi.fn()}
        onFetchSolanaTransactionContext={vi.fn()}
        onPersistSolanaAddress={vi.fn()}
        onRefreshBridgeStatus={vi.fn()}
        recipients={[]}
        transactions={[]}
        transactionsError={null}
        transactionsLoading={false}
        user={buildUser()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /deposit/i })[0]);

    await waitFor(() => {
      expect(
        screen.getByText("We could not generate the QR code. The wallet address is still available to copy."),
      ).toBeInTheDocument();
    });
  });

  it("renders SOL like the other assets with token amount under the label and USD value on the right", () => {
    render(
      <Dashboard
        balances={buildBalances()}
        valuation={buildValuation()}
        bridge={buildBridgeState()}
        onCreateOfframp={vi.fn()}
        onCreateOnramp={vi.fn()}
        onCreateRecipient={vi.fn()}
        onFetchSolanaTransactionContext={vi.fn()}
        onPersistSolanaAddress={vi.fn()}
        onRefreshBridgeStatus={vi.fn()}
        recipients={[]}
        transactions={[]}
        transactionsError={null}
        transactionsLoading={false}
        user={buildUser()}
      />,
    );

    expect(screen.getAllByText("SOL")[0]).toBeInTheDocument();
    expect(screen.getByText("1.00 SOL")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });
});

function buildBalances(): SolanaBalancesResponse["balances"] {
  return {
    sol: { formatted: "1.00", raw: "1000000000" },
    usdc: { formatted: "25.00", raw: "25000000" },
    eurc: { formatted: "10.00", raw: "10000000" },
  };
}

function buildValuation(
  overrides: Partial<SolanaBalancesResponse["valuation"]> = {},
): SolanaBalancesResponse["valuation"] {
  return {
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
    ...overrides,
  };
}

function buildBridgeState(
  overrides: Partial<BridgeComplianceState> = {},
): BridgeComplianceState {
  return {
    customerStatus: "active",
    hasAcceptedTermsOfService: false,
    showKycAlert: false,
    showTosAlert: false,
    ...overrides,
  };
}

function buildUser(): AppUser {
  return {
    id: 1,
    cdpUserId: "cdp-user-1",
    email: "user@example.com",
    accountType: "individual",
    fullName: "Monra User",
    countryCode: "UA",
    countryName: "Ukraine",
    businessName: null,
    solanaAddress: "11111111111111111111111111111111",
    bridgeKycLinkId: null,
    bridgeKycLink: "https://bridge.example.com/kyc",
    bridgeTosLink: "https://bridge.example.com/terms",
    bridgeKycStatus: "not_started",
    bridgeTosStatus: "pending",
    bridgeCustomerId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
