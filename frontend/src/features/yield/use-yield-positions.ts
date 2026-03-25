import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";

import { yieldKeys } from "./query-keys";

function useYieldPositions(userId: string, enabled = true) {
  const client = useApiClient();

  return useQuery({
    queryKey: yieldKeys.positions(userId),
    queryFn: ({ signal }) => client.fetchYieldPositions(signal),
    enabled,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 15000,
  });
}

export { useYieldPositions };
