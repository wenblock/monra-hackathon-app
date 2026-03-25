import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useYieldPositions } from "./use-yield-positions";
import { yieldKeys } from "./query-keys";

const useQueryMock = vi.hoisted(() => vi.fn());
const apiClientMock = vi.hoisted(() => ({
  fetchYieldPositions: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/features/session/use-api-client", () => ({
  useApiClient: () => apiClientMock,
}));

describe("useYieldPositions", () => {
  it("does not poll tracked yield positions aggressively in the background", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    renderHook(() => useYieldPositions("user-1"));

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: yieldKeys.positions("user-1"),
        refetchOnWindowFocus: false,
        staleTime: 30000,
      }),
    );
  });
});
