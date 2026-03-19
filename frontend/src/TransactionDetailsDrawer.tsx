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
  getTransactionExplorerSignature,
  getTransactionCounterpartyDisplay,
  getTransactionCounterpartyWalletAddress,
  isOfframpTransaction,
  isOnrampTransaction,
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
  const explorerSignature = transaction ? getTransactionExplorerSignature(transaction) : null;

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
                      {isOnrampTransaction(transaction)
                        ? "On-ramp"
                        : isOfframpTransaction(transaction)
                          ? "Off-ramp"
                        : transaction.direction === "inbound"
                          ? "Received"
                          : "Send"}
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

            {isOnrampTransaction(transaction) ? (
              <OnrampDetails transaction={transaction} explorerSignature={explorerSignature} />
            ) : isOfframpTransaction(transaction) ? (
              <OfframpDetails transaction={transaction} explorerSignature={explorerSignature} />
            ) : (
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

                {explorerSignature ? (
                  <a
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                    href={`https://explorer.solana.com/tx/${explorerSignature}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View on Solana Explorer
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}

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
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function OfframpDetails({
  explorerSignature,
  transaction,
}: {
  explorerSignature: string | null;
  transaction: AppTransaction;
}) {
  const instructions = transaction.bridgeSourceDepositInstructions;
  const lifecycleLabel =
    transaction.status === "confirmed"
      ? "Completed"
      : transaction.status === "failed"
        ? "Failed"
        : explorerSignature
          ? "Broadcasted"
          : "Created";

  return (
    <div className="space-y-5 p-6">
      <DetailBlock
        label={lifecycleLabel}
        value={formatActivityAbsoluteTimestamp(transaction.confirmedAt ?? transaction.createdAt)}
      />

      <DetailBlock
        label="Bank recipient"
        value={transaction.counterpartyName ?? "Saved bank recipient"}
      />

      <DetailBlock
        label="Source amount"
        value={formatOfframpSourceAmount(transaction)}
      />

      <DetailBlock label="Bridge transfer" value={transaction.bridgeTransferId ?? "Unavailable"} monospace />

      <DetailBlock
        label="Bridge status"
        value={formatBridgeTransferStatus(transaction.bridgeTransferStatus)}
      />

      <DetailBlock label="Source wallet" value={transaction.trackedWalletAddress} monospace />

      {instructions?.toAddress ? (
        <DetailBlock label="Bridge deposit address" value={instructions.toAddress} monospace />
      ) : null}

      {instructions?.blockchainMemo ? (
        <DetailBlock label="Blockchain memo" value={instructions.blockchainMemo} monospace />
      ) : null}

      {explorerSignature ? (
        <>
          <DetailBlock label="Source tx hash" value={explorerSignature} monospace />
          <a
            className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
            href={`https://explorer.solana.com/tx/${explorerSignature}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            View on Solana Explorer
            <ExternalLink className="size-4" />
          </a>
        </>
      ) : null}

      {transaction.bridgeReceiptUrl ? (
        <a
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          href={transaction.bridgeReceiptUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open Bridge receipt
          <ExternalLink className="size-4" />
        </a>
      ) : null}

      {transaction.networkFeeDisplay ? (
        <DetailBlock label="Network fee" value={`${transaction.networkFeeDisplay} SOL`} />
      ) : null}

      {transaction.failureReason ? (
        <DetailBlock label="Failure reason" value={transaction.failureReason} />
      ) : null}
    </div>
  );
}

function OnrampDetails({
  explorerSignature,
  transaction,
}: {
  explorerSignature: string | null;
  transaction: AppTransaction;
}) {
  const instructions = transaction.bridgeSourceDepositInstructions;

  return (
    <div className="space-y-5 p-6">
      <DetailBlock
        label={transaction.status === "confirmed" ? "Completed" : "Created"}
        value={formatActivityAbsoluteTimestamp(transaction.confirmedAt ?? transaction.createdAt)}
      />

      <DetailBlock
        label="Bridge transfer"
        value={transaction.bridgeTransferId ?? transaction.transactionSignature}
        monospace
      />

      <DetailBlock label="Destination wallet" value={transaction.trackedWalletAddress} monospace />

      <DetailBlock label="Source amount" value={formatSourceAmount(transaction)} />

      {instructions ? (
        <>
          <DetailBlock label="Payment rail" value={formatPaymentRail(instructions.paymentRail)} />
          <DetailBlock label="Bank name" value={instructions.bankName ?? "Unavailable"} />
          <DetailBlock label="Account holder" value={instructions.accountHolderName ?? "Unavailable"} />
          <DetailBlock label="IBAN" value={instructions.iban ?? "Unavailable"} monospace />
          <DetailBlock label="BIC" value={instructions.bic ?? "Unavailable"} monospace />
          <DetailBlock
            label="Bank transfer amount"
            value={formatInstructionAmount(instructions.amount, instructions.currency)}
          />
          <DetailBlock
            label="Reference / deposit message"
            value={instructions.depositMessage ?? "Unavailable"}
            monospace
          />
          {instructions.bankAddress ? (
            <DetailBlock label="Bank address" value={instructions.bankAddress} />
          ) : null}
        </>
      ) : null}

      <DetailBlock label="Network" value="Solana Mainnet" />

      {transaction.bridgeDestinationTxHash ? (
        <DetailBlock label="Destination tx hash" value={transaction.bridgeDestinationTxHash} monospace />
      ) : null}

      {explorerSignature ? (
        <a
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          href={`https://explorer.solana.com/tx/${explorerSignature}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          View on Solana Explorer
          <ExternalLink className="size-4" />
        </a>
      ) : null}

      {transaction.bridgeReceiptUrl ? (
        <a
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          href={transaction.bridgeReceiptUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open Bridge receipt
          <ExternalLink className="size-4" />
        </a>
      ) : null}

      {transaction.failureReason ? (
        <DetailBlock label="Failure reason" value={transaction.failureReason} />
      ) : null}
    </div>
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

function formatPaymentRail(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatInstructionAmount(amount: string | null, currency: string | null) {
  if (!amount) {
    return "Unavailable";
  }

  return currency ? `${amount} ${currency.toUpperCase()}` : amount;
}

function formatSourceAmount(transaction: AppTransaction) {
  if (!transaction.bridgeSourceAmount) {
    return "Unavailable";
  }

  return transaction.bridgeSourceCurrency
    ? `${transaction.bridgeSourceAmount} ${transaction.bridgeSourceCurrency.toUpperCase()}`
    : transaction.bridgeSourceAmount;
}

function formatOfframpSourceAmount(transaction: AppTransaction) {
  if (!transaction.bridgeSourceAmount) {
    return `${transaction.amountDisplay} ${transaction.asset.toUpperCase()}`;
  }

  return transaction.bridgeSourceCurrency
    ? `${transaction.bridgeSourceAmount} ${transaction.bridgeSourceCurrency.toUpperCase()}`
    : transaction.bridgeSourceAmount;
}

function formatBridgeTransferStatus(status: AppTransaction["bridgeTransferStatus"]) {
  if (!status) {
    return "Unavailable";
  }

  return status
    .split("_")
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default TransactionDetailsDrawer;
