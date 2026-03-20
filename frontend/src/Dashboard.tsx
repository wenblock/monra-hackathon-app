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
import { Skeleton } from "@/components/ui/skeleton";
import {
  TRANSFER_ASSETS,
  getTransferAssetIconPath,
  getTransferAssetLabel,
} from "@/assets";
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
const LazyDepositDrawer = lazy(() => import("@/DepositDrawer"));

const TOS_IFRAME_SANDBOX =
  "allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts";

interface Props {
  balances?: SolanaBalancesResponse["balances"];
  valuation?: SolanaBalancesResponse["valuation"];
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
  valuation,
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
  const [isDepositDrawerOpen, setIsDepositDrawerOpen] = useState(false);
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
  const treasuryValueDisplay = valuation?.treasuryValueUsd
    ? formatUsdCurrency(valuation.treasuryValueUsd)
    : null;
  const treasuryFreshnessLabel = getTreasuryFreshnessLabel(valuation);
  const assetRows = TRANSFER_ASSETS.map(asset => {
    const tokenAmount = balances ? `${balances[asset].formatted} ${getTransferAssetLabel(asset)}` : null;
    const assetValueUsd = valuation?.assetValuesUsd[asset];

    return {
      asset,
      iconPath: getTransferAssetIconPath(asset),
      label: getTransferAssetLabel(asset),
      primaryValue:
        asset === "sol" ? tokenAmount : assetValueUsd ? formatUsdCurrency(assetValueUsd) : tokenAmount,
      secondaryValue:
        asset === "sol" ? (assetValueUsd ? formatUsdCurrency(assetValueUsd) : "Valuation unavailable") : tokenAmount,
    };
  });

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
            <CardHeader className="pb-3">
              <CardTitle className="text-3xl">Treasury Value</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-2">
                {treasuryValueDisplay ? (
                  <p className="text-[clamp(3rem,9vw,5.75rem)] font-semibold tracking-tight text-foreground">
                    {treasuryValueDisplay}
                  </p>
                ) : balances ? (
                  <p className="text-2xl font-medium text-muted-foreground">Unavailable</p>
                ) : (
                  <Skeleton className="h-16 w-72 rounded-full sm:h-20 sm:w-96" />
                )}
                {balances ? (
                  <p
                    className={cn(
                      "text-sm",
                      valuation?.isStale || !treasuryValueDisplay
                        ? "text-muted-foreground"
                        : "text-foreground/70",
                    )}
                  >
                    {treasuryFreshnessLabel}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {quickActions.map(action => {
                  const Icon = action.icon;
                  const isSendAction = action.id === "send";
                  const isDepositAction = action.id === "deposit";
                  const onClick =
                    action.id === "deposit"
                      ? () => setIsDepositDrawerOpen(true)
                      : action.id === "onramp"
                        ? () => setIsOnrampDrawerOpen(true)
                        : action.id === "send"
                          ? () => setIsSendDrawerOpen(true)
                          : () => setIsOfframpDrawerOpen(true);

                  return (
                    <Button
                      key={action.id}
                      type="button"
                      variant={isSendAction ? "default" : "outline"}
                      className={cn(
                        "h-auto min-h-14 justify-start rounded-full px-5 py-4 text-left text-base",
                        isSendAction
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-transparent bg-foreground text-background hover:bg-foreground/92 hover:text-background",
                      )}
                      disabled={isDepositAction && !effectiveSolanaAddress}
                      onClick={onClick}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full",
                          isSendAction ? "bg-white/15" : "bg-white/10",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 text-base font-medium">{action.label}</span>
                    </Button>
                  );
                })}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-2xl font-semibold tracking-tight text-foreground">Your Assets</p>
                  {valuation?.unavailableAssets.length ? (
                    <span className="text-sm text-muted-foreground">Some valuations unavailable</span>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {assetRows.map(row => (
                    <TreasuryAssetRow
                      key={row.asset}
                      iconPath={row.iconPath}
                      label={row.label}
                      loading={!balances}
                      primaryValue={row.primaryValue}
                      secondaryValue={row.secondaryValue}
                    />
                  ))}
                </div>
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

      {isDepositDrawerOpen ? (
        <Suspense fallback={null}>
          <LazyDepositDrawer
            onOpenChange={setIsDepositDrawerOpen}
            open={isDepositDrawerOpen}
            walletAddress={effectiveSolanaAddress}
          />
        </Suspense>
      ) : null}

      {isOnrampDrawerOpen ? (
        <Suspense fallback={null}>
          <LazyOnrampDrawer
            onCreateOnramp={onCreateOnramp}
            onOpenChange={setIsOnrampDrawerOpen}
            open={isOnrampDrawerOpen}
            walletAddress={effectiveSolanaAddress}
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

function TreasuryAssetRow({
  iconPath,
  label,
  loading,
  primaryValue,
  secondaryValue,
}: {
  iconPath: string;
  label: string;
  loading: boolean;
  primaryValue: string | null;
  secondaryValue: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[calc(var(--radius)+4px)] border border-border/70 bg-card/70 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={iconPath}
          alt={`${label} token icon`}
          className="size-12 shrink-0 rounded-full bg-white object-contain p-1.5"
        />
        <div className="min-w-0">
          <p className="text-xl font-medium text-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-4 w-24 rounded-full" />
          ) : secondaryValue ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">{secondaryValue}</p>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {loading ? (
          <Skeleton className="h-6 w-20 rounded-full" />
        ) : (
          <p className="text-xl font-semibold tracking-tight text-foreground">
            {primaryValue ?? "Unavailable"}
          </p>
        )}
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

function formatUsdCurrency(value: string) {
  const parsedValue = Number.parseFloat(value);

  if (!Number.isFinite(parsedValue)) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(parsedValue);
}

function getTreasuryFreshnessLabel(valuation: SolanaBalancesResponse["valuation"] | undefined) {
  if (!valuation || !valuation.lastUpdatedAt) {
    return "Price unavailable";
  }

  const timestampLabel = formatTreasuryTimestamp(valuation.lastUpdatedAt);

  if (valuation.isStale) {
    return timestampLabel ? `Price delayed · Last update ${timestampLabel}` : "Price delayed";
  }

  return timestampLabel ? `Live pricing · Updated ${timestampLabel}` : "Live pricing";
}

function formatTreasuryTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

export { TOS_IFRAME_SANDBOX };
export default Dashboard;
