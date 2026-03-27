import { useTransactionStreamStatus } from "@/features/transactions/transaction-stream-provider";

function useDashboardStream(_userId?: string, _enabled = true) {
  return useTransactionStreamStatus();
}

export { useDashboardStream };
