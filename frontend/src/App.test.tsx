import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import App from "@/App";
import { renderWithQueryClient } from "@/test-utils";
import type { SessionBootstrapResponse } from "@/types";

const cdpHooksMock = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  useIsInitialized: vi.fn(),
  useIsSignedIn: vi.fn(),
  useSignOut: vi.fn(),
}));

const sessionBootstrapMock = vi.hoisted(() => ({
  useSessionBootstrap: vi.fn(),
}));

const sessionMutationMock = vi.hoisted(() => ({
  useSubmitOnboardingMutation: vi.fn(),
}));

const appSignOutMock = vi.hoisted(() => ({
  useAppSignOut: vi.fn(),
}));

vi.mock("@coinbase/cdp-hooks", () => cdpHooksMock);
vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div data-testid="app-outlet" />,
}));
vi.mock("@/SignInScreen", () => ({
  default: ({ error }: { error?: string }) => (
    <div>
      <div>Global payments, simplified</div>
      <div>Send and receive money instantly with stablecoins</div>
      <div>Secure • No passwords</div>
      {error ? <div>{error}</div> : null}
    </div>
  ),
}));
vi.mock("@/OnboardingScreen", () => ({
  default: () => <div>Set up your Monra account</div>,
}));
vi.mock("@/features/session/use-session-bootstrap", () => sessionBootstrapMock);
vi.mock("@/features/session/use-app-sign-out", () => appSignOutMock);
vi.mock("@/features/session/use-session-mutations", () => sessionMutationMock);
vi.mock("@/features/transactions/transaction-stream-provider", () => ({
  TransactionStreamProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const sharedSignOutMock = vi.hoisted(() => vi.fn());

describe("App", () => {
  beforeEach(() => {
    cdpHooksMock.useCurrentUser.mockReturnValue({ currentUser: null });
    cdpHooksMock.useIsInitialized.mockReturnValue({ isInitialized: true });
    cdpHooksMock.useIsSignedIn.mockReturnValue({ isSignedIn: false });
    cdpHooksMock.useSignOut.mockReturnValue({ signOut: vi.fn().mockResolvedValue(undefined) });
    sharedSignOutMock.mockReset();
    sharedSignOutMock.mockResolvedValue(undefined);
    appSignOutMock.useAppSignOut.mockReturnValue({
      signOut: sharedSignOutMock,
    });
    sessionBootstrapMock.useSessionBootstrap.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isPending: false,
    });
    sessionMutationMock.useSubmitOnboardingMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    });
  });

  it("renders the sign-in screen when unauthenticated", async () => {
    renderWithQueryClient(<App />);

    expect(await screen.findByText("Global payments, simplified")).toBeInTheDocument();
    expect(screen.getByText("Send and receive money instantly with stablecoins")).toBeInTheDocument();
    expect(screen.getByText("Secure • No passwords")).toBeInTheDocument();
  });

  it("renders onboarding when the session needs onboarding", async () => {
    cdpHooksMock.useCurrentUser.mockReturnValue({ currentUser: { userId: "cdp-user-1" } });
    cdpHooksMock.useIsSignedIn.mockReturnValue({ isSignedIn: true });
    sessionBootstrapMock.useSessionBootstrap.mockReturnValue({
      data: buildSession({
        status: "needs_onboarding",
        bridge: null,
        user: null,
      }),
      error: null,
      isError: false,
      isPending: false,
    });

    renderWithQueryClient(<App />);

    expect(await screen.findByText("Set up your Monra account")).toBeInTheDocument();
  });

  it("renders the authenticated outlet when the session is active", () => {
    cdpHooksMock.useCurrentUser.mockReturnValue({ currentUser: { userId: "cdp-user-1" } });
    cdpHooksMock.useIsSignedIn.mockReturnValue({ isSignedIn: true });
    sessionBootstrapMock.useSessionBootstrap.mockReturnValue({
      data: buildSession(),
      error: null,
      isError: false,
      isPending: false,
    });

    renderWithQueryClient(<App />);

    expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
  });

  it("routes bootstrap-auth failures through the shared app sign-out helper", async () => {
    cdpHooksMock.useCurrentUser.mockReturnValue({ currentUser: { userId: "cdp-user-1" } });
    cdpHooksMock.useIsSignedIn.mockReturnValue({ isSignedIn: true });
    sessionBootstrapMock.useSessionBootstrap.mockReturnValue({
      data: undefined,
      error: new Error("Backend session failed"),
      isError: true,
      isPending: false,
    });

    renderWithQueryClient(<App />);

    expect(await screen.findByText("Backend session failed")).toBeInTheDocument();
    await waitFor(() => {
      expect(sharedSignOutMock).toHaveBeenCalledTimes(1);
    });
  });
});

function buildSession(overrides: Partial<SessionBootstrapResponse> = {}): SessionBootstrapResponse {
  return {
    status: "active",
    identity: {
      cdpUserId: "cdp-user-1",
      email: "user@example.com",
    },
    bridge: {
      customerStatus: "active",
      hasAcceptedTermsOfService: true,
      showKycAlert: false,
      showTosAlert: false,
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
    ...overrides,
  };
}
