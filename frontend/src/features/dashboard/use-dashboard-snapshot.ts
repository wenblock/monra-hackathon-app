import { useQuery } from "@tanstack/react-query";

import { fetchDashboardSnapshot } from "@/api";
import { useApiClient } from "@/features/session/use-api-client";

import { dashboardKeys } from "./query-keys";

function useDashboardSnapshot(userId: string, enabled = true) {
  const client = useApiClient();

  return useQuery({
    queryKey: dashboardKeys.snapshot(userId),
    queryFn: ({ signal }) => fetchDashboardSnapshot(client, signal),
    enabled,
  });
}

export { useDashboardSnapshot };
