import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "@/features/dashboard/query-keys";
import {
  mergeDashboardBalancesAndTransaction,
  mergeTransactionHistory,
} from "@/features/dashboard/cache";
import { useApiClient } from "@/features/session/use-api-client";
import { transactionsKeys } from "@/features/transactions/query-keys";
import type { ConfirmYieldTransactionPayload, YieldConfirmResponse } from "@/types";

import { yieldKeys } from "./query-keys";

function useYieldConfirmMutation(input: { userId: string; walletAddress: string | null }) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<YieldConfirmResponse, Error, ConfirmYieldTransactionPayload>({
    mutationFn: payload => client.confirmYieldTransaction(payload),
    onSuccess: response => {
      mergeDashboardBalancesAndTransaction(queryClient, input.userId, response);
      mergeTransactionHistory(queryClient, input.userId, response.transaction);
      queryClient.setQueryData(yieldKeys.positions(input.userId), {
        positions: {
          usdc: response.position,
        },
      });
      void queryClient.invalidateQueries({
        queryKey: dashboardKeys.snapshot(input.userId),
      });
      void queryClient.invalidateQueries({
        queryKey: transactionsKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: yieldKeys.all,
      });
      if (input.walletAddress) {
        void queryClient.invalidateQueries({
          queryKey: yieldKeys.onchain(input.walletAddress),
        });
      }
    },
  });
}

export { useYieldConfirmMutation };
