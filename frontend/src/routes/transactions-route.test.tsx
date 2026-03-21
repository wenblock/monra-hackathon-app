import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TransactionsRouteComponent from "@/routes/transactions-route";
import { renderWithQueryClient } from "@/test-utils";

const sessionMock = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

const transactionsQueryMock = vi.hoisted(() => ({
  useInfiniteTransactionsQuery: vi.fn(),
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
vi.mock("@coinbase/cdp-hooks", () => ({
  useSolanaAddress: () => ({ solanaAddress: "11111111111111111111111111111111" }),
  useSignOut: () => ({ signOut: vi.fn() }),
}));
vi.mock("@/features/session/use-session", () => sessionMock);
vi.mock("@/features/transactions/use-transactions-query", () => transactionsQueryMock);

describe("TransactionsRouteComponent", () => {
  beforeEach(() => {
    sessionMock.useSession.mockReturnValue({
      user: { cdpUserId: "cdp-user-1" },
    });
  });

  it("renders transactions and handles load more", () => {
    const fetchNextPage = vi.fn(async () => undefined);
    transactionsQueryMock.useInfiniteTransactionsQuery.mockReturnValue({
      data: {
        pages: [
          {
            transactions: [
              {
                id: 1,
                publicId: "00000000-0000-4000-8000-000000000001",
                userId: 1,
                recipientId: null,
                direction: "inbound",
                entryType: "transfer",
                asset: "sol",
                amountDecimal: "1",
                amountRaw: "1000000000",
                amountDisplay: "1.00",
                network: "solana-mainnet",
                trackedWalletAddress: "11111111111111111111111111111111",
                fromWalletAddress: "22222222222222222222222222222222",
                counterpartyName: "Treasury",
                counterpartyWalletAddress: "22222222222222222222222222222222",
                bridgeTransferId: null,
                bridgeTransferStatus: null,
                bridgeSourceAmount: null,
                bridgeSourceCurrency: null,
                bridgeSourceDepositInstructions: null,
                bridgeDestinationTxHash: null,
                bridgeReceiptUrl: null,
                networkFeeRaw: null,
                networkFeeDisplay: null,
                transactionSignature: "sig-1",
                status: "confirmed",
                confirmedAt: "2026-03-20T10:00:00.000Z",
                failedAt: null,
                failureReason: null,
                createdAt: "2026-03-20T10:00:00.000Z",
                updatedAt: "2026-03-20T10:00:00.000Z",
              },
            ],
            nextCursor: "cursor-2",
          },
        ],
      },
      error: null,
      fetchNextPage,
      isFetchingNextPage: false,
      isPending: false,
    });

    renderWithQueryClient(<TransactionsRouteComponent />);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });
});
