import { useSendSolanaTransaction } from "@coinbase/cdp-hooks";
import { ArrowUpRight, CheckCircle2, Plus, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import {
  TRANSFER_ASSETS,
  getTransferAssetLabel,
} from "@/assets";
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
import { buildWalletRecipientPayload } from "@/features/recipients/recipient-payloads";
import MfaProtectedActionHint from "@/features/security/MfaProtectedActionHint";
import { getWalletTransferFeeHint } from "@/features/wallet/fee-hints";
import type {
  CreateRecipientPayload,
  FetchSolanaTransactionContextPayload,
  Recipient,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
  TransferAsset,
} from "@/types";

interface SendDrawerProps {
  balances?: SolanaBalancesResponse["balances"];
  onCreateWalletRecipient: (
    payload: Extract<CreateRecipientPayload, { kind: "wallet" }>,
  ) => Promise<Recipient>;
  onFetchTransactionContext: (
    payload: FetchSolanaTransactionContextPayload,
  ) => Promise<SolanaTransactionContextResponse>;
  onOpenChange: (isOpen: boolean) => void;
  open: boolean;
  recipients: Recipient[];
  senderAddress: string | null;
}

function SendDrawer({
  balances,
  onCreateWalletRecipient,
  onFetchTransactionContext,
  onOpenChange,
  open,
  recipients,
  senderAddress,
}: SendDrawerProps) {
  const { sendSolanaTransaction } = useSendSolanaTransaction();
  const walletRecipients = useMemo(
    () => recipients.filter(recipient => recipient.kind === "wallet" && recipient.walletAddress),
    [recipients],
  );
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<TransferAsset>("sol");
  const [selectedRecipientPublicId, setSelectedRecipientPublicId] = useState("");
  const [isRecipientFormOpen, setIsRecipientFormOpen] = useState(false);
  const [newRecipientFullName, setNewRecipientFullName] = useState("");
  const [newRecipientWalletAddress, setNewRecipientWalletAddress] = useState("");
  const [isSavingRecipient, setIsSavingRecipient] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);

  const selectedRecipient =
    walletRecipients.find(recipient => recipient.publicId === selectedRecipientPublicId) ?? null;
  const availableRawBalance = balances?.[asset].raw ?? "0";
  const transferFeeHint = getWalletTransferFeeHint({
    asset,
    balances,
  });

  const handleDrawerChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetState();
    }

    onOpenChange(isOpen);
  };

  const handleCreateRecipient = async () => {
    try {
      setError(null);
      const fullName = newRecipientFullName.trim();

      setIsSavingRecipient(true);
      const recipient = await onCreateWalletRecipient(
        await buildWalletRecipientPayload({
          fullName,
          walletAddress: newRecipientWalletAddress,
        }),
      );
      setSelectedRecipientPublicId(recipient.publicId);
      setIsRecipientFormOpen(false);
      setNewRecipientFullName("");
      setNewRecipientWalletAddress("");
    } catch (recipientError) {
      setError(recipientError instanceof Error ? recipientError.message : "Unable to save recipient.");
    } finally {
      setIsSavingRecipient(false);
    }
  };

  const handleSend = async () => {
    let walletRuntime: typeof import("@/features/wallet/runtime") | null = null;
    let needsRecipientTokenAccountCreation = false;

    try {
      setError(null);
      setTransactionSignature(null);

      if (!senderAddress) {
        throw new Error("Wallet connection is still initializing.");
      }

      if (!selectedRecipient?.walletAddress) {
        throw new Error("Select a wallet recipient.");
      }

      setIsSending(true);
      walletRuntime = await import("@/features/wallet/runtime");

      const parsedAmount = walletRuntime.parseAssetAmount(amount, asset);
      const availableBalance = BigInt(availableRawBalance);

      if (parsedAmount.raw > availableBalance) {
        throw new Error("Amount exceeds the available balance.");
      }

      const recipientTokenAccountAddress = walletRuntime.getRecipientTokenAccountAddress(
        asset,
        selectedRecipient.walletAddress,
      );
      const transactionContext = await onFetchTransactionContext({
        asset,
        senderAddress,
        recipientAddress: selectedRecipient.walletAddress,
        recipientTokenAccountAddress,
      });
      const preparedTransaction = walletRuntime.prepareTransferTransaction({
        amountRaw: parsedAmount.raw,
        asset,
        balances,
        recentBlockhash: transactionContext.recentBlockhash,
        recipientAddress: selectedRecipient.walletAddress,
        recipientTokenAccountAddress,
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
    } catch (sendError) {
      console.error("Unable to prepare or send transaction.", sendError);
      if (!walletRuntime) {
        setError("Unable to load the wallet transaction runtime.");
        return;
      }

      setError(walletRuntime.normalizeWalletTransactionError(sendError, {
        asset,
        needsRecipientTokenAccountCreation,
      }));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleDrawerChange}>
      <SheetContent
        side="right"
        className="w-[min(94vw,34rem)] overflow-y-auto bg-background text-foreground"
      >
        <SheetHeader className="border-b border-border/80 bg-background pb-5">
          <SheetTitle>Send</SheetTitle>
          <SheetDescription>
            Send SOL, USDC, or EURC to a saved wallet recipient on Solana mainnet.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-6">
          {transactionSignature ? (
            <div className="space-y-4">
              <Badge variant="secondary">Transaction submitted</Badge>
              <div>
                <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                  <CheckCircle2 className="size-5 text-primary" />
                  Transfer broadcast
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Monra will update balances and Activity when the webhook confirms this transaction.
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
              <Button type="button" variant="secondary" className="w-full" onClick={resetState}>
                Send another transaction
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
                  id="send-amount"
                  label="Amount"
                  onChange={setAmount}
                  placeholder={asset === "sol" ? "0.25" : "50.00"}
                  value={amount}
                />
                <div className="space-y-2">
                  <Label>Asset</Label>
                  <Select value={asset} onValueChange={value => setAsset(value as TransferAsset)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSFER_ASSETS.map(selectableAsset => (
                        <SelectItem key={selectableAsset} value={selectableAsset}>
                          {selectableAsset === "sol"
                            ? "Solana (SOL)"
                            : getTransferAssetLabel(selectableAsset)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">
                Available:{" "}
                <span className="font-medium text-foreground">
                  {`${balances?.[asset].formatted ?? "0"} ${getTransferAssetLabel(asset)}`}
                </span>
              </div>

              {transferFeeHint ? (
                <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                  {transferFeeHint}
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Recipient</Label>
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
                    <SelectValue placeholder="Choose a wallet recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {walletRecipients.map(recipient => (
                      <SelectItem key={recipient.publicId} value={recipient.publicId}>
                        {recipient.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedRecipient?.walletAddress ? (
                  <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/35 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{selectedRecipient.displayName}</p>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {selectedRecipient.walletAddress}
                    </p>
                  </div>
                ) : walletRecipients.length === 0 ? (
                  <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-secondary/25 px-4 py-4 text-sm text-muted-foreground">
                    No wallet recipients yet. Add one below to continue.
                  </div>
                ) : null}
              </div>

              {isRecipientFormOpen ? (
                <div className="space-y-4 rounded-[calc(var(--radius)+2px)] border border-border/80 bg-card p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Wallet className="size-4" />
                    </span>
                    <div>
                      <p className="font-medium text-foreground">New wallet recipient</p>
                      <p className="text-sm text-muted-foreground">
                        Save a wallet recipient and auto-select it for this transfer.
                      </p>
                    </div>
                  </div>
                  <Field
                    id="send-recipient-full-name"
                    label="Full Name"
                    onChange={setNewRecipientFullName}
                    placeholder="Hassan Qureshi"
                    value={newRecipientFullName}
                  />
                  <Field
                    id="send-recipient-wallet-address"
                    label="Solana Wallet Address"
                    onChange={setNewRecipientWalletAddress}
                    placeholder="Enter Solana wallet address"
                    value={newRecipientWalletAddress}
                  />
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        setIsRecipientFormOpen(false);
                        setNewRecipientFullName("");
                        setNewRecipientWalletAddress("");
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

              <MfaProtectedActionHint actionLabel="sending this transfer" />

              <Button
                type="button"
                className="w-full"
                disabled={isSending || !senderAddress || balances === undefined}
                onClick={() => void handleSend()}
              >
                {isSending ? "Sending..." : "Send"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  function resetState() {
    setAmount("");
    setAsset("sol");
    setSelectedRecipientPublicId("");
    setIsRecipientFormOpen(false);
    setNewRecipientFullName("");
    setNewRecipientWalletAddress("");
    setIsSavingRecipient(false);
    setIsSending(false);
    setError(null);
    setTransactionSignature(null);
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

export default SendDrawer;
