import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useYieldOnchainQuery } from "./use-yield-onchain-query";
import { yieldKeys } from "./query-keys";

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

describe("useYieldOnchainQuery", () => {
  it("refreshes yield market data once a minute without refetching on window focus", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    renderHook(() => useYieldOnchainQuery("wallet-1"));

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: yieldKeys.onchain("wallet-1"),
        refetchInterval: 60000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        staleTime: 60000,
      }),
    );
  });
});
