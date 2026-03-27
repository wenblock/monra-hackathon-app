import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { DashboardSnapshot } from "@/api";
import type {
  AppTransaction,
  SolanaBalancesResponse,
  TransactionListResponse,
  TransactionStreamResponse,
} from "@/types";

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
            transactions: mergeRecentTransactions(current.transactions, [transaction]),
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
            transactions: mergeRecentTransactions(current.transactions, [input.transaction]),
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
            transactions: mergeRecentTransactions(firstPage.transactions, [transaction]),
          },
          ...remainingPages,
        ],
      };
    },
  );
}

function mergeStreamedDashboardSnapshot(
  queryClient: QueryClient,
  userId: string,
  snapshot: TransactionStreamResponse,
) {
  queryClient.setQueryData<DashboardSnapshot | undefined>(
    dashboardKeys.snapshot(userId),
    current =>
      current
        ? {
            ...current,
            balances: snapshot.balances,
            valuation: snapshot.valuation,
            yield: snapshot.yield,
            transactions: snapshot.transactions,
          }
        : {
            balances: snapshot.balances,
            valuation: snapshot.valuation,
            yield: snapshot.yield,
            transactions: snapshot.transactions,
          },
  );

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
            transactions: mergeRecentTransactions(firstPage.transactions, snapshot.transactions),
          },
          ...remainingPages,
        ],
      };
    },
  );
}

function mergeRecentTransactions(
  transactions: AppTransaction[],
  recentTransactions: AppTransaction[],
) {
  if (recentTransactions.length === 0) {
    return transactions;
  }

  const recentTransactionIds = new Set(
    recentTransactions.map(transaction => transaction.publicId),
  );
  const mergedTransactions = [
    ...recentTransactions,
    ...transactions.filter(
      currentTransaction => !recentTransactionIds.has(currentTransaction.publicId),
    ),
  ];

  return mergedTransactions;
}

export {
  mergeDashboardBalancesAndTransaction,
  mergeDashboardTransaction,
  mergeStreamedDashboardSnapshot,
  mergeTransactionHistory,
};
