import { Link } from "@tanstack/react-router";
import { useSolanaAddress } from "@coinbase/cdp-hooks";
import { ExternalLink, Mail, MapPin, Send, ShieldCheck, WalletCards } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";

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
} from "@/components/ui/dialog";
import InlineNotice from "@/components/ui/inline-notice";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TRANSFER_ASSETS, getTransferAssetLabel } from "@/assets";
import { logRuntimeError } from "@/lib/log-runtime-error";
import { cn } from "@/lib/utils";
import TransactionActivityList from "@/TransactionActivityList";
import type {
  AppTransaction,
  AppUser,
  BridgeComplianceState,
  CreateOfframpPayload,
  CreateOnrampPayload,
  CreateRecipientPayload,
  FetchSolanaTransactionContextPayload,
  Recipient,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
} from "@/types";

const LazyOfframpDrawer = lazy(() => import("@/OfframpDrawer"));
const LazyOnrampDrawer = lazy(() => import("@/OnrampDrawer"));
const LazySendDrawer = lazy(() => import("@/SendDrawer"));

const TOS_IFRAME_SANDBOX =
  "allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts";

interface Props {
  balances?: SolanaBalancesResponse["balances"];
  bridge: BridgeComplianceState;
  onCreateOfframp: (payload: CreateOfframpPayload) => Promise<AppTransaction>;
  onCreateOnramp: (payload: CreateOnrampPayload) => Promise<AppTransaction>;
  onCreateRecipient: (payload: CreateRecipientPayload) => Promise<Recipient>;
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
  onCreateOfframp,
  onCreateOnramp,
  onCreateRecipient,
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
  const [isOnrampDrawerOpen, setIsOnrampDrawerOpen] = useState(false);
  const [isOfframpDrawerOpen, setIsOfframpDrawerOpen] = useState(false);
  const [isSendDrawerOpen, setIsSendDrawerOpen] = useState(false);
  const [persistedSolanaAddress, setPersistedSolanaAddress] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [dashboardNotice, setDashboardNotice] = useState<string | null>(null);
  const [tosEmbedError, setTosEmbedError] = useState(false);
  const [kycDialogNotice, setKycDialogNotice] = useState<string | null>(null);

  const effectiveSolanaAddress = user.solanaAddress ?? solanaAddress ?? null;
  const showKycAlert = bridge.showKycAlert;
  const showTosAlert = bridge.showTosAlert && !dismissedTosAlert;
  const displayedKycStatus = bridge.customerStatus ?? user.bridgeKycStatus ?? "not_started";
  const recentTransactions = transactions.slice(0, 5);

  const balanceMetrics = TRANSFER_ASSETS.map(asset => ({
    id: asset,
    label: getTransferAssetLabel(asset),
    value: balances ? `${balances[asset].formatted} ${getTransferAssetLabel(asset)}` : undefined,
    note: "Live",
    tone: "live" as const,
  }));

  const refreshBridgeStatus = useCallback(async () => {
    try {
      await onRefreshBridgeStatus();
      setDashboardNotice(null);
    } catch (error) {
      logRuntimeError("Unable to refresh Bridge status.", error);
      setDashboardNotice(
        "Unable to refresh your Bridge status right now. You can keep using the verification links and retry shortly.",
      );
    }
  }, [onRefreshBridgeStatus]);

  useEffect(() => {
    if (!effectiveSolanaAddress || user.solanaAddress || persistedSolanaAddress === effectiveSolanaAddress) {
      return;
    }

    setPersistedSolanaAddress(effectiveSolanaAddress);
    void onPersistSolanaAddress(effectiveSolanaAddress).catch(error => {
      logRuntimeError("Unable to persist Solana address.", error);
      setDashboardNotice(
        "Your wallet address could not be synced to the backend yet. Refresh the page and try again if this persists.",
      );
      setPersistedSolanaAddress(null);
    });
  }, [effectiveSolanaAddress, onPersistSolanaAddress, persistedSolanaAddress, user.solanaAddress]);

