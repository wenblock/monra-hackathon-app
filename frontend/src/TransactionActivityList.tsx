import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatActivityAmount,
  formatActivityRowTitle,
  formatActivityStatus,
  formatActivityTimestamp,
  getTransactionDirectionTone,
  isSwapTransaction,
} from "@/transaction-display";
import type { AppTransaction } from "@/types";

const LazyTransactionDetailsDrawer = lazy(() => import("@/TransactionDetailsDrawer"));

interface TransactionActivityListProps {
  transactions: AppTransaction[];
}

function TransactionActivityList({ transactions }: TransactionActivityListProps) {
  const [selectedTransaction, setSelectedTransaction] = useState<AppTransaction | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <>
      <div className="space-y-3">
        {transactions.map(transaction => (
          <button
            key={transaction.id}
            type="button"
            onClick={() => setSelectedTransaction(transaction)}
            className={cn(
              "flex w-full flex-col gap-3 rounded-[calc(var(--radius)+2px)] border border-border/70 bg-background/70 px-4 py-4 text-left transition-colors",
              "hover:border-primary/20 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
              "sm:flex-row sm:items-center sm:justify-between",
            )}
          >
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-foreground">
                {isSwapTransaction(transaction) ? (
                  <ArrowLeftRight className="size-5" />
                ) : transaction.direction === "inbound" ? (
                  <ArrowDownLeft className="size-5" />
                ) : (
                  <ArrowUpRight className="size-5" />
                )}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-foreground">
                    {formatActivityRowTitle(transaction)}
                  </p>
                  <Badge variant={transaction.status === "confirmed" ? "success" : "secondary"}>
                    {formatActivityStatus(transaction)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatActivityTimestamp(transaction.confirmedAt ?? transaction.createdAt, now)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
              <p className={`text-lg font-semibold ${getTransactionDirectionTone(transaction)}`}>
                {formatActivityAmount(transaction)}
              </p>
            </div>
          </button>
        ))}
      </div>

      {selectedTransaction ? (
        <Suspense fallback={null}>
          <LazyTransactionDetailsDrawer
            open={selectedTransaction !== null}
            onOpenChange={isOpen => {
              if (!isOpen) {
                setSelectedTransaction(null);
              }
            }}
            transaction={selectedTransaction}
          />
        </Suspense>
      ) : null}
    </>
  );
}

export default TransactionActivityList;
