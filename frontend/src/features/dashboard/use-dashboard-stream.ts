import { useTransactionStreamStatus } from "@/features/transactions/use-transaction-stream-status";

function useDashboardStream() {
  return useTransactionStreamStatus();
}

export { useDashboardStream };
