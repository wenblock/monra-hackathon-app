import { Landmark, Plus, Trash2, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import AppShell from "@/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  buildBankRecipientPayload,
  buildWalletRecipientPayload,
  type BankRecipientDraft,
  type WalletRecipientDraft,
} from "@/features/recipients/recipient-payloads";
import { SEPA_COUNTRIES } from "@/sepa-countries";
import type { CreateRecipientPayload, Recipient } from "@/types";

interface RecipientsPageProps {
  isLoading: boolean;
  loadError: string | null;
  onCreateRecipient: (payload: CreateRecipientPayload) => Promise<Recipient>;
  onDeleteRecipient: (recipientPublicId: string) => Promise<void>;
  recipients: Recipient[];
}

type RecipientFormKind = "wallet" | "bank" | null;

const emptyWalletForm: WalletRecipientDraft = {
  fullName: "",
  walletAddress: "",
};

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

function RecipientsPage({
  isLoading,
  loadError,
  onCreateRecipient,
  onDeleteRecipient,
  recipients,
}: RecipientsPageProps) {
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<RecipientFormKind>(null);
  const [walletForm, setWalletForm] = useState(emptyWalletForm);
  const [bankForm, setBankForm] = useState(emptyBankForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recipientPendingDelete, setRecipientPendingDelete] = useState<Recipient | null>(null);
  const [deletingRecipientPublicId, setDeletingRecipientPublicId] = useState<string | null>(null);

  useEffect(() => {
    if (isCreateSheetOpen) {
      return;
    }

    setSelectedKind(null);
    setWalletForm(emptyWalletForm);
    setBankForm(emptyBankForm);
    setFormError(null);
    setIsSubmitting(false);
  }, [isCreateSheetOpen]);

  const handleCreateRecipient = async () => {
    try {
      setFormError(null);

      const payload = await buildCreatePayload(selectedKind, walletForm, bankForm);
      setIsSubmitting(true);
      await onCreateRecipient(payload);
      setIsCreateSheetOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to create recipient.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecipient = async () => {
    if (!recipientPendingDelete) {
      return;
    }

    try {
      setDeletingRecipientPublicId(recipientPendingDelete.publicId);
      await onDeleteRecipient(recipientPendingDelete.publicId);
      setRecipientPendingDelete(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to delete recipient.");
    } finally {
      setDeletingRecipientPublicId(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <CardTitle className="text-3xl">Recipients</CardTitle>
                <CardDescription>
                  Save wallet addresses and SEPA bank accounts for future payout flows.
                </CardDescription>
              </div>
              <Button type="button" className="sm:self-start" onClick={() => setIsCreateSheetOpen(true)}>
                <Plus className="size-4" />
                Add new recipient
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formError ?? loadError ? (
              <div className="rounded-[calc(var(--radius)+2px)] border border-[color:color-mix(in_srgb,var(--danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--danger)_8%,white)] px-4 py-3 text-sm text-foreground">
                {formError ?? loadError}
              </div>
            ) : null}

            <div className="hidden rounded-[calc(var(--radius)+2px)] border border-border/80 md:block">
              <div className="grid grid-cols-[1.4fr_0.9fr_1.8fr_0.8fr_0.6fr] gap-4 border-b border-border/80 px-5 py-4 text-xs font-mono uppercase tracking-[0.22em] text-muted-foreground">
                <span>Full Name</span>
                <span>Type</span>
                <span>Account</span>
                <span>Last Payment</span>
                <span className="text-right">Delete</span>
              </div>

              {isLoading ? (
                <div className="px-5 py-8 text-sm text-muted-foreground">Loading recipients...</div>
              ) : recipients.length === 0 ? (
                <div className="px-5 py-8 text-sm text-muted-foreground">
                  No recipients yet. Add a wallet or SEPA bank recipient to get started.
                </div>
              ) : (
                recipients.map(recipient => (
                  <RecipientDesktopRow
                    key={recipient.publicId}
                    recipient={recipient}
                    isDeleting={deletingRecipientPublicId === recipient.publicId}
                    onDelete={() => setRecipientPendingDelete(recipient)}
                  />
                ))
              )}
            </div>

            <div className="space-y-3 md:hidden">
              {isLoading ? (
                <Card className="border-dashed">
                  <CardContent className="p-5 text-sm text-muted-foreground">
                    Loading recipients...
                  </CardContent>
                </Card>
              ) : recipients.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-5 text-sm text-muted-foreground">
                    No recipients yet. Add a wallet or SEPA bank recipient to get started.
                  </CardContent>
                </Card>
              ) : (
                recipients.map(recipient => (
                  <RecipientMobileCard
                    key={recipient.publicId}
                    recipient={recipient}
                    isDeleting={deletingRecipientPublicId === recipient.publicId}
                    onDelete={() => setRecipientPendingDelete(recipient)}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet open={isCreateSheetOpen} onOpenChange={setIsCreateSheetOpen}>
        <SheetContent
          side="right"
          className="w-[min(94vw,34rem)] overflow-y-auto bg-background text-foreground"
        >
          <SheetHeader className="border-b border-border/80 bg-background pb-5">
            <SheetTitle>Create recipient</SheetTitle>
            <SheetDescription>
              Choose a payout rail, complete the details, and save the recipient.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <KindTile
                icon={Wallet}
                isSelected={selectedKind === "wallet"}
                label="Wallet"
                caption="Store a Solana wallet address."
                onClick={() => setSelectedKind("wallet")}
              />
              <KindTile
                icon={Landmark}
                isSelected={selectedKind === "bank"}
                label="Bank"
                caption="Create a SEPA bank recipient."
                onClick={() => setSelectedKind("bank")}
              />
            </div>

            {selectedKind === "wallet" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wallet-full-name">Full Name</Label>
                  <Input
                    id="wallet-full-name"
                    value={walletForm.fullName}
                    onChange={event =>
                      setWalletForm(current => ({ ...current, fullName: event.target.value }))
                    }
                    placeholder="Enter full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wallet-address">Solana Wallet Address</Label>
                  <Input
                    id="wallet-address"
                    value={walletForm.walletAddress}
                    onChange={event =>
                      setWalletForm(current => ({ ...current, walletAddress: event.target.value }))
                    }
                    placeholder="Enter wallet address"
                  />
                </div>
              </div>
            ) : null}

            {selectedKind === "bank" ? (
              <div className="space-y-4">
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
                        id="bank-first-name"
                        label="First Name"
                        value={bankForm.firstName}
                        onChange={value => setBankForm(current => ({ ...current, firstName: value }))}
                        placeholder="Enter first name"
                      />
                      <Field
                        id="bank-last-name"
                        label="Last Name"
                        value={bankForm.lastName}
                        onChange={value => setBankForm(current => ({ ...current, lastName: value }))}
                        placeholder="Enter last name"
                      />
                    </div>
                    <Field
                      id="bank-name"
                      label="Bank Name"
                      value={bankForm.bankName}
                      onChange={value => setBankForm(current => ({ ...current, bankName: value }))}
                      placeholder="Enter bank name"
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id="bank-iban"
                        label="IBAN"
                        value={bankForm.iban}
                        onChange={value => setBankForm(current => ({ ...current, iban: value }))}
                        placeholder="Enter IBAN"
                      />
                      <Field
                        id="bank-bic"
                        label="BIC"
                        value={bankForm.bic}
                        onChange={value => setBankForm(current => ({ ...current, bic: value }))}
                        placeholder="Enter BIC"
                      />
                    </div>
                  </>
                ) : null}

                {bankForm.recipientType === "business" ? (
                  <>
                    <Field
                      id="business-name"
                      label="Business Name"
                      value={bankForm.businessName}
                      onChange={value =>
                        setBankForm(current => ({ ...current, businessName: value }))
                      }
                      placeholder="Enter business name"
                    />
                    <Field
                      id="business-bank-name"
                      label="Bank Name"
                      value={bankForm.bankName}
                      onChange={value => setBankForm(current => ({ ...current, bankName: value }))}
                      placeholder="Enter bank name"
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id="business-iban"
                        label="IBAN"
                        value={bankForm.iban}
                        onChange={value => setBankForm(current => ({ ...current, iban: value }))}
                        placeholder="Enter IBAN"
                      />
                      <Field
                        id="business-bic"
                        label="BIC"
                        value={bankForm.bic}
                        onChange={value => setBankForm(current => ({ ...current, bic: value }))}
                        placeholder="Enter BIC"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            <Button
              type="button"
              className="w-full"
              disabled={!selectedKind || isSubmitting}
              onClick={() => void handleCreateRecipient()}
            >
              {isSubmitting ? "Saving recipient..." : "Save recipient"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={recipientPendingDelete !== null}
        onOpenChange={isOpen => {
          if (!isOpen) {
            setRecipientPendingDelete(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete recipient</DialogTitle>
            <DialogDescription>
              {recipientPendingDelete
                ? `Remove ${recipientPendingDelete.displayName} from saved recipients?`
                : "Remove this recipient from saved recipients?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRecipientPendingDelete(null)}
              disabled={deletingRecipientPublicId !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteRecipient()}
              disabled={deletingRecipientPublicId !== null}
            >
              {deletingRecipientPublicId !== null ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function RecipientDesktopRow({
  recipient,
  isDeleting,
  onDelete,
}: {
  recipient: Recipient;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-[1.4fr_0.9fr_1.8fr_0.8fr_0.6fr] gap-4 border-t border-border/70 px-5 py-4 first:border-t-0">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{recipient.displayName}</p>
        {recipient.kind === "bank" && recipient.bankName ? (
          <p className="mt-1 text-sm text-muted-foreground">{recipient.bankName}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Badge variant={recipient.kind === "wallet" ? "secondary" : "default"}>
          {recipient.kind === "wallet" ? "Wallet" : "Bank"}
        </Badge>
        {recipient.kind === "bank" && recipient.bankRecipientType ? (
          <p className="text-xs text-muted-foreground">
            {recipient.bankRecipientType === "individual" ? "Individual" : "Business"}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="break-all font-mono text-sm text-foreground">{getRecipientAccount(recipient)}</p>
      </div>
      <div className="text-sm text-muted-foreground">{formatLastPayment(recipient.lastPaymentAt)}</div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={onDelete} disabled={isDeleting}>
          <Trash2 className="size-4 text-[var(--danger)]" />
          <span className="sr-only">Delete recipient</span>
        </Button>
      </div>
    </div>
  );
}

function RecipientMobileCard({
  recipient,
  isDeleting,
  onDelete,
}: {
  recipient: Recipient;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="font-medium text-foreground">{recipient.displayName}</p>
            <div className="flex items-center gap-2">
              <Badge variant={recipient.kind === "wallet" ? "secondary" : "default"}>
                {recipient.kind === "wallet" ? "Wallet" : "Bank"}
              </Badge>
              {recipient.kind === "bank" && recipient.bankRecipientType ? (
                <span className="text-xs text-muted-foreground">
                  {recipient.bankRecipientType === "individual" ? "Individual" : "Business"}
                </span>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label="Delete recipient"
          >
            <Trash2 className="size-4 text-[var(--danger)]" />
          </Button>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Account
            </p>
            <p className="mt-1 break-all font-mono text-foreground">{getRecipientAccount(recipient)}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Last Payment
            </p>
            <p className="mt-1 text-muted-foreground">{formatLastPayment(recipient.lastPaymentAt)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KindTile({
  icon: Icon,
  isSelected,
  label,
  caption,
  onClick,
}: {
  icon: LucideIcon;
  isSelected: boolean;
  label: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[calc(var(--radius)+2px)] border p-4 text-left transition-colors ${
        isSelected
          ? "border-primary/40 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
          : "border-border bg-card hover:bg-secondary/50"
      }`}
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

async function buildCreatePayload(
  selectedKind: RecipientFormKind,
  walletForm: typeof emptyWalletForm,
  bankForm: typeof emptyBankForm,
): Promise<CreateRecipientPayload> {
  if (selectedKind === "wallet") {
    return await buildWalletRecipientPayload(walletForm);
  }

  if (selectedKind !== "bank") {
    throw new Error("Choose Wallet or Bank before saving.");
  }

  return buildBankRecipientPayload(bankForm);
}

function getRecipientAccount(recipient: Recipient) {
  return recipient.kind === "wallet" ? recipient.walletAddress ?? "-" : recipient.iban ?? "-";
}

function formatLastPayment(lastPaymentAt: string | null) {
  if (!lastPaymentAt) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(lastPaymentAt));
}

export default RecipientsPage;
