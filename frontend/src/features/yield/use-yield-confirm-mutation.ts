import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  mergeDashboardBalancesAndTransaction,
  mergeTransactionHistory,
} from "@/features/dashboard/cache";
import { useApiClient } from "@/features/session/use-api-client";
import type { ConfirmYieldTransactionPayload, YieldConfirmResponse } from "@/types";

import { yieldKeys } from "./query-keys";

function useYieldConfirmMutation(input: { userId: string }) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<YieldConfirmResponse, Error, ConfirmYieldTransactionPayload>({
    mutationFn: payload => client.confirmYieldTransaction(payload),
    onSuccess: response => {
      if (response.status !== "confirmed") {
        return;
      }

      mergeDashboardBalancesAndTransaction(queryClient, input.userId, response);
      mergeTransactionHistory(queryClient, input.userId, response.transaction);
      queryClient.setQueryData(yieldKeys.positions(input.userId), {
        positions: {
          usdc: response.position,
        },
      });
    },
  });
}

export { useYieldConfirmMutation };
