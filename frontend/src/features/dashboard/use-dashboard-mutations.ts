import { useCallback } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";
import type { DashboardSnapshot } from "@/api";
import type {
  AppTransaction,
  CreateOfframpPayload,
  CreateOnrampPayload,
  FetchSolanaTransactionContextPayload,
} from "@/types";

import { transactionsKeys } from "../transactions/query-keys";
import { dashboardKeys } from "./query-keys";

function useCreateOnrampMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<{ transaction: AppTransaction }, Error, CreateOnrampPayload>({
    mutationFn: payload => client.createOnramp(payload),
    onSuccess: response => {
      mergeDashboardTransaction(queryClient, userId, response.transaction);
      void queryClient.invalidateQueries({
        queryKey: transactionsKeys.history(userId),
      });
    },
  });
}

function useCreateOfframpMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<{ transaction: AppTransaction }, Error, CreateOfframpPayload>({
    mutationFn: payload => client.createOfframp(payload),
    onSuccess: response => {
      mergeDashboardTransaction(queryClient, userId, response.transaction);
      void queryClient.invalidateQueries({
        queryKey: transactionsKeys.history(userId),
      });
    },
  });
}

function useFetchSolanaTransactionContext() {
  const client = useApiClient();

  return useCallback(
    (payload: FetchSolanaTransactionContextPayload) =>
      client.fetchSolanaTransactionContext(payload),
    [client],
  );
}

function mergeDashboardTransaction(
  queryClient: QueryClient,
  userId: string,
  transaction: AppTransaction,
) {
  queryClient.setQueryData<DashboardSnapshot | undefined>(
    dashboardKeys.snapshot(userId),
    current =>
      current
        ? {
            ...current,
            transactions: [
              transaction,
              ...current.transactions.filter(
                (currentTransaction: AppTransaction) =>
                  currentTransaction.id !== transaction.id,
              ),
            ],
          }
        : current,
  );
}

export {
  useCreateOfframpMutation,
  useCreateOnrampMutation,
  useFetchSolanaTransactionContext,
};
