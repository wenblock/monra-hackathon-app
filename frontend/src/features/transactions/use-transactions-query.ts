import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";

import { transactionsKeys } from "./query-keys";

function useTransactionsQuery({
  enabled = true,
  limit,
  userId,
}: {
  enabled?: boolean;
  limit: number;
  userId: string;
}) {
  const client = useApiClient();

  return useQuery({
    queryKey: transactionsKeys.list(userId, limit),
    queryFn: ({ signal }) => client.fetchTransactions({ limit }, signal),
    enabled,
  });
}

function useInfiniteTransactionsQuery(userId: string, enabled = true) {
  const client = useApiClient();

  return useInfiniteQuery({
    queryKey: transactionsKeys.history(userId),
    queryFn: ({ pageParam, signal }) =>
      client.fetchTransactions(
        {
          cursor: pageParam,
          limit: 20,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled,
  });
}

export { useInfiniteTransactionsQuery, useTransactionsQuery };
