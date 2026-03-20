import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePersistedSolanaAddress } from "@/features/session/use-persisted-solana-address";

const mutateAsyncMock = vi.hoisted(() => vi.fn());
const cdpHooksMock = vi.hoisted(() => ({
  useSolanaAddress: vi.fn(),
}));
const sessionMutationsMock = vi.hoisted(() => ({
  useSaveSolanaAddressMutation: vi.fn(),
}));

vi.mock("@coinbase/cdp-hooks", () => cdpHooksMock);
vi.mock("@/features/session/use-session-mutations", () => sessionMutationsMock);

describe("usePersistedSolanaAddress", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue(undefined);
    cdpHooksMock.useSolanaAddress.mockReturnValue({
      solanaAddress: "11111111111111111111111111111111",
    });
    sessionMutationsMock.useSaveSolanaAddressMutation.mockReturnValue({
      isPending: false,
      mutateAsync: mutateAsyncMock,
    });
  });

  it("persists the connected Solana address when the backend has not stored it yet", async () => {
    renderHook(() => usePersistedSolanaAddress("user-1", null));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith("11111111111111111111111111111111");
    });
  });

  it("does not persist again when the backend already has a wallet address", async () => {
    renderHook(() =>
      usePersistedSolanaAddress("user-1", "11111111111111111111111111111111"),
    );

    await waitFor(() => {
      expect(mutateAsyncMock).not.toHaveBeenCalled();
    });
  });
});
