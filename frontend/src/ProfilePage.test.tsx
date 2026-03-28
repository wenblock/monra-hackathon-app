import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "@/ProfilePage";
import { renderWithQueryClient } from "@/test-utils";
import type { AppUser, BridgeComplianceState } from "@/types";

const cdpHooksMock = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  useSignOut: vi.fn(),
  useSolanaAddress: vi.fn(),
}));
const sessionMock = vi.hoisted(() => ({
  useSession: vi.fn(),
}));
const cdpCoreMock = vi.hoisted(() => ({
  getEnabledMfaMethods: vi.fn(),
  getEnrolledMfaMethods: vi.fn(),
  isEnrolledInMfa: vi.fn(),
}));

vi.mock("@coinbase/cdp-hooks", () => cdpHooksMock);
vi.mock("@coinbase/cdp-core", () => cdpCoreMock);
vi.mock("@/features/session/use-session", () => sessionMock);

vi.mock("@coinbase/cdp-react/components/EnrollMfaModal", () => ({
  EnrollMfaModal: ({
    children,
    onEnrollSuccess,
  }: {
    children?: ReactNode;
    onEnrollSuccess?: () => void;
  }) => (
    <div data-testid="enroll-mfa-modal">
      {children}
      <button type="button" onClick={() => onEnrollSuccess?.()}>
        Complete MFA enrollment
      </button>
    </div>
  ),
}));

