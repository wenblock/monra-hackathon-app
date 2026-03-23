import { useQuery } from "@tanstack/react-query";

import { fetchYieldOnchainSnapshot } from "./runtime";
import { yieldKeys } from "./query-keys";

function useYieldOnchainQuery(walletAddress: string | null, enabled = true) {
  return useQuery({
    queryKey: yieldKeys.onchain(walletAddress ?? "wallet-pending"),
    queryFn: () => fetchYieldOnchainSnapshot(walletAddress!),
    enabled: enabled && Boolean(walletAddress),
    staleTime: 60000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

export { useYieldOnchainQuery };
