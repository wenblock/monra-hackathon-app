import { ArrowDownLeft, ArrowUpRight, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatActivityAbsoluteTimestamp,
  formatActivityAmount,
  formatActivityStatus,
  formatActivityTitle,
  formatCounterpartyLabel,
  getTransactionCounterpartyDisplay,
  getTransactionCounterpartyWalletAddress,
} from "@/transaction-display";
import type { AppTransaction } from "@/types";

interface TransactionDetailsDrawerProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  transaction: AppTransaction | null;
}

function TransactionDetailsDrawer({
  onOpenChange,
  open,
  transaction,
}: TransactionDetailsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(94vw,34rem)] overflow-y-auto bg-background text-foreground"
      >
        {transaction ? (
          <>
            <SheetHeader className="border-b border-border/80 bg-background pb-5">
              <div className="flex items-start gap-4">
                <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-foreground">
                  {transaction.direction === "inbound" ? (
                    <ArrowDownLeft className="size-5" />
                  ) : (
                    <ArrowUpRight className="size-5" />
                  )}
                </span>
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle className="text-xl text-foreground">
                      {transaction.direction === "inbound" ? "Received" : "Send"}
                    </SheetTitle>
                    <Badge variant={transaction.status === "confirmed" ? "success" : "secondary"}>
                      {formatActivityStatus(transaction)}
                    </Badge>
                  </div>
                  <SheetDescription className="text-sm text-muted-foreground">
                    {formatActivityTitle(transaction)}
                  </SheetDescription>
                  <p className="text-3xl font-semibold tracking-tight text-foreground">
                    {formatActivityAmount(transaction)}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 p-6">
              <DetailBlock
                label="Confirmed"
                value={formatActivityAbsoluteTimestamp(transaction.confirmedAt ?? transaction.createdAt)}
              />

              <DetailBlock
                label={formatCounterpartyLabel(transaction)}
                value={getTransactionCounterpartyDisplay(transaction)}
                secondaryValue={getTransactionCounterpartyWalletAddress(transaction)}
              />

              <DetailBlock
                label="Signature"
                value={transaction.transactionSignature}
                monospace
              />

              <a
                className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                href={`https://explorer.solana.com/tx/${transaction.transactionSignature}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                View on Solana Explorer
                <ExternalLink className="size-4" />
              </a>

              <DetailBlock label="Network" value="Solana Mainnet" />

              {transaction.networkFeeDisplay ? (
                <DetailBlock
                  label="Network fee"
                  value={`${transaction.networkFeeDisplay} SOL`}
                />
              ) : null}

              {transaction.failureReason ? (
                <DetailBlock label="Failure reason" value={transaction.failureReason} />
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailBlock({
  label,
  monospace = false,
  secondaryValue,
  value,
}: {
  label: string;
  monospace?: boolean;
  secondaryValue?: string | null;
  value: string;
}) {
  return (
    <div className="rounded-[calc(var(--radius)+2px)] border border-border/80 bg-secondary/20 p-4">
      <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={monospace ? "mt-2 break-all font-mono text-sm text-foreground" : "mt-2 font-medium text-foreground"}>
        {value}
      </p>
      {secondaryValue ? (
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{secondaryValue}</p>
      ) : null}
    </div>
  );
}

export default TransactionDetailsDrawer;
