import { Buffer } from "buffer";

import { useSendSolanaTransaction } from "@coinbase/cdp-hooks";
import {
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { ArrowUpRight, CheckCircle2, Plus, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

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

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;
const SOL_DECIMALS = 9;

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
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [isRecipientFormOpen, setIsRecipientFormOpen] = useState(false);
  const [newRecipientFullName, setNewRecipientFullName] = useState("");
  const [newRecipientWalletAddress, setNewRecipientWalletAddress] = useState("");
  const [isSavingRecipient, setIsSavingRecipient] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);

  const selectedRecipient =
    walletRecipients.find(recipient => String(recipient.id) === selectedRecipientId) ?? null;
  const availableRawBalance = asset === "sol" ? balances?.sol.raw ?? "0" : balances?.usdc.raw ?? "0";

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
      const walletAddress = newRecipientWalletAddress.trim();

      if (!fullName) {
        throw new Error("Full name is required.");
      }

      assertValidSolanaAddress(walletAddress);

      setIsSavingRecipient(true);
      const recipient = await onCreateWalletRecipient({
        kind: "wallet",
        fullName,
        walletAddress,
      });
      setSelectedRecipientId(String(recipient.id));
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
    try {
      setError(null);
      setTransactionSignature(null);

      if (!senderAddress) {
        throw new Error("Wallet connection is still initializing.");
      }

      const parsedAmount = parseTransferAmount(amount, asset === "sol" ? SOL_DECIMALS : USDC_DECIMALS);
      const availableBalance = BigInt(availableRawBalance);

      if (!selectedRecipient?.walletAddress) {
        throw new Error("Select a wallet recipient.");
      }

      if (parsedAmount.raw > availableBalance) {
        throw new Error("Amount exceeds the available balance.");
      }

      const recipientTokenAccountAddress =
        asset === "usdc"
          ? findAssociatedTokenAddress(new PublicKey(selectedRecipient.walletAddress), USDC_MINT).toBase58()
          : undefined;
      const transactionContext = await onFetchTransactionContext({
        asset,
        senderAddress,
        recipientAddress: selectedRecipient.walletAddress,
        recipientTokenAccountAddress,
      });
      const transaction = buildSerializedTransaction({
        amountRaw: parsedAmount.raw,
        asset,
        recentBlockhash: transactionContext.recentBlockhash,
        recipientAddress: selectedRecipient.walletAddress,
        recipientUsdcAtaExists: transactionContext.recipientUsdcAtaExists ?? false,
        senderAddress,
      });

      setIsSending(true);

      const result = await sendSolanaTransaction({
        solanaAccount: senderAddress,
        network: "solana",
        transaction,
      });

      setTransactionSignature(result.transactionSignature);
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Unable to prepare or send transaction.",
      );
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
            Send SOL or USDC to a saved wallet recipient on Solana mainnet.
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
                      <SelectItem value="sol">Solana (SOL)</SelectItem>
                      <SelectItem value="usdc">USDC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">
                Available:{" "}
                <span className="font-medium text-foreground">
                  {asset === "sol"
                    ? `${balances?.sol.formatted ?? "0"} SOL`
                    : `${balances?.usdc.formatted ?? "0"} USDC`}
                </span>
              </div>

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

                <Select value={selectedRecipientId || undefined} onValueChange={setSelectedRecipientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a wallet recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {walletRecipients.map(recipient => (
                      <SelectItem key={recipient.id} value={String(recipient.id)}>
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
    setSelectedRecipientId("");
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

function buildSerializedTransaction(input: {
  amountRaw: bigint;
  asset: TransferAsset;
  recentBlockhash: string;
  recipientAddress: string;
  recipientUsdcAtaExists: boolean;
  senderAddress: string;
}) {
  const senderPublicKey = new PublicKey(input.senderAddress);
  const recipientPublicKey = new PublicKey(input.recipientAddress);
  const transaction = new Transaction();

  if (input.asset === "sol") {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: senderPublicKey,
        toPubkey: recipientPublicKey,
        lamports: input.amountRaw,
      }),
    );
  } else {
    const senderAta = findAssociatedTokenAddress(senderPublicKey, USDC_MINT);
    const recipientAta = findAssociatedTokenAddress(recipientPublicKey, USDC_MINT);

    if (!input.recipientUsdcAtaExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderPublicKey,
          recipientAta,
          recipientPublicKey,
          USDC_MINT,
        ),
      );
    }

    transaction.add(
      createTransferCheckedInstruction({
        amount: input.amountRaw,
        decimals: USDC_DECIMALS,
        destination: recipientAta,
        mint: USDC_MINT,
        owner: senderPublicKey,
        source: senderAta,
      }),
    );
  }

  transaction.recentBlockhash = input.recentBlockhash;
  transaction.feePayer = senderPublicKey;

  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return Buffer.from(serializedTransaction).toString("base64");
}

function parseTransferAmount(amount: string, decimals: number) {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid amount.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(
      `This asset supports up to ${decimals} decimal place${decimals === 1 ? "" : "s"}.`,
    );
  }

  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.padEnd(decimals, "0");
  const raw = BigInt(`${normalizedWhole}${normalizedFraction}` || "0");

  if (raw <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return {
    decimal: formatAmount(raw, decimals),
    raw,
  };
}

function formatAmount(amount: bigint, decimals: number) {
  const value = amount.toString().padStart(decimals + 1, "0");
  const whole = value.slice(0, -decimals) || "0";
  const fraction = value.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function assertValidSolanaAddress(value: string) {
  try {
    new PublicKey(value);
  } catch {
    throw new Error("Solana wallet address is invalid.");
  }
}

function findAssociatedTokenAddress(owner: PublicKey, mint: PublicKey) {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  return address;
}

function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

function createTransferCheckedInstruction(input: {
  amount: bigint;
  decimals: number;
  destination: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  source: PublicKey;
}) {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(input.amount, 1);
  data.writeUInt8(input.decimals, 9);

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: input.source, isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.destination, isSigner: false, isWritable: true },
      { pubkey: input.owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export default SendDrawer;
