import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RecipientsRouteComponent from "@/routes/recipients-route";
import { renderWithQueryClient } from "@/test-utils";

const sessionMock = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

const recipientsQueryMock = vi.hoisted(() => ({
  useRecipientsQuery: vi.fn(),
}));

const recipientsMutationMock = vi.hoisted(() => ({
  useCreateRecipientMutation: vi.fn(),
  useDeleteRecipientMutation: vi.fn(),
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
vi.mock("@/features/recipients/use-recipients-query", () => recipientsQueryMock);
vi.mock("@/features/recipients/use-recipient-mutations", () => recipientsMutationMock);

describe("RecipientsRouteComponent", () => {
  beforeEach(() => {
    sessionMock.useSession.mockReturnValue({
      user: { cdpUserId: "cdp-user-1" },
    });
    recipientsQueryMock.useRecipientsQuery.mockReturnValue({
      data: { recipients: [] },
      error: null,
      isPending: false,
    });
    recipientsMutationMock.useCreateRecipientMutation.mockReturnValue({
      mutateAsync: vi.fn(async payload => ({ recipient: payload })),
    });
    recipientsMutationMock.useDeleteRecipientMutation.mockReturnValue({
      mutateAsync: vi.fn(async () => undefined),
    });
  });

  it("renders the recipients empty state", () => {
    renderWithQueryClient(<RecipientsRouteComponent />);

    expect(
      screen.getAllByText("No recipients yet. Add a wallet or SEPA bank recipient to get started."),
    ).toHaveLength(2);
  });
});
