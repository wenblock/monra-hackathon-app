import { createContext } from "react";

interface TransactionStreamStatus {
  isLive: boolean;
  transactionsError: string | null;
}

const TransactionStreamStatusContext = createContext<TransactionStreamStatus | null>(
  null,
);

export type { TransactionStreamStatus };
export { TransactionStreamStatusContext };
