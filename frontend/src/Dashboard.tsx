import { useSolanaAddress } from "@coinbase/cdp-hooks";
import { ExternalLink, Mail, MapPin, Send, ShieldCheck, WalletCards } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";

import AppShell, { AlertBarItem } from "@/AppShell";
import { quickActions } from "@/dashboard-view-models";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DialogTrigger,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import SendDrawer from "@/SendDrawer";
import type {
  AppTransaction,
  AppUser,
  BridgeComplianceState,
  CreateRecipientPayload,
  FetchSolanaTransactionContextPayload,
  Recipient,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
} from "@/types";

interface Props {
  balances?: SolanaBalancesResponse["balances"];
  bridge: BridgeComplianceState;
  onCreateWalletRecipient: (
    payload: Extract<CreateRecipientPayload, { kind: "wallet" }>,
  ) => Promise<Recipient>;
  onFetchSolanaTransactionContext: (
    payload: FetchSolanaTransactionContextPayload,
  ) => Promise<SolanaTransactionContextResponse>;
  onPersistSolanaAddress: (solanaAddress: string) => Promise<void>;
  onRefreshBridgeStatus: () => Promise<void>;
  recipients: Recipient[];
  transactions: AppTransaction[];
  transactionsError: string | null;
  transactionsLoading: boolean;
  user: AppUser;
}

