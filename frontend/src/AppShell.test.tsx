import { fireEvent, render, screen } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppShell from "@/AppShell";

const clipboardWriteTextMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

vi.mock("@coinbase/cdp-hooks", () => ({
  useSignOut: () => ({ signOut: vi.fn() }),
  useSolanaAddress: () => ({ solanaAddress: "11111111111111111111111111111111" }),
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
vi.mock("@/features/session/use-session", () => sessionMock);

describe("AppShell", () => {
  beforeEach(() => {
    clipboardWriteTextMock.mockReset();
    sessionMock.useSession.mockReturnValue({
      user: {
        fullName: "Monra User",
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    });
  });

  it("shows a user-visible notice when copying the wallet address fails", async () => {
    clipboardWriteTextMock.mockRejectedValueOnce(new Error("Clipboard unavailable"));

    render(
      <AppShell>
        <div>Child content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: /1111\.\.\.1111/i }));

    expect(
      await screen.findByText("Unable to copy the wallet address. Copy it manually for now."),
    ).toBeInTheDocument();
    expect((navigator.clipboard.writeText as Mock).mock.calls[0]?.[0]).toBe(
      "11111111111111111111111111111111",
    );
  });

  it("renders the Yield navigation item in the sidebar", () => {
    render(
      <AppShell>
        <div>Child content</div>
      </AppShell>,
    );

    expect(screen.getAllByText("Welcome Monra User").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yield").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Earn on stablecoins").length).toBeGreaterThan(0);
  });

  it("renders profile navigation actions that point to the profile route", () => {
    render(
      <AppShell>
        <div>Child content</div>
      </AppShell>,
    );

    const profileLinks = screen.getAllByRole("link", { name: /profile/i });

    expect(profileLinks.length).toBeGreaterThan(0);
    expect(profileLinks.some(link => link.getAttribute("href") === "/profile")).toBe(true);
  });
});