  useEffect(() => {
    const bridgeKycLink = user.bridgeKycLink;

    if (!isKycDialogOpen || !bridgeKycLink) {
      setQrCodeDataUrl(null);
      setKycDialogNotice(null);
      return;
    }

    let cancelled = false;

    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(bridgeKycLink, {
          margin: 1,
          width: 280,
        }),
      )
      .then((result: string) => {
        if (!cancelled) {
          setQrCodeDataUrl(result);
          setKycDialogNotice(null);
        }
      })
      .catch((error: unknown) => {
        logRuntimeError("Unable to generate Bridge KYC QR code.", error);
        if (!cancelled) {
          setQrCodeDataUrl(null);
          setKycDialogNotice(
            "We could not generate the QR code. Continue in a new tab on this device instead.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isKycDialogOpen, user.bridgeKycLink]);

  useEffect(() => {
    if (!bridge.showTosAlert) {
      setDismissedTosAlert(false);
    }
  }, [bridge.showTosAlert]);

  useEffect(() => {
    if (!isTosDialogOpen) {
      setTosEmbedError(false);
    }
  }, [isTosDialogOpen]);

  useEffect(() => {
    if (!isTosDialogOpen || !user.bridgeTosLink) {
      return;
    }

    let tosOrigin = "";

    try {
      tosOrigin = new URL(user.bridgeTosLink).origin;
    } catch (error) {
      logRuntimeError("Unable to parse Bridge terms URL.", error);
      setDashboardNotice(
        "The Bridge terms link could not be opened in-app. Use the external link to continue.",
      );
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

  const shellNotice = dashboardNotice ? (
    <InlineNotice variant="warning" title="Action needed">
      {dashboardNotice}
    </InlineNotice>
  ) : null;

  return (
    <AppShell alerts={alerts} notice={shellNotice}>
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-3xl">Balances</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
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

                  if (action.id === "onramp") {
                    return (
                      <Button
                        key={action.id}
                        variant="outline"
                        className="h-auto min-h-16 justify-start rounded-[calc(var(--radius)+4px)] px-4 py-3 text-left"
                        onClick={() => setIsOnrampDrawerOpen(true)}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                          <Icon />
                        </span>
                        <span className="min-w-0 text-base font-medium">{action.label}</span>
                      </Button>
                    );
                  }

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
                    <Button
                      key={action.id}
                      variant="outline"
                      className="h-auto min-h-16 justify-start rounded-[calc(var(--radius)+4px)] px-4 py-3 text-left"
                      onClick={() => setIsOfframpDrawerOpen(true)}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                        <Icon />
                      </span>
                      <span className="min-w-0 text-base font-medium">{action.label}</span>
                    </Button>
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
                <p className="mt-3 text-xs text-muted-foreground">
                  Receive SOL, USDC, or EURC at this Solana address.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="pb-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Recent Activity</CardTitle>
              <Button type="button" variant="ghost" size="sm" asChild>
                <Link to="/transactions">See all</Link>
              </Button>
            </div>
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
            ) : recentTransactions.length === 0 ? (
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
              <TransactionActivityList transactions={recentTransactions} />
            )}
          </CardContent>
        </Card>
      </div>

      {isOnrampDrawerOpen ? (
        <Suspense fallback={null}>
          <LazyOnrampDrawer
            onCreateOnramp={onCreateOnramp}
            onOpenChange={setIsOnrampDrawerOpen}
            open={isOnrampDrawerOpen}
            walletAddress={user.solanaAddress}
          />
        </Suspense>
      ) : null}

      {isOfframpDrawerOpen ? (
        <Suspense fallback={null}>
          <LazyOfframpDrawer
            balances={balances}
            onCreateBankRecipient={onCreateRecipient}
            onCreateOfframp={onCreateOfframp}
            onFetchTransactionContext={onFetchSolanaTransactionContext}
            onOpenChange={setIsOfframpDrawerOpen}
            open={isOfframpDrawerOpen}
            recipients={recipients}
            senderAddress={effectiveSolanaAddress}
          />
        </Suspense>
      ) : null}

      {isSendDrawerOpen ? (
        <Suspense fallback={null}>
          <LazySendDrawer
            balances={balances}
            onCreateWalletRecipient={onCreateRecipient}
            onFetchTransactionContext={onFetchSolanaTransactionContext}
            onOpenChange={setIsSendDrawerOpen}
            open={isSendDrawerOpen}
            recipients={recipients}
            senderAddress={effectiveSolanaAddress}
          />
        </Suspense>
      ) : null}

      <Dialog open={isTosDialogOpen} onOpenChange={setIsTosDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Bridge Terms of Service</DialogTitle>
            <DialogDescription>
              Review and accept the payment partner terms to enable fiat and stablecoin flows.
            </DialogDescription>
          </DialogHeader>
          {user.bridgeTosLink ? (
            <div className="space-y-4">
              {tosEmbedError ? (
                <InlineNotice variant="warning" title="Embedded terms unavailable">
                  This page could not be embedded. Open the terms in a new tab to continue.
                </InlineNotice>
              ) : null}
              <iframe
                title="Bridge Terms of Service"
                src={user.bridgeTosLink}
                className="h-[70vh] w-full rounded-[calc(var(--radius)+2px)] border"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox={TOS_IFRAME_SANDBOX}
                onError={() => {
                  setTosEmbedError(true);
                  setDashboardNotice(
                    "The embedded Bridge terms page could not be loaded. Use the external link to continue.",
                  );
                }}
              />
              <div className="rounded-[calc(var(--radius)+2px)] border border-dashed border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                If the embedded terms page does not load, open it in a new tab and return here after accepting.
              </div>
              <Button type="button" variant="secondary" asChild>
                <a href={user.bridgeTosLink} target="_blank" rel="noopener noreferrer">
                  Open terms in new tab
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
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
            {kycDialogNotice ? (
              <InlineNotice variant="warning" title="QR code unavailable">
                {kycDialogNotice}
              </InlineNotice>
            ) : null}
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

export { TOS_IFRAME_SANDBOX };
export default Dashboard;
