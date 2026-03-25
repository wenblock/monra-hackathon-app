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
  it("uses a slow fallback refresh when live updates are unavailable", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    renderHook(() => useDashboardSnapshot("user-1"));

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: dashboardKeys.snapshot("user-1"),
        refetchInterval: 60000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        staleTime: 15000,
      }),
    );
  });

  it("disables periodic polling while live updates are active", () => {
    useQueryMock.mockReturnValue({ data: undefined });

    renderHook(() =>
      useDashboardSnapshot("user-1", {
        liveUpdatesEnabled: true,
      }),
    );

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: dashboardKeys.snapshot("user-1"),
        refetchInterval: false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        staleTime: 60000,
      }),
    );
  });
});
