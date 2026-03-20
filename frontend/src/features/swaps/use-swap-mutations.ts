import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/features/dashboard/query-keys";
import {
  mergeDashboardBalancesAndTransaction,
  mergeTransactionHistory,
} from "@/features/dashboard/cache";
import { useApiClient } from "@/features/session/use-api-client";
import type { ExecuteSwapPayload, SwapExecuteResponse } from "@/types";

import { transactionsKeys } from "../transactions/query-keys";

function useExecuteSwapMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<SwapExecuteResponse, Error, ExecuteSwapPayload>({
    mutationFn: payload => client.executeSwap(payload),
    onSuccess: response => {
      mergeDashboardBalancesAndTransaction(queryClient, userId, response);
      mergeTransactionHistory(queryClient, userId, response.transaction);
      void queryClient.invalidateQueries({
        queryKey: dashboardKeys.snapshot(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: transactionsKeys.history(userId),
      });
    },
  });
}

export { useExecuteSwapMutation };
