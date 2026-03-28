import { useSendSolanaTransaction } from "@coinbase/cdp-hooks";
import { ArrowUpRight, CheckCircle2, Landmark, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  OFFRAMP_SOURCE_ASSETS,
  getTransferAssetLabel,
} from "@/assets";
import { getMaxAmountForAsset } from "@/OfframpDrawer.helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  buildBankRecipientPayload as buildSharedBankRecipientPayload,
  type BankRecipientDraft,
} from "@/features/recipients/recipient-payloads";
import { useBridgeRequestId } from "@/features/bridge/use-bridge-request-id";
import MfaProtectedActionHint from "@/features/security/MfaProtectedActionHint";
import { getWalletTransferFeeHint } from "@/features/wallet/fee-hints";
import { SEPA_COUNTRIES } from "@/sepa-countries";
import type {
  AppTransaction,
  CreateOfframpPayload,
  CreateRecipientPayload,
  FetchSolanaTransactionContextPayload,
  OfframpSourceAsset,
  Recipient,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
} from "@/types";

interface OfframpDrawerProps {
  balances?: SolanaBalancesResponse["balances"];
  onCreateBankRecipient: (
    payload: Extract<CreateRecipientPayload, { kind: "bank" }>,
  ) => Promise<Recipient>;
  onCreateOfframp: (payload: CreateOfframpPayload) => Promise<AppTransaction>;
  onFetchTransactionContext: (
    payload: FetchSolanaTransactionContextPayload,
  ) => Promise<SolanaTransactionContextResponse>;
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
  recipients: Recipient[];
  requestScope: string;
  senderAddress: string | null;
}

const emptyBankForm: BankRecipientDraft = {
  bankCountryCode: "",
  recipientType: "",
  firstName: "",
  lastName: "",
  businessName: "",
  bankName: "",
  iban: "",
  bic: "",
};

const displayCurrencyByAsset: Record<OfframpSourceAsset, string> = {
  eurc: "EUR",
  usdc: "USD",
};

