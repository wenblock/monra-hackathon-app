import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "@/ProfilePage";
import type { AppUser, BridgeComplianceState } from "@/types";

vi.mock("@coinbase/cdp-hooks", () => ({
  useSignOut: () => ({ signOut: vi.fn() }),
  useSolanaAddress: () => ({ solanaAddress: "11111111111111111111111111111111" }),
}));

vi.mock("@coinbase/cdp-react", () => ({
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
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to the account information tab and renders profile fields", () => {
    render(
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
    render(
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
    expect(screen.getByRole("button", { name: /export private key/i })).toBeInTheDocument();
    expect(screen.getByTestId("export-wallet-modal")).toHaveAttribute(
      "data-address",
      "11111111111111111111111111111111",
    );
  });

  it("shows a disabled export state when no wallet address is available", () => {
    render(
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
