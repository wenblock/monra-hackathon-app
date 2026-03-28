import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppSignOut } from "@/features/session/use-app-sign-out";

const clearQueryClientMock = vi.hoisted(() => vi.fn());
const logOutEndUserMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock("@coinbase/cdp-api-client", () => ({
  logOutEndUser: logOutEndUserMock,
}));

vi.mock("@coinbase/cdp-hooks", () => ({
  useSignOut: () => ({ signOut: signOutMock }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: clearQueryClientMock }),
}));

vi.mock("@/config", () => ({
  CDP_CONFIG: {
    projectId: "test-project-id",
  },
}));

describe("useAppSignOut", () => {
  beforeEach(() => {
    clearQueryClientMock.mockReset();
    clearQueryClientMock.mockReturnValue(undefined);
    logOutEndUserMock.mockReset();
    logOutEndUserMock.mockResolvedValue(undefined);
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
  });

  it("revokes the Coinbase session before clearing local auth state", async () => {
    const { result } = renderHook(() => useAppSignOut());

    await act(async () => {
      await result.current.signOut();
    });

    expect(logOutEndUserMock).toHaveBeenCalledWith("test-project-id", {});
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(clearQueryClientMock).toHaveBeenCalledTimes(1);
    expect(logOutEndUserMock.mock.invocationCallOrder[0]).toBeLessThan(
      signOutMock.mock.invocationCallOrder[0],
    );
  });

  it("reuses the same in-flight sign-out request for duplicate calls", async () => {
    let resolveLogout: (() => void) | null = null;

    logOutEndUserMock.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveLogout = resolve;
        }),
    );

    const { result } = renderHook(() => useAppSignOut());

    const firstPromise = result.current.signOut();
    const secondPromise = result.current.signOut();

    await act(async () => {
      resolveLogout?.();
      await Promise.all([firstPromise, secondPromise]);
    });

    expect(firstPromise).toBe(secondPromise);
    expect(logOutEndUserMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(clearQueryClientMock).toHaveBeenCalledTimes(1);
  });
});
