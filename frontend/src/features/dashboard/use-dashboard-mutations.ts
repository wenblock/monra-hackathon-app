import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";
import type {
  AppTransaction,
  CreateOfframpPayload,
  CreateOnrampPayload,
  FetchSolanaTransactionContextPayload,
} from "@/types";

import { transactionsKeys } from "../transactions/query-keys";
import { mergeDashboardTransaction, mergeTransactionHistory } from "./cache";

function useCreateOnrampMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<{ transaction: AppTransaction }, Error, CreateOnrampPayload>({
    mutationFn: payload => client.createOnramp(payload),
    onSuccess: response => {
      mergeDashboardTransaction(queryClient, userId, response.transaction);
      mergeTransactionHistory(queryClient, userId, response.transaction);
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
      mergeTransactionHistory(queryClient, userId, response.transaction);
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

export {
  useCreateOfframpMutation,
  useCreateOnrampMutation,
  useFetchSolanaTransactionContext,
};
