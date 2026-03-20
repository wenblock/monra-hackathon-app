import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDashboardSnapshot } from "@/features/dashboard/use-dashboard-snapshot";

import { dashboardKeys } from "./query-keys";

const useQueryMock = vi.hoisted(() => vi.fn());
const fetchDashboardSnapshotMock = vi.hoisted(() => vi.fn());
const apiClientMock = vi.hoisted(() => ({ fetchTransactionStreamToken: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/api", () => ({
  fetchDashboardSnapshot: fetchDashboardSnapshotMock,
}));

vi.mock("@/features/session/use-api-client", () => ({
  useApiClient: () => apiClientMock,
}));

describe("useDashboardSnapshot", () => {
  it("refreshes dashboard valuation every 15 seconds and on window focus", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    renderHook(() => useDashboardSnapshot("user-1"));

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: dashboardKeys.snapshot("user-1"),
        refetchInterval: 15000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
      }),
    );
  });
});
