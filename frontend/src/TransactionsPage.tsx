import { useGetAccessToken } from "@coinbase/cdp-hooks";
import { Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import AppShell from "@/AppShell";
import { fetchTransactions } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import TransactionActivityList from "@/TransactionActivityList";
import type { AppTransaction } from "@/types";

const pageSize = 20;

function TransactionsPage() {
  const { getAccessToken } = useGetAccessToken();
  const [transactions, setTransactions] = useState<AppTransaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTransactions = useCallback(
    async (cursor?: string | null) => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Unable to fetch a CDP access token.");
      }

      return fetchTransactions(token, {
        cursor,
        limit: pageSize,
      });
    },
    [getAccessToken],
  );

  useEffect(() => {
    let cancelled = false;

    const loadInitialTransactions = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const response = await loadTransactions();

        if (cancelled) {
          return;
        }

        setTransactions(response.transactions);
        setNextCursor(response.nextCursor);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load transactions right now.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadInitialTransactions();

    return () => {
      cancelled = true;
    };
  }, [loadTransactions]);

  const handleLoadMore = async () => {
    if (!nextCursor) {
      return;
    }

    try {
      setIsLoadingMore(true);
      setLoadError(null);
      const response = await loadTransactions(nextCursor);
      setTransactions(currentTransactions => [...currentTransactions, ...response.transactions]);
      setNextCursor(response.nextCursor);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load more transactions.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-5">
            <div className="space-y-2">
              <CardTitle className="text-3xl">Transactions</CardTitle>
              <CardDescription>
                Full transaction history from your ledger, newest first.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadError ? (
              <div className="rounded-[calc(var(--radius)+2px)] border border-[color:color-mix(in_srgb,var(--danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--danger)_8%,white)] px-4 py-3 text-sm text-foreground">
                {loadError}
              </div>
            ) : null}

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-[calc(var(--radius)+2px)]" />
                <Skeleton className="h-20 w-full rounded-[calc(var(--radius)+2px)]" />
                <Skeleton className="h-20 w-full rounded-[calc(var(--radius)+2px)]" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex min-h-[22rem] items-center justify-center rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-background/50 px-6 py-8">
                <div className="max-w-md text-center">
                  <span className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-secondary text-muted-foreground">
                    <Send className="size-6" />
                  </span>
                  <p className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
                    No transactions yet
                  </p>
                  <p className="mt-3 text-lg text-muted-foreground">
                    Activity will appear here once funds move through the wallet.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <TransactionActivityList transactions={transactions} />

                {nextCursor ? (
                  <div className="flex justify-center pt-2">
                    <Button type="button" variant="outline" onClick={() => void handleLoadMore()} disabled={isLoadingMore}>
                      {isLoadingMore ? "Loading..." : "Load more"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

export default TransactionsPage;
