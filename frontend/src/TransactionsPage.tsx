import { Send } from "lucide-react";

import AppShell from "@/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import TransactionActivityList from "@/TransactionActivityList";
import type { AppTransaction } from "@/types";

interface TransactionsPageProps {
  isLoading: boolean;
  isLoadingMore: boolean;
  loadError: string | null;
  nextCursor: string | null;
  onLoadMore: () => Promise<void>;
  transactions: AppTransaction[];
}

function TransactionsPage({
  isLoading,
  isLoadingMore,
  loadError,
  nextCursor,
  onLoadMore,
  transactions,
}: TransactionsPageProps) {
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
                    <Button type="button" variant="outline" onClick={() => void onLoadMore()} disabled={isLoadingMore}>
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
