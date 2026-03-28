import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardRouteComponent from "@/routes/dashboard-route";
import { renderWithQueryClient } from "@/test-utils";

const sessionMock = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

const dashboardSnapshotMock = vi.hoisted(() => ({
  useDashboardSnapshot: vi.fn(),
}));

const transactionStreamMock = vi.hoisted(() => ({
  useTransactionStreamStatus: vi.fn(),
}));

const dashboardMutationsMock = vi.hoisted(() => ({
  useCreateOfframpMutation: vi.fn(),
  useCreateOnrampMutation: vi.fn(),
  useFetchSolanaTransactionContext: vi.fn(),
}));

const recipientsQueryMock = vi.hoisted(() => ({
  useRecipientsQuery: vi.fn(),
}));

const recipientsMutationMock = vi.hoisted(() => ({
  useCreateRecipientMutation: vi.fn(),
}));

const sessionMutationsMock = vi.hoisted(() => ({
  useSaveSolanaAddressMutation: vi.fn(),
  useSyncBridgeStatusMutation: vi.fn(),
}));

vi.mock("@coinbase/cdp-hooks", () => ({
  useSolanaAddress: () => ({ solanaAddress: "11111111111111111111111111111111" }),
  useSignOut: () => ({ signOut: vi.fn() }),
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
vi.mock("@/features/dashboard/use-dashboard-mutations", () => dashboardMutationsMock);
vi.mock("@/features/recipients/use-recipients-query", () => recipientsQueryMock);
vi.mock("@/features/recipients/use-recipient-mutations", () => recipientsMutationMock);
vi.mock("@/features/session/use-session-mutations", () => sessionMutationsMock);
vi.mock("@/features/transactions/use-transaction-stream-status", () => transactionStreamMock);

describe("DashboardRouteComponent", () => {
  beforeEach(() => {
    sessionMock.useSession.mockReturnValue({
      bridge: {
        customerStatus: "active",
        hasAcceptedTermsOfService: true,
        showKycAlert: false,
        showTosAlert: false,
      },
      identity: {
        cdpUserId: "cdp-user-1",
        email: "user@example.com",
      },
      user: {
        id: 1,
        publicId: "00000000-0000-4000-8000-000000000001",
        cdpUserId: "cdp-user-1",
        email: "user@example.com",
        accountType: "individual",
        fullName: "Monra User",
        countryCode: "UA",
        countryName: "Ukraine",
        businessName: null,
        solanaAddress: "11111111111111111111111111111111",
        bridgeKycLinkId: null,
        bridgeKycLink: null,
        bridgeTosLink: null,
        bridgeKycStatus: "active",
        bridgeTosStatus: "approved",
        bridgeCustomerId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
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
          liquidTreasuryValueUsd: "176.80",
          yieldInvestedValueUsd: "10.00",
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
        yield: {
          positions: {
            usdc: {
              currentPosition: { formatted: "10.00", raw: "10000000" },
              earnings: { formatted: "1.00", raw: "1000000" },
              status: "tracked",
              valueUsd: "10.00",
            },
          },
        },
        transactions: [],
      },
      error: null,
      isPending: false,
    });
    transactionStreamMock.useTransactionStreamStatus.mockReturnValue({
      isLive: false,
      transactionsError: null,
    });
    recipientsQueryMock.useRecipientsQuery.mockReturnValue({
      data: { recipients: [] },
    });
    recipientsMutationMock.useCreateRecipientMutation.mockReturnValue({
      mutateAsync: vi.fn(async payload => ({ recipient: payload })),
    });
    dashboardMutationsMock.useCreateOfframpMutation.mockReturnValue({
      mutateAsync: vi.fn(async () => ({ transaction: { id: 1 } })),
    });
    dashboardMutationsMock.useCreateOnrampMutation.mockReturnValue({
      mutateAsync: vi.fn(async () => ({ transaction: { id: 1 } })),
    });
    dashboardMutationsMock.useFetchSolanaTransactionContext.mockReturnValue(vi.fn());
    sessionMutationsMock.useSaveSolanaAddressMutation.mockReturnValue({
      mutateAsync: vi.fn(async () => ({ user: {} })),
    });
    sessionMutationsMock.useSyncBridgeStatusMutation.mockReturnValue({
      mutateAsync: vi.fn(async () => ({ bridge: {}, user: {} })),
    });
  });

  it("renders the dashboard shell", () => {
    renderWithQueryClient(<DashboardRouteComponent />);

    expect(screen.getByText("Treasury Value")).toBeInTheDocument();
    expect(screen.getByText("Treasury Overview")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });
});
