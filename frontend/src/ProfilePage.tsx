import {
  useCurrentUser,
} from "@coinbase/cdp-hooks";
import {
  EnrollMfaModal,
} from "@coinbase/cdp-react/components/EnrollMfaModal";
import {
  ExportWalletModal,
  ExportWalletModalTrigger,
} from "@coinbase/cdp-react/components/ExportWalletModal";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Globe,
  KeyRound,
  Mail,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

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
import InlineNotice from "@/components/ui/inline-notice";
import MfaProtectedActionHint from "@/features/security/MfaProtectedActionHint";
import { getCdpMfaStatus } from "@/features/security/mfa";
import { cn } from "@/lib/utils";
import type { AppUser, BridgeComplianceState } from "@/types";

interface ProfilePageProps {
  bridge: BridgeComplianceState;
  user: AppUser;
  walletAddress: string | null;
  walletSyncError: string | null;
}

type ProfileTabId = "account" | "security";

const PROFILE_TABS: Array<{ description: string; id: ProfileTabId; label: string }> = [
  {
    id: "account",
    label: "Account Information",
    description: "Identity, contact details, and compliance status.",
  },
  {
    id: "security",
    label: "Security",
    description: "MFA enrollment and wallet export controls.",
  },
];

function ProfilePage({ bridge, user, walletAddress, walletSyncError }: ProfilePageProps) {
  const { currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<ProfileTabId>("account");
  const [didEnrollMfa, setDidEnrollMfa] = useState(false);
  const tabGroupId = useId();
  const displayedWalletAddress = walletAddress ?? user.solanaAddress ?? "Wallet pending";
  const displayedKycStatus = bridge.customerStatus ?? user.bridgeKycStatus ?? "not_started";
  const displayedTermsStatus =
    user.bridgeTosStatus ?? (bridge.hasAcceptedTermsOfService ? "approved" : "not_started");
  const shellNotice = walletSyncError ? (
    <InlineNotice variant="warning" title="Wallet sync pending">
      {walletSyncError}
    </InlineNotice>
  ) : null;
  const currentCdpUser = currentUser?.userId === user.cdpUserId ? currentUser : null;
  const mfaStatus = useMemo(
    () => getCdpMfaStatus(currentCdpUser, { didJustEnroll: didEnrollMfa }),
    [currentCdpUser, didEnrollMfa],
  );

  useEffect(() => {
    if (!currentCdpUser && didEnrollMfa) {
      setDidEnrollMfa(false);
      return;
    }

    if (didEnrollMfa && mfaStatus.enrolledMethods.length > 0) {
      setDidEnrollMfa(false);
    }
  }, [currentCdpUser, didEnrollMfa, mfaStatus.enrolledMethods.length]);

  return (
    <AppShell notice={shellNotice}>
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="space-y-2">
              <CardTitle className="text-3xl">Profile</CardTitle>
              <CardDescription>
                Account information, compliance details, and wallet security controls.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div
              role="tablist"
              aria-label="Profile sections"
              className="flex flex-wrap gap-3 rounded-[calc(var(--radius)+6px)] border border-border/70 bg-background/50 p-2"
            >
              {PROFILE_TABS.map(tab => {
                const tabId = `${tabGroupId}-${tab.id}-tab`;
                const panelId = `${tabGroupId}-${tab.id}-panel`;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    id={tabId}
                    type="button"
                    role="tab"
                    aria-controls={panelId}
                    aria-selected={isActive}
                    className={cn(
                      "min-w-[13rem] rounded-[calc(var(--radius)+2px)] px-4 py-3 text-left transition-colors",
                      isActive
                        ? "bg-card text-foreground shadow-[0_12px_30px_-24px_rgba(18,18,18,0.3)]"
                        : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span className="mt-1 block text-xs text-inherit/75">{tab.description}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {activeTab === "account" ? (
          <section
            id={`${tabGroupId}-account-panel`}
            role="tabpanel"
            aria-labelledby={`${tabGroupId}-account-tab`}
            className="grid gap-4 xl:grid-cols-2"
          >
            <Card>
              <CardHeader className="pb-5">
                <div className="space-y-2">
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>Primary details used across your Monra workspace.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <ProfileDetail icon={UserRound} label="Full name">
                  {user.fullName}
                </ProfileDetail>
                <ProfileDetail icon={Building2} label="Account type">
                  {formatAccountType(user.accountType)}
                </ProfileDetail>
                {user.businessName ? (
                  <ProfileDetail icon={Building2} label="Business name">
                    {user.businessName}
                  </ProfileDetail>
                ) : null}
                <ProfileDetail icon={Mail} label="Email">
                  {user.email}
                </ProfileDetail>
                <ProfileDetail icon={Globe} label="Country">
                  {user.countryName}
                </ProfileDetail>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-5">
                <div className="space-y-2">
                  <CardTitle>Wallet & Compliance</CardTitle>
                  <CardDescription>Current treasury wallet address and account access status.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ProfileDetail icon={Wallet} label="Wallet address" valueClassName="font-mono text-sm break-all">
                  {displayedWalletAddress}
                </ProfileDetail>
                <ProfileStatusDetail icon={ShieldCheck} label="KYC status" status={displayedKycStatus} />
                <ProfileStatusDetail
                  icon={ShieldCheck}
                  label="Bridge terms status"
                  status={displayedTermsStatus}
                />
              </CardContent>
            </Card>
          </section>
        ) : (
          <section
            id={`${tabGroupId}-security-panel`}
            role="tabpanel"
            aria-labelledby={`${tabGroupId}-security-tab`}
          >
            <Card>
              <CardHeader className="pb-5">
                <div className="space-y-2">
                  <CardTitle>Security</CardTitle>
                  <CardDescription>
                    Manage MFA enrollment and high-risk wallet export controls for your treasury.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-background/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                          <ShieldCheck className="size-4" />
                        </span>
                        <div className="space-y-2">
                          <p className="font-medium text-foreground">Multi-factor authentication</p>
                          <p className="text-sm text-muted-foreground">{mfaStatus.detail}</p>
                        </div>
                      </div>
                      <Badge variant={mfaStatus.status === "enabled" ? "success" : "secondary"}>
                        {mfaStatus.statusLabel}
                      </Badge>
                    </div>

                    <div className="mt-4 rounded-[calc(var(--radius)+2px)] border border-border/70 bg-card/70 p-4">
                      <p className="text-sm text-muted-foreground">Methods</p>
                      <p className="mt-1 font-medium text-foreground">{mfaStatus.methodSummary}</p>
                    </div>

                    {mfaStatus.canEnroll ? (
                      <div className="mt-4 space-y-3">
                        <EnrollMfaModal onEnrollSuccess={() => setDidEnrollMfa(true)}>
                          <Button type="button" className="min-w-[12rem]">
                            Set up MFA
                          </Button>
                        </EnrollMfaModal>
                        <p className="text-sm text-muted-foreground">
                          Coinbase handles MFA enrollment inside a secure modal and will reuse it
                          for protected wallet actions.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[calc(var(--radius)+2px)] border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                        {mfaStatus.status === "enabled"
                          ? "MFA is active for your CDP account. Protected wallet actions will now require a verification code."
                          : "MFA enrollment is unavailable until methods are enabled for this CDP project."}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[calc(var(--radius)+2px)] border border-[color:color-mix(in_srgb,var(--danger)_20%,white)] bg-[color:color-mix(in_srgb,var(--danger)_6%,white)] p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/75 text-[var(--danger)]">
                        <TriangleAlert className="size-4" />
                      </span>
                      <div className="space-y-2">
                        <p className="font-medium text-foreground">Export private key</p>
                        <p className="text-sm text-muted-foreground">
                          Exported private keys grant full control over wallet funds. Only export
                          when you need to migrate the wallet or take direct custody, and never
                          share the key or store it insecurely.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <ProfileDetail
                    icon={Wallet}
                    label="Wallet address"
                    valueClassName="font-mono text-sm break-all"
                  >
                    {displayedWalletAddress}
                  </ProfileDetail>

                  <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-background/60 p-4">
                    <div className="flex h-full flex-col justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary">
                            <KeyRound className="size-4" />
                          </span>
                          <div>
                            <p className="text-sm text-muted-foreground">Secure export</p>
                            <p className="font-medium text-foreground">Coinbase ExportWalletModal</p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          The private key stays inside Coinbase&apos;s secure iframe flow and never
                          enters app memory.
                        </p>
                      </div>

                      <MfaProtectedActionHint actionLabel="revealing the private key" />

                      {walletAddress ? (
                        <ExportWalletModal address={walletAddress}>
                          <ExportWalletModalTrigger
                            label="Export private key"
                            className="min-w-[12rem]"
                          />
                        </ExportWalletModal>
                      ) : (
                        <div className="space-y-2">
                          <Button type="button" variant="secondary" disabled>
                            Wallet unavailable
                          </Button>
                          <p className="text-sm text-muted-foreground">
                            A Solana wallet address is required before export is available.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function ProfileDetail({
  icon: Icon,
  label,
  children,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-background/60 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 font-medium text-foreground", valueClassName)}>{children}</p>
        </div>
      </div>
    </div>
  );
}

function ProfileStatusDetail({
  icon: Icon,
  label,
  status,
}: {
  icon: LucideIcon;
  label: string;
  status: string;
}) {
  const normalizedStatus = status.toLowerCase();
  const isPositive = normalizedStatus === "active" || normalizedStatus === "approved";

  return (
    <div className="rounded-[calc(var(--radius)+2px)] border border-border/70 bg-background/60 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <Badge variant={isPositive ? "success" : "secondary"} className="mt-2">
            {formatStatusLabel(status)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function formatAccountType(accountType: AppUser["accountType"]) {
  return accountType === "business" ? "Business" : "Individual";
}

function formatStatusLabel(status: string) {
  return status
    .split("_")
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default ProfilePage;