function Dashboard({
  balances,
  bridge,
  onCreateWalletRecipient,
  onFetchSolanaTransactionContext,
  onPersistSolanaAddress,
  onRefreshBridgeStatus,
  recipients,
  transactions,
  transactionsError,
  transactionsLoading,
  user,
}: Props) {
  const { solanaAddress } = useSolanaAddress();
  const [dismissedTosAlert, setDismissedTosAlert] = useState(false);
  const [isKycDialogOpen, setIsKycDialogOpen] = useState(false);
  const [isTosDialogOpen, setIsTosDialogOpen] = useState(false);
  const [isSendDrawerOpen, setIsSendDrawerOpen] = useState(false);
  const [persistedSolanaAddress, setPersistedSolanaAddress] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const effectiveSolanaAddress = user.solanaAddress ?? solanaAddress ?? null;
  const showKycAlert = bridge.showKycAlert;
  const showTosAlert = bridge.showTosAlert && !dismissedTosAlert;
  const displayedKycStatus = bridge.customerStatus ?? user.bridgeKycStatus ?? "not_started";

  const balanceMetrics = [
    {
      id: "sol",
      label: "SOL",
      value: balances ? `${balances.sol.formatted} SOL` : undefined,
      note: "Live",
      tone: "live" as const,
    },
    {
      id: "usdc",
      label: "USDC",
      value: balances ? `${balances.usdc.formatted} USDC` : undefined,
      note: "Live",
      tone: "live" as const,
    },
  ];

  const refreshBridgeStatus = useCallback(async () => {
    try {
      await onRefreshBridgeStatus();
    } catch (error) {
      console.error(error);
    }
  }, [onRefreshBridgeStatus]);

  useEffect(() => {
    if (!effectiveSolanaAddress || user.solanaAddress || persistedSolanaAddress === effectiveSolanaAddress) {
      return;
    }

    setPersistedSolanaAddress(effectiveSolanaAddress);
    void onPersistSolanaAddress(effectiveSolanaAddress).catch(error => {
      console.error(error);
      setPersistedSolanaAddress(null);
    });
  }, [effectiveSolanaAddress, onPersistSolanaAddress, persistedSolanaAddress, user.solanaAddress]);

  useEffect(() => {
    if (!user.bridgeKycLink) {
      setQrCodeDataUrl(null);
      return;
    }

    let cancelled = false;

    void QRCode.toDataURL(user.bridgeKycLink, {
      margin: 1,
      width: 280,
    })
      .then((result: string) => {
        if (!cancelled) {
          setQrCodeDataUrl(result);
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) {
          setQrCodeDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user.bridgeKycLink]);

  useEffect(() => {
    if (!bridge.showTosAlert) {
      setDismissedTosAlert(false);
    }
  }, [bridge.showTosAlert]);

  useEffect(() => {
    if (!isTosDialogOpen || !user.bridgeTosLink) {
      return;
    }

    let tosOrigin = "";

    try {
      tosOrigin = new URL(user.bridgeTosLink).origin;
    } catch (error) {
      console.error(error);
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== tosOrigin) {
        return;
      }

      if (!extractSignedAgreementId(event.data)) {
        return;
      }

      setDismissedTosAlert(true);
      setIsTosDialogOpen(false);
      void refreshBridgeStatus();
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isTosDialogOpen, refreshBridgeStatus, user.bridgeTosLink]);

  useEffect(() => {
    if (!showKycAlert) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshBridgeStatus();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshBridgeStatus, showKycAlert]);

  const alerts =
    showTosAlert || showKycAlert ? (
      <>
        {showTosAlert && user.bridgeTosLink ? (
          <AlertBarItem
            action="Review & Accept"
            body="To convert between fiat and stablecoins, please review and accept our payment partner's terms."
            label="Required"
            onClick={() => setIsTosDialogOpen(true)}
            title="Complete Account Setup"
          />
        ) : null}
        {showKycAlert && user.bridgeKycLink ? (
          <AlertBarItem
            action="Start Verification"
            body="To unlock full account access, please complete identity verification. This usually takes a few minutes."
            label="Verify"
            onClick={() => setIsKycDialogOpen(true)}
            title="Verify Your Identity"
          />
        ) : null}
      </>
    ) : undefined;

  return (
    <AppShell alerts={alerts}>
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-3xl">Balances</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {balanceMetrics.map(metric => (
                  <div
                    key={metric.id}
                    className={cn(
                      "rounded-[calc(var(--radius)+2px)] border p-5",
                      "border-primary/15 bg-primary/5",
                    )}
                  >
                    <p className="font-mono text-xs uppercase tracking-[0.26em] text-muted-foreground">
                      {metric.label}
                    </p>
                    {metric.value === undefined ? (
                      <>
                        <Skeleton className="mt-4 h-10 w-32 rounded-full" />
                        <Skeleton className="mt-3 h-4 w-24 rounded-full" />
                      </>
                    ) : (
                      <>
                        <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
                          {metric.value}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">{metric.note}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {quickActions.map(action => {
                  const Icon = action.icon;

                  if (action.id === "send") {
                    return (
                      <Button
                        key={action.id}
                        variant="default"
                        className="h-auto min-h-16 justify-start rounded-[calc(var(--radius)+4px)] px-4 py-3 text-left"
                        onClick={() => setIsSendDrawerOpen(true)}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                          <Icon />
                        </span>
                        <span className="min-w-0 text-base font-medium">{action.label}</span>
                      </Button>
                    );
                  }

                  return (
                    <Dialog key={action.id}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-auto min-h-16 justify-start rounded-[calc(var(--radius)+4px)] px-4 py-3 text-left"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                            <Icon />
                          </span>
                          <span className="min-w-0 text-base font-medium">{action.label}</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-xl">
                        <PlaceholderActionForm kind={action.id} />
                      </DialogContent>
                    </Dialog>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-14">
                  <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <CardTitle>Welcome {user.fullName}</CardTitle>
                  <CardDescription>
                    {user.accountType === "business" ? "Business" : "Individual"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow
                icon={WalletCards}
                label="Account type"
                value={user.accountType === "business" ? "Business" : "Individual"}
              />
              <InfoRow icon={MapPin} label="Country" value={user.countryName} />
              <InfoRow icon={Mail} label="Email" value={user.email} />
              <StatusRow label="KYC status" status={displayedKycStatus} />
              <Separator />
              <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-secondary/40 p-4">
                <p className="text-sm font-medium">Wallet</p>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {effectiveSolanaAddress ?? "Address will appear after wallet initialization."}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="pb-5">
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {transactionsError ? (
              <div className="rounded-[calc(var(--radius)+2px)] border border-[color:color-mix(in_srgb,var(--danger)_28%,white)] bg-[color:color-mix(in_srgb,var(--danger)_8%,white)] px-4 py-3 text-sm text-foreground">
                {transactionsError}
              </div>
            ) : transactionsLoading ? (
              <div className="space-y-3">
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
                    Add funds to start using Monra.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map(transaction => (
                  <div
                    key={transaction.id}
                    className="flex flex-col gap-3 rounded-[calc(var(--radius)+2px)] border border-border/70 bg-background/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-foreground">
                        <Send className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{formatActivityTitle(transaction)}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {formatActivitySubtitle(transaction)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
                      <p className="text-lg font-semibold text-foreground">
                        {formatActivityAmount(transaction)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatActivityTimestamp(transaction.confirmedAt ?? transaction.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <SendDrawer
        balances={balances}
        onCreateWalletRecipient={onCreateWalletRecipient}
        onFetchTransactionContext={onFetchSolanaTransactionContext}
        onOpenChange={setIsSendDrawerOpen}
        open={isSendDrawerOpen}
        recipients={recipients}
        senderAddress={effectiveSolanaAddress}
      />

      <Dialog open={isTosDialogOpen} onOpenChange={setIsTosDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Bridge Terms of Service</DialogTitle>
            <DialogDescription>
              Review and accept the payment partner terms to enable fiat and stablecoin flows.
            </DialogDescription>
          </DialogHeader>
          {user.bridgeTosLink ? (
            <iframe
              title="Bridge Terms of Service"
              src={user.bridgeTosLink}
              className="h-[70vh] w-full rounded-[calc(var(--radius)+2px)] border"
            />
          ) : (
            <p className="text-sm text-muted-foreground">Terms link unavailable.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isKycDialogOpen} onOpenChange={setIsKycDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Verify on your phone</DialogTitle>
            <DialogDescription>
              Scan the QR code to continue verification on mobile, or open the same link in a new tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center rounded-[calc(var(--radius)+2px)] border bg-secondary/30 p-5">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Bridge KYC QR code"
                  className="size-64 rounded-xl bg-white p-3"
                />
              ) : (
                <div className="flex size-64 items-center justify-center rounded-xl bg-white text-sm text-muted-foreground">
                  QR code unavailable
                </div>
              )}
            </div>

            <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
              Point your phone camera at the code above to complete KYC on mobile.
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={!user.bridgeKycLink}
              onClick={() => {
                if (!user.bridgeKycLink) {
                  return;
                }

                window.open(user.bridgeKycLink, "_blank", "noopener,noreferrer");
              }}
            >
              Continue
              <ExternalLink className="ml-2 size-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function PlaceholderActionForm({ kind }: { kind: "onramp" | "offramp" }) {
  const isOnramp = kind === "onramp";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isOnramp ? "Onramp" : "Offramp"}</DialogTitle>
        <DialogDescription>Backend integration pending.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${kind}-amount`}>Amount</Label>
            <Input id={`${kind}-amount`} placeholder={isOnramp ? "$250.00" : "$120.00"} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${kind}-rail`}>Rail</Label>
            <Select>
              <SelectTrigger id={`${kind}-rail`}>
                <SelectValue placeholder={isOnramp ? "Choose payment rail" : "Choose payout rail"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">{isOnramp ? "Bank transfer" : "Bank payout"}</SelectItem>
                <SelectItem value="card">{isOnramp ? "Debit card" : "Debit card payout"}</SelectItem>
                <SelectItem value="wire">Wire settlement</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${kind}-destination`}>
            {isOnramp ? "Destination wallet" : "Payout account"}
          </Label>
          <Input
            id={`${kind}-destination`}
            placeholder={isOnramp ? "Connected wallet" : "Primary payout method"}
          />
        </div>

        <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          Backend integration pending.
        </div>

        <Button type="button" className="w-full" disabled>
          Backend integration pending
        </Button>
      </div>
    </>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary">
        <ShieldCheck className="size-4" />
      </span>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <Badge variant={status === "active" ? "default" : "secondary"} className="mt-2">
          {formatBridgeStatus(status)}
        </Badge>
      </div>
    </div>
  );
}

function extractSignedAgreementId(data: unknown) {
  if (typeof data === "string") {
    try {
      return extractSignedAgreementId(JSON.parse(data));
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  if ("signedAgreementId" in data && typeof data.signedAgreementId === "string") {
    return data.signedAgreementId;
  }

  if ("signed_agreement_id" in data && typeof data.signed_agreement_id === "string") {
    return data.signed_agreement_id;
  }

  return null;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("");
}

function formatBridgeStatus(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActivityTimestamp(value: string | null) {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatActivityTitle(transaction: AppTransaction) {
  if (transaction.entryType === "network_fee") {
    return "Network Fee";
  }

  return transaction.direction === "inbound" ? "Received" : "Send";
}

function formatActivitySubtitle(transaction: AppTransaction) {
  if (transaction.entryType === "network_fee") {
    return "Solana mainnet execution fee";
  }

  if (transaction.direction === "inbound") {
    return `From ${
      transaction.counterpartyName ??
      transaction.counterpartyWalletAddress ??
      transaction.fromWalletAddress
    }`;
  }

  return `To ${transaction.counterpartyName ?? transaction.counterpartyWalletAddress ?? "Unknown wallet"}`;
}

function formatActivityAmount(transaction: AppTransaction) {
  const prefix = transaction.direction === "inbound" ? "+" : "-";
  return `${prefix}${transaction.amountDecimal} ${transaction.asset === "sol" ? "SOL" : "USDC"}`;
}

export default Dashboard;