function OfframpDrawer({
  balances,
  onCreateBankRecipient,
  onCreateOfframp,
  onFetchTransactionContext,
  onOpenChange,
  open,
  recipients,
  requestScope,
  senderAddress,
}: OfframpDrawerProps) {
  const { sendSolanaTransaction } = useSendSolanaTransaction();
  const bankRecipients = useMemo(
    () =>
      recipients.filter(
        recipient => recipient.kind === "bank" && recipient.bridgeExternalAccountId !== null,
      ),
    [recipients],
  );
  const [amount, setAmount] = useState("");
  const [sourceAsset, setSourceAsset] = useState<OfframpSourceAsset>("eurc");
  const [selectedRecipientPublicId, setSelectedRecipientPublicId] = useState("");
  const [isRecipientFormOpen, setIsRecipientFormOpen] = useState(false);
  const [bankForm, setBankForm] = useState(emptyBankForm);
  const [createdTransaction, setCreatedTransaction] = useState<AppTransaction | null>(null);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  const [isSavingRecipient, setIsSavingRecipient] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { clearRequestId: clearBankRecipientRequestId, ensureRequestId: ensureBankRecipientRequestId } =
    useBridgeRequestId({
      payload: {
        bankCountryCode: bankForm.bankCountryCode,
        recipientType: bankForm.recipientType,
        firstName: bankForm.firstName.trim(),
        lastName: bankForm.lastName.trim(),
        businessName: bankForm.businessName.trim(),
        bankName: bankForm.bankName.trim(),
        iban: bankForm.iban.trim().toUpperCase().replace(/\s+/g, ""),
        bic: bankForm.bic.trim().toUpperCase().replace(/\s+/g, ""),
      },
      storageKey: `bridge-request:${requestScope}:bank-recipient:inline`,
    });
  const { clearRequestId: clearOfframpRequestId, ensureRequestId: ensureOfframpRequestId } =
    useBridgeRequestId({
      payload: {
        amount: amount.trim(),
        recipientPublicId: selectedRecipientPublicId,
        sourceAsset,
      },
      storageKey: `bridge-request:${requestScope}:offramp`,
    });

  const selectedRecipient =
    bankRecipients.find(recipient => recipient.publicId === selectedRecipientPublicId) ?? null;
  const availableRawBalance = balances?.[sourceAsset].raw ?? "0";
  const splTransferFeeHint = getWalletTransferFeeHint({
    asset: sourceAsset,
    balances,
  });
  const maxAmount = getMaxAmountForAsset({
    asset: sourceAsset,
    availableRawBalance,
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetState();
    }

    onOpenChange(isOpen);
  };

  const handleCreateRecipient = async () => {
    try {
      setError(null);
      const payload = buildBankRecipientPayload(bankForm, ensureBankRecipientRequestId());

      setIsSavingRecipient(true);
      const recipient = await onCreateBankRecipient(payload);
      setSelectedRecipientPublicId(recipient.publicId);
      setIsRecipientFormOpen(false);
      setBankForm(emptyBankForm);
      clearBankRecipientRequestId();
    } catch (recipientError) {
      setError(recipientError instanceof Error ? recipientError.message : "Unable to save recipient.");
    } finally {
      setIsSavingRecipient(false);
    }
  };

  const handleContinue = async () => {
    try {
      setError(null);
      setTransactionSignature(null);

      if (!senderAddress) {
        throw new Error("Wallet connection is still initializing.");
      }

      if (!selectedRecipient) {
        throw new Error("Select a bank recipient.");
      }

      const walletRuntime = await import("@/features/wallet/runtime");
      const parsedAmount = walletRuntime.parseAssetAmount(amount, sourceAsset);
      const minimumRaw = 3n * 10n ** BigInt(walletRuntime.getAssetDecimals(sourceAsset));
      const availableBalance = BigInt(availableRawBalance);

      if (parsedAmount.raw < minimumRaw) {
        throw new Error(
          `Minimum off-ramp amount is 3 ${displayCurrencyByAsset[sourceAsset]}.`,
        );
      }

      if (parsedAmount.raw > availableBalance) {
        throw new Error("Amount exceeds the available balance.");
      }

      setIsSubmitting(true);
      const transaction = await onCreateOfframp({
        amount: parsedAmount.decimal,
        recipientPublicId: selectedRecipient.publicId,
        requestId: ensureOfframpRequestId(),
        sourceAsset,
      });

      setCreatedTransaction(transaction);
      clearOfframpRequestId();
      await broadcastOfframpTransaction(transaction);
    } catch (offrampError) {
      setError(offrampError instanceof Error ? offrampError.message : "Unable to create off-ramp.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const broadcastOfframpTransaction = async (transaction: AppTransaction) => {
    if (!senderAddress) {
      throw new Error("Wallet connection is still initializing.");
    }

    if (transaction.asset === "sol") {
      throw new Error("Off-ramp supports EURC and USDC only.");
    }

    const depositAddress = transaction.bridgeSourceDepositInstructions?.toAddress;
    if (!depositAddress) {
      throw new Error("Bridge did not return a Solana deposit address.");
    }

    let walletRuntime: typeof import("@/features/wallet/runtime") | null = null;
    let needsRecipientTokenAccountCreation = false;

    try {
      setError(null);
      setIsBroadcasting(true);
      walletRuntime = await import("@/features/wallet/runtime");

      const directTokenAccountContext = await onFetchTransactionContext({
        asset: transaction.asset,
        senderAddress,
        recipientAddress: depositAddress,
        recipientTokenAccountAddress: depositAddress,
      });
      const hasDirectTokenAccount = directTokenAccountContext.recipientTokenAccountExists ?? false;
      let transactionContext = directTokenAccountContext;
      let recipientTokenAccountAddress: string | undefined =
        hasDirectTokenAccount ? depositAddress : undefined;

      if (!hasDirectTokenAccount) {
        recipientTokenAccountAddress = walletRuntime.getRecipientTokenAccountAddress(
          transaction.asset,
          depositAddress,
        );
        transactionContext = await onFetchTransactionContext({
          asset: transaction.asset,
          senderAddress,
          recipientAddress: depositAddress,
          recipientTokenAccountAddress,
        });
      }

      const preparedTransaction = walletRuntime.prepareTransferTransaction({
        amountRaw: BigInt(transaction.amountRaw),
        asset: transaction.asset,
        balances,
        recentBlockhash: transactionContext.recentBlockhash,
        recipientAddress: depositAddress,
        recipientTokenAccountAddress: hasDirectTokenAccount ? depositAddress : recipientTokenAccountAddress,
        recipientTokenAccountExists: transactionContext.recipientTokenAccountExists ?? false,
        senderAddress,
      });
      needsRecipientTokenAccountCreation = preparedTransaction.needsRecipientTokenAccountCreation;

      const result = await sendSolanaTransaction({
        solanaAccount: senderAddress,
        network: "solana",
        transaction: preparedTransaction.serializedTransaction,
      });

      setTransactionSignature(result.transactionSignature);
    } catch (broadcastError) {
      console.error("Unable to broadcast the off-ramp transaction.", broadcastError);
      if (!walletRuntime) {
        setError("Unable to load the wallet transaction runtime.");
        return;
      }

      setError(walletRuntime.normalizeWalletTransactionError(broadcastError, {
        asset: transaction.asset,
        needsRecipientTokenAccountCreation,
      }));
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(94vw,34rem)] overflow-y-auto bg-background text-foreground"
      >
        <SheetHeader className="border-b border-border/80 bg-background pb-5">
          <SheetTitle>Off-ramp</SheetTitle>
          <SheetDescription>
            Convert EURC or USDC on Solana into EUR sent to a saved SEPA bank recipient.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-6">
          {transactionSignature ? (
            <div className="space-y-4">
              <Badge variant="secondary">Transaction submitted</Badge>
              <div>
                <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                  <CheckCircle2 className="size-5 text-primary" />
                  Off-ramp broadcast
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Monra will keep this off-ramp in Processing until Bridge confirms the bank payout.
                </p>
              </div>
              <a
                className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                href={`https://explorer.solana.com/tx/${transactionSignature}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                {transactionSignature.slice(0, 6)}...{transactionSignature.slice(-4)}
                <ArrowUpRight className="size-4" />
              </a>
              {createdTransaction?.bridgeReceiptUrl ? (
                <a
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  href={createdTransaction.bridgeReceiptUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open Bridge receipt
                  <ArrowUpRight className="size-4" />
                </a>
              ) : null}
              <Button type="button" variant="secondary" className="w-full" onClick={resetState}>
                Start another off-ramp
              </Button>
            </div>
          ) : createdTransaction ? (
            <div className="space-y-4">
              {error ? (
                <div className="rounded-[calc(var(--radius)+2px)] border border-[color:color-mix(in_srgb,var(--danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--danger)_8%,white)] px-4 py-3 text-sm text-foreground">
                  {error}
                </div>
              ) : null}
              <Badge variant="secondary">Bridge transfer created</Badge>
              <div>
                <h3 className="text-xl font-semibold text-foreground">Broadcast the source transfer</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  The Bridge transfer is ready. Send the token transfer below to continue the off-ramp.
                </p>
              </div>
              <DetailBlock
                label="Payout recipient"
                value={createdTransaction.counterpartyName ?? "Saved bank recipient"}
              />
              <DetailBlock
                label="Source amount"
                value={`${createdTransaction.amountDisplay} ${getTransferAssetLabel(createdTransaction.asset)}`}
              />
              <DetailBlock
                label="Bridge deposit address"
                value={createdTransaction.bridgeSourceDepositInstructions?.toAddress ?? "Unavailable"}
                monospace
              />
              {createdTransaction.bridgeSourceDepositInstructions?.blockchainMemo ? (
                <DetailBlock
                  label="Blockchain memo"
                  value={createdTransaction.bridgeSourceDepositInstructions.blockchainMemo}
                  monospace
                />
              ) : null}
              <DetailBlock
                label="From wallet"
                value={createdTransaction.trackedWalletAddress}
                monospace
              />
              <DetailBlock
                label="Bridge transfer"
                value={createdTransaction.bridgeTransferId ?? "Unavailable"}
                monospace
              />
              <MfaProtectedActionHint actionLabel="broadcasting this source transfer" />
              <Button
                type="button"
                className="w-full"
                disabled={isBroadcasting}
                onClick={() => void broadcastOfframpTransaction(createdTransaction)}
              >
                {isBroadcasting ? "Broadcasting..." : "Broadcast transaction"}
              </Button>
            </div>
          ) : (
            <>
              {error ? (
                <div className="rounded-[calc(var(--radius)+2px)] border border-[color:color-mix(in_srgb,var(--danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--danger)_8%,white)] px-4 py-3 text-sm text-foreground">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="offramp-amount"
                  actionDisabled={maxAmount === null}
                  actionLabel="MAX"
                  onAction={() => {
                    if (!maxAmount) {
                      return;
                    }

                    setAmount(maxAmount);
                    setError(null);
                  }}
                  label={`${displayCurrencyByAsset[sourceAsset]} amount`}
                  onChange={setAmount}
                  placeholder="25.00"
                  value={amount}
                />
                <div className="space-y-2">
                  <Label>Asset</Label>
                  <Select
                    value={sourceAsset}
                    onValueChange={value => setSourceAsset(value as OfframpSourceAsset)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OFFRAMP_SOURCE_ASSETS.map(asset => (
                        <SelectItem key={asset} value={asset}>
                          {getTransferAssetLabel(asset)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">
                Available:{" "}
                <span className="font-medium text-foreground">
                  {`${balances?.[sourceAsset].formatted ?? "0"} ${getTransferAssetLabel(sourceAsset)}`}
                </span>
              </div>

              <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                Minimum amount:{" "}
                <span className="font-medium text-foreground">
                  3 {displayCurrencyByAsset[sourceAsset]}
                </span>
              </div>

              <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                {splTransferFeeHint}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Bank recipient</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsRecipientFormOpen(current => !current)}
                  >
                    <Plus className="size-4" />
                    Add new recipient
                  </Button>
                </div>

                <Select value={selectedRecipientPublicId} onValueChange={setSelectedRecipientPublicId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a bank recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankRecipients.map(recipient => (
                      <SelectItem key={recipient.publicId} value={recipient.publicId}>
                        {recipient.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedRecipient ? (
                  <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/35 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{selectedRecipient.displayName}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {selectedRecipient.iban ?? "Saved SEPA recipient"}
                    </p>
                  </div>
                ) : bankRecipients.length === 0 ? (
                  <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-secondary/25 px-4 py-4 text-sm text-muted-foreground">
                    No bank recipients yet. Add one below to continue.
                  </div>
                ) : null}
              </div>

              {isRecipientFormOpen ? (
                <div className="space-y-4 rounded-[calc(var(--radius)+2px)] border border-border/80 bg-card p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Landmark className="size-4" />
                    </span>
                    <div>
                      <p className="font-medium text-foreground">New bank recipient</p>
                      <p className="text-sm text-muted-foreground">
                        Save a SEPA recipient and auto-select it for this off-ramp.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Bank Country</Label>
                    <Select
                      value={bankForm.bankCountryCode}
                      onValueChange={value =>
                        setBankForm(current => ({ ...current, bankCountryCode: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a SEPA country" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEPA_COUNTRIES.map(country => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name} ({country.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Recipient Type</Label>
                    <Select
                      value={bankForm.recipientType}
                      onValueChange={value =>
                        setBankForm(current => ({
                          ...current,
                          recipientType: value as BankRecipientDraft["recipientType"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose recipient type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {bankForm.recipientType === "individual" ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          id="offramp-recipient-first-name"
                          label="First Name"
                          onChange={value => setBankForm(current => ({ ...current, firstName: value }))}
                          placeholder="Enter first name"
                          value={bankForm.firstName}
                        />
                        <Field
                          id="offramp-recipient-last-name"
                          label="Last Name"
                          onChange={value => setBankForm(current => ({ ...current, lastName: value }))}
                          placeholder="Enter last name"
                          value={bankForm.lastName}
                        />
                      </div>
                      <Field
                        id="offramp-recipient-bank-name"
                        label="Bank Name"
                        onChange={value => setBankForm(current => ({ ...current, bankName: value }))}
                        placeholder="Enter bank name"
                        value={bankForm.bankName}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          id="offramp-recipient-iban"
                          label="IBAN"
                          onChange={value => setBankForm(current => ({ ...current, iban: value }))}
                          placeholder="Enter IBAN"
                          value={bankForm.iban}
                        />
                        <Field
                          id="offramp-recipient-bic"
                          label="BIC"
                          onChange={value => setBankForm(current => ({ ...current, bic: value }))}
                          placeholder="Enter BIC"
                          value={bankForm.bic}
                        />
                      </div>
                    </>
                  ) : null}

                  {bankForm.recipientType === "business" ? (
                    <>
                      <Field
                        id="offramp-recipient-business-name"
                        label="Business Name"
                        onChange={value => setBankForm(current => ({ ...current, businessName: value }))}
                        placeholder="Enter business name"
                        value={bankForm.businessName}
                      />
                      <Field
                        id="offramp-recipient-business-bank-name"
                        label="Bank Name"
                        onChange={value => setBankForm(current => ({ ...current, bankName: value }))}
                        placeholder="Enter bank name"
                        value={bankForm.bankName}
                      />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          id="offramp-recipient-business-iban"
                          label="IBAN"
                          onChange={value => setBankForm(current => ({ ...current, iban: value }))}
                          placeholder="Enter IBAN"
                          value={bankForm.iban}
                        />
                        <Field
                          id="offramp-recipient-business-bic"
                          label="BIC"
                          onChange={value => setBankForm(current => ({ ...current, bic: value }))}
                          placeholder="Enter BIC"
                          value={bankForm.bic}
                        />
                      </div>
                    </>
                  ) : null}

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        setIsRecipientFormOpen(false);
                        setBankForm(emptyBankForm);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={isSavingRecipient}
                      onClick={() => void handleCreateRecipient()}
                    >
                      {isSavingRecipient ? "Saving..." : "Save recipient"}
                    </Button>
                  </div>
                </div>
              ) : null}

                <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">Source wallet</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {senderAddress ?? "Wallet is still syncing to the backend."}
                  </p>
                </div>

                <MfaProtectedActionHint actionLabel="broadcasting this source transfer" />

                <Button
                  type="button"
                  className="w-full"
                  disabled={isSubmitting || !senderAddress || balances === undefined}
                onClick={() => void handleContinue()}
              >
                {isSubmitting || isBroadcasting ? "Creating..." : "Continue"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  function resetState() {
    clearBankRecipientRequestId();
    clearOfframpRequestId();
    setAmount("");
    setSourceAsset("eurc");
    setSelectedRecipientPublicId("");
    setIsRecipientFormOpen(false);
    setBankForm(emptyBankForm);
    setCreatedTransaction(null);
    setTransactionSignature(null);
    setIsSavingRecipient(false);
    setIsSubmitting(false);
    setIsBroadcasting(false);
    setError(null);
  }
}

function Field({
  actionDisabled,
  actionLabel,
  id,
  label,
  onAction,
  onChange,
  placeholder,
  value,
}: {
  actionDisabled?: boolean;
  actionLabel?: string;
  id: string;
  label: string;
  onAction?: () => void;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
        />
        {actionLabel && onAction ? (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            disabled={actionDisabled}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
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

function buildBankRecipientPayload(
  bankForm: typeof emptyBankForm,
  requestId: string,
): Extract<CreateRecipientPayload, { kind: "bank" }> {
  return buildSharedBankRecipientPayload(bankForm, requestId);
}

export default OfframpDrawer;