vi.mock("@coinbase/cdp-react/components/ExportWalletModal", () => ({
  ExportWalletModal: ({
    address,
    children,
  }: {
    address: string;
    children?: ReactNode;
  }) => (
    <div data-testid="export-wallet-modal" data-address={address}>
      {children}
    </div>
  ),
  ExportWalletModalContent: ({
    className,
    title,
  }: {
    className?: string;
    title?: string;
  }) => (
    <div data-testid="export-wallet-modal-content" className={className}>
      {title}
    </div>
  ),
  ExportWalletModalTrigger: ({
    label,
    className,
  }: {
    label?: string;
    className?: string;
  }) => (
    <button type="button" className={className}>
      {label ?? "Export wallet"}
    </button>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: Record<string, unknown>) => {
    const href = typeof props.to === "string" ? props.to : undefined;
    delete props.activeProps;
    delete props.inactiveProps;
    delete props.preload;
    delete props.to;

    return (
      <a href={href} {...props}>
        {typeof children === "function"
          ? children({ isActive: false, isTransitioning: false })
          : children}
      </a>
    );
  },
}));

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cdpHooksMock.useCurrentUser.mockReturnValue({
      currentUser: buildCdpUser(),
    });
    sessionMock.useSession.mockReturnValue({
      user: {
        fullName: "Monra User",
      },
    });
    cdpHooksMock.useSignOut.mockReturnValue({
      signOut: vi.fn(),
    });
    cdpHooksMock.useSolanaAddress.mockReturnValue({
      solanaAddress: "11111111111111111111111111111111",
    });
    cdpCoreMock.getEnabledMfaMethods.mockReturnValue(["totp", "sms"]);
    cdpCoreMock.getEnrolledMfaMethods.mockReturnValue([]);
    cdpCoreMock.isEnrolledInMfa.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to the account information tab and renders profile fields", () => {
    renderWithQueryClient(
      <ProfilePage
        bridge={buildBridgeState()}
        user={buildUser()}
        walletAddress="11111111111111111111111111111111"
        walletSyncError={null}
      />,
    );

    expect(screen.getByRole("tab", { name: /account information/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Monra User")).toBeInTheDocument();
    expect(screen.getByText("Individual")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("Ukraine")).toBeInTheDocument();
    expect(screen.getByText("11111111111111111111111111111111")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("switches to the security tab and wires the export modal to the wallet address", () => {
    renderWithQueryClient(
      <ProfilePage
        bridge={buildBridgeState()}
        user={buildUser()}
        walletAddress="11111111111111111111111111111111"
        walletSyncError={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /security/i }));

    expect(screen.getByRole("tab", { name: /security/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Not enrolled")).toBeInTheDocument();
    expect(screen.getByText("Available methods: Authenticator app and Text message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set up mfa/i })).toBeInTheDocument();
    expect(screen.queryByText("Wallet address")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "If MFA is enabled, Verification code is needed before revealing the private key.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Verification code is needed before protected wallet actions like transaction signing and key export.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Coinbase ExportWalletModal")).not.toBeInTheDocument();
    expect(screen.getAllByText("Export private key").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /export private key/i })).toBeInTheDocument();
    expect(screen.getByTestId("export-wallet-modal")).toHaveAttribute(
      "data-address",
      "11111111111111111111111111111111",
    );
    expect(screen.getByTestId("export-wallet-modal-content")).toHaveTextContent("Export private key");
  });

  it("renders enrolled MFA state without the enrollment CTA", () => {
    cdpHooksMock.useCurrentUser.mockReturnValue({
      currentUser: buildCdpUser({
        mfaMethods: {
          totp: {
            enrolledAt: "2026-03-27T10:00:00.000Z",
          },
        },
      }),
    });
    cdpCoreMock.getEnrolledMfaMethods.mockReturnValue(["totp"]);
    cdpCoreMock.isEnrolledInMfa.mockReturnValue(true);

    renderWithQueryClient(
      <ProfilePage
        bridge={buildBridgeState()}
        user={buildUser()}
        walletAddress="11111111111111111111111111111111"
        walletSyncError={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /security/i }));

    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Enrolled methods: Authenticator app")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set up mfa/i })).not.toBeInTheDocument();
  });

  it("renders an unavailable MFA state when no project methods are enabled", () => {
    cdpCoreMock.getEnabledMfaMethods.mockReturnValue([]);

    renderWithQueryClient(
      <ProfilePage
        bridge={buildBridgeState()}
        user={buildUser()}
        walletAddress="11111111111111111111111111111111"
        walletSyncError={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /security/i }));

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Project methods: Not enabled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set up mfa/i })).not.toBeInTheDocument();
    expect(
      screen.getByText("MFA enrollment is unavailable until methods are enabled for this CDP project."),
    ).toBeInTheDocument();
  });

  it("shows immediate enrolled feedback after MFA enrollment succeeds", () => {
    renderWithQueryClient(
      <ProfilePage
        bridge={buildBridgeState()}
        user={buildUser()}
        walletAddress="11111111111111111111111111111111"
        walletSyncError={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /security/i }));
    fireEvent.click(screen.getByRole("button", { name: /complete mfa enrollment/i }));

    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Enrollment completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set up mfa/i })).not.toBeInTheDocument();
  });

  it("shows a disabled export state when no wallet address is available", () => {
    renderWithQueryClient(
      <ProfilePage
        bridge={buildBridgeState()}
        user={buildUser()}
        walletAddress={null}
        walletSyncError={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /security/i }));

    expect(screen.getByRole("button", { name: /wallet unavailable/i })).toBeDisabled();
    expect(screen.queryByTestId("export-wallet-modal")).not.toBeInTheDocument();
  });
});

function buildBridgeState(overrides: Partial<BridgeComplianceState> = {}): BridgeComplianceState {
  return {
    customerStatus: "active",
    hasAcceptedTermsOfService: true,
    showKycAlert: false,
    showTosAlert: false,
    ...overrides,
  };
}

function buildCdpUser(overrides: Record<string, unknown> = {}) {
  return {
    authenticationMethods: [],
    evmAccountObjects: [],
    evmAccounts: [],
    evmSmartAccountObjects: [],
    evmSmartAccounts: [],
    lastAuthenticatedAt: "2026-03-27T10:00:00.000Z",
    mfaMethods: undefined,
    solanaAccountObjects: [],
    solanaAccounts: [],
    userId: "cdp-user-1",
    ...overrides,
  };
}

function buildUser(): AppUser {
  return {
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
  };
}
