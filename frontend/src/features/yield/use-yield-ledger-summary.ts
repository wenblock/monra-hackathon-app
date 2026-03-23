import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";

import { yieldKeys } from "./query-keys";

function useYieldLedgerSummary(userId: string, enabled = true) {
  const client = useApiClient();

  return useQuery({
    queryKey: yieldKeys.ledgerSummary(userId),
    queryFn: ({ signal }) => client.fetchYieldLedgerSummary(signal),
    enabled,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export { useYieldLedgerSummary };
