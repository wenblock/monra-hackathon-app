import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";
import { API_BASE_URL } from "@/lib/api-client";
import type { TransactionStreamResponse } from "@/types";

import { dashboardKeys } from "./query-keys";

function useDashboardStream(userId: string, enabled = true) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const streamReconnectAttempts = useRef(0);
  const streamOutageStartedAt = useRef<number | null>(null);
  const hasOpenedTransactionStream = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setTransactionsError(null);
      return;
    }

    let cancelled = false;
    let activeStream: EventSource | null = null;
    let reconnectTimer: number | null = null;

    streamReconnectAttempts.current = 0;
    streamOutageStartedAt.current = null;
    hasOpenedTransactionStream.current = false;
    setTransactionsError(null);

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

          if (shouldRefreshSnapshot) {
            void queryClient.invalidateQueries({
              queryKey: dashboardKeys.snapshot(userId),
            });
          }
        };

        stream.onmessage = event => {
          try {
            const payload = JSON.parse(event.data) as TransactionStreamResponse;

            queryClient.setQueryData(
              dashboardKeys.snapshot(userId),
              current =>
                current
                  ? {
                      ...current,
                      balances: payload.balances,
                      transactions: payload.transactions,
                    }
                  : {
                      balances: payload.balances,
                      transactions: payload.transactions,
                    },
            );
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
          scheduleReconnect();
        };
      } catch (streamError) {
        console.error(streamError);

        if (cancelled) {
          return;
        }

        streamReconnectAttempts.current += 1;
        streamOutageStartedAt.current ??= Date.now();
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
  }, [client, enabled, queryClient, userId]);

  return {
    transactionsError,
  };
}

export { useDashboardStream };
