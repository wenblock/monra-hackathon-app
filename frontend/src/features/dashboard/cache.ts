import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { DashboardSnapshot } from "@/api";
import type { AppTransaction, SolanaBalancesResponse, TransactionListResponse } from "@/types";

import { transactionsKeys } from "../transactions/query-keys";
import { dashboardKeys } from "./query-keys";

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
            transactions: upsertTransactions(current.transactions, transaction),
          }
        : current,
  );
}

function mergeDashboardBalancesAndTransaction(
  queryClient: QueryClient,
  userId: string,
  input: {
    balances: SolanaBalancesResponse["balances"];
    transaction: AppTransaction;
  },
) {
  queryClient.setQueryData<DashboardSnapshot | undefined>(
    dashboardKeys.snapshot(userId),
    current =>
      current
        ? {
            ...current,
            balances: input.balances,
            transactions: upsertTransactions(current.transactions, input.transaction),
          }
        : current,
  );
}

function mergeTransactionHistory(
  queryClient: QueryClient,
  userId: string,
  transaction: AppTransaction,
) {
  queryClient.setQueryData<InfiniteData<TransactionListResponse> | undefined>(
    transactionsKeys.history(userId),
    current => {
      if (!current || current.pages.length === 0) {
        return current;
      }

      const [firstPage, ...remainingPages] = current.pages;

      return {
        ...current,
        pages: [
          {
            ...firstPage,
            transactions: upsertTransactions(firstPage.transactions, transaction),
          },
          ...remainingPages,
        ],
      };
    },
  );
}

function upsertTransactions(transactions: AppTransaction[], transaction: AppTransaction) {
  return [
    transaction,
    ...transactions.filter(currentTransaction => currentTransaction.publicId !== transaction.publicId),
  ];
}

export {
  mergeDashboardBalancesAndTransaction,
  mergeDashboardTransaction,
  mergeTransactionHistory,
};
