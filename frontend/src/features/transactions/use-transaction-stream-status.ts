import { useContext } from "react";

import { TransactionStreamStatusContext } from "@/features/transactions/transaction-stream-context";

function useTransactionStreamStatus() {
  const context = useContext(TransactionStreamStatusContext);

  if (!context) {
    throw new Error(
      "useTransactionStreamStatus must be used within a TransactionStreamProvider.",
    );
  }

  return context;
}

export { useTransactionStreamStatus };
