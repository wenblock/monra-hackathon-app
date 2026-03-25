import { useQuery } from "@tanstack/react-query";

import { fetchDashboardSnapshot } from "@/api";
import { useApiClient } from "@/features/session/use-api-client";

import { dashboardKeys } from "./query-keys";

function useDashboardSnapshot(
  userId: string,
  input: {
    enabled?: boolean;
    liveUpdatesEnabled?: boolean;
  } = {},
) {
  const client = useApiClient();
  const enabled = input.enabled ?? true;
  const liveUpdatesEnabled = input.liveUpdatesEnabled ?? false;

  return useQuery({
    queryKey: dashboardKeys.snapshot(userId),
    queryFn: ({ signal }) => fetchDashboardSnapshot(client, signal),
    enabled,
    refetchInterval: liveUpdatesEnabled ? false : 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: !liveUpdatesEnabled,
    staleTime: liveUpdatesEnabled ? 60000 : 15000,
  });
}

export { useDashboardSnapshot };
