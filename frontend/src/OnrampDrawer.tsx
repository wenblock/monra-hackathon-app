import { ExternalLink, Landmark, Wallet, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AppTransaction, CreateOnrampPayload } from "@/types";

interface OnrampDrawerProps {
  onCreateOnramp: (payload: CreateOnrampPayload) => Promise<AppTransaction>;
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
  walletAddress: string | null;
}

function OnrampDrawer({
  onCreateOnramp,
  onOpenChange,
  open,
  walletAddress,
}: OnrampDrawerProps) {
  const [amount, setAmount] = useState("");
  const [createdTransaction, setCreatedTransaction] = useState<AppTransaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetState();
    }

    onOpenChange(isOpen);
  };

  const handleCreateOnramp = async () => {
    try {
      setError(null);

      if (!walletAddress) {
        throw new Error("Your Solana wallet is still syncing. Try again in a moment.");
      }

      const normalizedAmount = normalizeAmount(amount);
      setIsSubmitting(true);

      const transaction = await onCreateOnramp({
        amount: normalizedAmount,
      });

      setCreatedTransaction(transaction);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create on-ramp.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const instructions = createdTransaction?.bridgeSourceDepositInstructions;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(94vw,34rem)] overflow-y-auto bg-background text-foreground"
      >
        <SheetHeader className="border-b border-border/80 bg-background pb-5">
          <SheetTitle>On-ramp</SheetTitle>
          <SheetDescription>
            Convert EUR via SEPA into USDC on Solana using Bridge deposit instructions.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-6">
          {createdTransaction ? (
            <>
              <div className="space-y-3">
                <Badge variant="secondary">Pending deposit</Badge>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">Deposit instructions ready</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    A pending on-ramp was added to Recent Activity. Send the exact bank transfer below to continue.
                  </p>
                </div>
                <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 p-4">
                  <p className="text-xs font-mono uppercase tracking-[0.22em] text-muted-foreground">
                    Pending amount
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">
                    +{formatSourceAmount(createdTransaction)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Expected receive: +{createdTransaction.amountDisplay} USDC
                  </p>
                </div>
              </div>

              {instructions ? (
                <div className="space-y-4">
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
                  <DetailBlock label="Destination wallet" value={walletAddress ?? "Unavailable"} monospace />
                </div>
              ) : (
                <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-secondary/25 px-4 py-4 text-sm text-muted-foreground">
                  Bridge did not return deposit instructions for this session.
                </div>
              )}

              {createdTransaction.bridgeReceiptUrl ? (
                <a
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  href={createdTransaction.bridgeReceiptUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open Bridge receipt
                  <ExternalLink className="size-4" />
                </a>
              ) : null}

              <Button type="button" variant="secondary" className="w-full" onClick={resetState}>
                Start another on-ramp
              </Button>
            </>
          ) : (
            <>
              {error ? (
                <div className="rounded-[calc(var(--radius)+2px)] border border-[color:color-mix(in_srgb,var(--danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--danger)_8%,white)] px-4 py-3 text-sm text-foreground">
                  {error}
                </div>
              ) : null}

              <Field
                id="onramp-amount"
                label="EUR amount"
                onChange={setAmount}
                placeholder="25.00"
                value={amount}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FixedField
                  icon={Landmark}
                  label="Asset"
                  value="USDC"
                />
                <FixedField
                  icon={Wallet}
                  label="Chain"
                  value="Solana"
                />
              </div>

              <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                Minimum amount: <span className="font-medium text-foreground">3 EUR</span>
              </div>

              <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 px-4 py-3">
                <p className="text-sm font-medium text-foreground">Destination wallet</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {walletAddress ?? "Wallet is still syncing to the backend."}
                </p>
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={isSubmitting || !walletAddress}
                onClick={() => void handleCreateOnramp()}
              >
                {isSubmitting ? "Creating..." : "Continue"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  function resetState() {
    setAmount("");
    setCreatedTransaction(null);
    setIsSubmitting(false);
    setError(null);
  }
}

function Field({
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function FixedField({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/20 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-medium text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DetailBlock({
  label,
  monospace = false,
  value,
}: {
  label: string;
  monospace?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-[calc(var(--radius)+2px)] border border-border/80 bg-secondary/20 p-4">
      <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={monospace ? "mt-2 break-all font-mono text-sm text-foreground" : "mt-2 font-medium text-foreground"}>
        {value}
      </p>
    </div>
  );
}

function normalizeAmount(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Enter a valid EUR amount with up to 2 decimal places.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const normalizedAmount = normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
  const parsedAmount = Number.parseFloat(normalizedAmount);

  if (!Number.isFinite(parsedAmount) || parsedAmount < 3) {
    throw new Error("Minimum on-ramp amount is 3 EUR.");
  }

  return normalizedAmount;
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

export default OnrampDrawer;
