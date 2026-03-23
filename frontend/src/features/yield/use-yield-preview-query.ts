import { useQuery } from "@tanstack/react-query";

import type { YieldAction, YieldAsset } from "@/types";

import { yieldKeys } from "./query-keys";
import { fetchYieldPreview } from "./runtime";

function useYieldPreviewQuery(input: {
  action: YieldAction;
  amountRaw: string | null;
  asset: YieldAsset;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: yieldKeys.preview(input.asset, input.action, input.amountRaw ?? "0"),
    queryFn: () =>
      fetchYieldPreview({
        action: input.action,
        amountRaw: input.amountRaw!,
        asset: input.asset,
      }),
    enabled: (input.enabled ?? true) && Boolean(input.amountRaw),
    staleTime: 10_000,
  });
}

export { useYieldPreviewQuery };
