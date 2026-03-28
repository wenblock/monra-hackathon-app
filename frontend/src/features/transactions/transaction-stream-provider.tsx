import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { mergeStreamedDashboardSnapshot } from "@/features/dashboard/cache";
import { useApiClient } from "@/features/session/use-api-client";
import { TransactionStreamStatusContext } from "@/features/transactions/transaction-stream-context";
import { API_BASE_URL } from "@/lib/api-client";
import { formatActivityAmount, formatActivityRowTitle } from "@/transaction-display";
import type { AppTransaction, TransactionStreamResponse } from "@/types";

function TransactionStreamProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string;
}) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const streamReconnectAttempts = useRef(0);
  const streamOutageStartedAt = useRef<number | null>(null);
  const hasOpenedTransactionStream = useRef(false);
  const hasSeededSeenTransactions = useRef(false);
  const seenTransactionStatuses = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    let activeStream: EventSource | null = null;
    let reconnectTimer: number | null = null;

    streamReconnectAttempts.current = 0;
    streamOutageStartedAt.current = null;
    hasOpenedTransactionStream.current = false;
    hasSeededSeenTransactions.current = false;
    seenTransactionStatuses.current.clear();
    setTransactionsError(null);
    setIsLive(false);

    const scheduleReconnect = () => {
      if (cancelled) {
        return;
      }

      const outageStartedAt = streamOutageStartedAt.current;
      const outageDuration = outageStartedAt === null ? 0 : Date.now() - outageStartedAt;

      if (streamReconnectAttempts.current >= 3 || outageDuration >= 30000) {
        setTransactionsError("Live updates are temporarily unavailable. Reconnecting...");
      }

      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, 3000);
    };

    const connect = async () => {
      try {
        const streamTokenResponse = await client.fetchTransactionStreamToken();
        if (cancelled) {
          return;
        }

        const streamUrl = new URL(`${API_BASE_URL}/api/transactions/stream`);
        streamUrl.searchParams.set("streamToken", streamTokenResponse.token);

        const stream = new EventSource(streamUrl.toString());
        activeStream = stream;

        stream.onopen = () => {
          const shouldRefreshSnapshot =
            hasOpenedTransactionStream.current ||
            streamReconnectAttempts.current > 0 ||
            streamOutageStartedAt.current !== null;

          hasOpenedTransactionStream.current = true;
          streamReconnectAttempts.current = 0;
          streamOutageStartedAt.current = null;
          setTransactionsError(null);
          setIsLive(true);

          if (shouldRefreshSnapshot) {
            void queryClient.invalidateQueries({
              queryKey: ["dashboard", userId, "snapshot"],
            });
          }
        };

        stream.onmessage = event => {
          try {
            const payload = JSON.parse(event.data) as TransactionStreamResponse;

            mergeStreamedDashboardSnapshot(queryClient, userId, payload);
            syncTransactionToastState({
              hasSeededSeenTransactions,
              recentTransactions: payload.transactions,
              seenTransactionStatuses,
              showToast,
            });
            setTransactionsError(null);
          } catch (streamError) {
            console.error(streamError);
          }
        };

        stream.onerror = () => {
          if (activeStream !== stream) {
            return;
          }

          stream.close();
          activeStream = null;

          if (cancelled) {
            return;
          }

          streamReconnectAttempts.current += 1;
          streamOutageStartedAt.current ??= Date.now();
          setIsLive(false);
          scheduleReconnect();
        };
      } catch (streamError) {
        console.error(streamError);

        if (cancelled) {
          return;
        }

        streamReconnectAttempts.current += 1;
        streamOutageStartedAt.current ??= Date.now();
        setIsLive(false);
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      cancelled = true;

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      activeStream?.close();
    };
  }, [client, queryClient, showToast, userId]);

  return (
    <TransactionStreamStatusContext.Provider value={{ isLive, transactionsError }}>
      {children}
    </TransactionStreamStatusContext.Provider>
  );
}

function syncTransactionToastState(input: {
  hasSeededSeenTransactions: { current: boolean };
  recentTransactions: AppTransaction[];
  seenTransactionStatuses: { current: Set<string> };
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  if (!input.hasSeededSeenTransactions.current) {
    for (const transaction of input.recentTransactions) {
      input.seenTransactionStatuses.current.add(getTransactionSeenKey(transaction));
    }

    input.hasSeededSeenTransactions.current = true;
    return;
  }

  for (const transaction of input.recentTransactions) {
    const seenKey = getTransactionSeenKey(transaction);

    if (input.seenTransactionStatuses.current.has(seenKey)) {
      continue;
    }

    if (shouldToastForConfirmedTransfer(transaction)) {
      input.showToast({
        title: formatTransferToastTitle(transaction),
        description: formatActivityAmount(transaction),
        variant: "success",
      });
    }

    input.seenTransactionStatuses.current.add(seenKey);
  }
}

function shouldToastForConfirmedTransfer(transaction: AppTransaction) {
  return transaction.entryType === "transfer" && transaction.status === "confirmed";
}

function getTransactionSeenKey(transaction: AppTransaction) {
  return `${transaction.publicId}:${transaction.status}`;
}

function formatTransferToastTitle(transaction: AppTransaction) {
  const activityTitle = formatActivityRowTitle(transaction);

  return transaction.direction === "outbound"
    ? activityTitle.replace(/^Send to /, "Sent to ")
    : activityTitle;
}

export { TransactionStreamProvider };
