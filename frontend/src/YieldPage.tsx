import { useSendSolanaTransaction } from "@coinbase/cdp-hooks";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ChevronRight,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/AppShell";
import { Button } from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { useDashboardSnapshot } from "@/features/dashboard/use-dashboard-snapshot";
import { usePersistedSolanaAddress } from "@/features/session/use-persisted-solana-address";
import { useSession } from "@/features/session/use-session";
import { buildYieldOverviewViewModel } from "@/features/yield/view-models";
import { useYieldConfirmMutation } from "@/features/yield/use-yield-confirm-mutation";
import { useYieldLedgerSummary } from "@/features/yield/use-yield-ledger-summary";
import { useYieldOnchainQuery } from "@/features/yield/use-yield-onchain-query";
import { useYieldPreviewQuery } from "@/features/yield/use-yield-preview-query";
import {
  buildYieldTransaction,
  confirmYieldSignature,
  derivePresetYieldAmount,
  parseYieldAmount,
} from "@/features/yield/runtime";
import { logRuntimeError } from "@/lib/log-runtime-error";
import { cn } from "@/lib/utils";
import type { YieldAction, YieldAsset } from "@/types";

function YieldPage() {
  const { user } = useSession();
  const { sendSolanaTransaction } = useSendSolanaTransaction();
  const { showToast } = useToast();
  const snapshotQuery = useDashboardSnapshot(user.cdpUserId);
  const ledgerSummaryQuery = useYieldLedgerSummary(user.cdpUserId);
  const { effectiveSolanaAddress, isPersistingSolanaAddress, persistenceError, storedSolanaAddress } =
    usePersistedSolanaAddress(user.cdpUserId, user.solanaAddress);
  const onchainQuery = useYieldOnchainQuery(effectiveSolanaAddress);
  const confirmYieldMutation = useYieldConfirmMutation({
    userId: user.cdpUserId,
    walletAddress: effectiveSolanaAddress,
  });

  const [selectedAsset, setSelectedAsset] = useState<YieldAsset | null>(null);
  const [activeAction, setActiveAction] = useState<YieldAction>("deposit");
  const [amount, setAmount] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const overview = useMemo(() => {
    if (!ledgerSummaryQuery.data || !onchainQuery.data) {
      return null;
    }

    return buildYieldOverviewViewModel({
      ledgerSummary: ledgerSummaryQuery.data.ledgerSummary,
      onchainSnapshot: onchainQuery.data,
      valuation: snapshotQuery.data?.valuation,
    });
  }, [ledgerSummaryQuery.data, onchainQuery.data, snapshotQuery.data?.valuation]);
  const selectedVault =
    selectedAsset && overview ? overview.vaults.find(vault => vault.asset === selectedAsset) ?? null : null;
  const availableRawAmount = selectedVault
    ? activeAction === "deposit"
      ? selectedVault.walletBalanceRaw
      : selectedVault.currentPositionRaw
    : "0";
  const amountValidation = selectedAsset ? parseYieldAmount(amount, selectedAsset) : null;
  const amountLimitError =
    amountValidation?.rawAmount && BigInt(amountValidation.rawAmount) > BigInt(availableRawAmount)
      ? activeAction === "deposit"
        ? `Insufficient ${selectedVault?.label ?? "asset"} balance for this deposit.`
        : `Amount exceeds the current ${selectedVault?.label ?? "asset"} position.`
      : null;
  const previewQuery = useYieldPreviewQuery({
    action: activeAction,
    amountRaw:
      amountValidation?.error || amountLimitError ? null : amountValidation?.rawAmount ?? null,
    asset: selectedAsset ?? "usdc",
    enabled: selectedAsset !== null,
  });

  useEffect(() => {
    setSubmitError(null);
  }, [activeAction, amount, selectedAsset]);

  async function handleSubmit() {
    if (!selectedAsset || !selectedVault) {
      return;
    }

    if (!effectiveSolanaAddress) {
      setSubmitError("Connect your Solana wallet to continue.");
      return;
    }

    if (!storedSolanaAddress) {
      setSubmitError(
        isPersistingSolanaAddress
          ? "Your Solana wallet is still syncing to the backend."
          : "Your Solana wallet must be synced to the backend before Yield actions are enabled.",
      );
      return;
    }

    if (!amountValidation || amountValidation.error) {
      setSubmitError(amountValidation?.error ?? "Enter an amount to continue.");
      return;
    }

    if (amountLimitError) {
      setSubmitError(amountLimitError);
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const preparedTransaction = await buildYieldTransaction({
        action: activeAction,
        amountRaw: amountValidation.rawAmount!,
        asset: selectedAsset,
        walletAddress: effectiveSolanaAddress,
      });
      const submitted = await sendSolanaTransaction({
        network: "solana",
        solanaAccount: effectiveSolanaAddress,
        transaction: preparedTransaction.serializedTransaction,
      });

      await confirmYieldSignature({
        blockhash: preparedTransaction.blockhash,
        lastValidBlockHeight: preparedTransaction.lastValidBlockHeight,
        signature: submitted.transactionSignature,
      });

      await confirmYieldMutation.mutateAsync({
        action: activeAction,
        amount: amountValidation.normalizedDecimal!,
        asset: selectedAsset,
        transactionSignature: submitted.transactionSignature,
      });

      showToast({
        title: activeAction === "deposit" ? "Yield deposit confirmed" : "Yield withdrawal confirmed",
        description: `${amountValidation.normalizedDecimal} ${selectedVault.label} ${
          activeAction === "deposit" ? "moved into" : "withdrawn from"
        } the Jupiter Earn vault.`,
        variant: "success",
      });

      setAmount("");
      setSelectedAsset(null);
    } catch (error) {
      logRuntimeError("Unable to complete the yield action.", error);
      setSubmitError(extractErrorMessage(error, "Unable to complete the yield action."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="rounded-[2rem] border border-[#182234] bg-[#060a11] text-white shadow-[0_42px_120px_-72px_rgba(2,6,23,0.95)]">
        <div className="relative overflow-hidden rounded-[2rem]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(105,132,255,0.24),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(103,255,196,0.10),_transparent_24%),linear-gradient(180deg,_rgba(255,255,255,0.02),_rgba(255,255,255,0))]" />

          <div className="relative space-y-8 px-5 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#8ea0c6]">
                  Jupiter Lend Earn
                </p>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    Earn interest on your stablecoins
                  </h1>
                  <p className="max-w-3xl text-base text-[#97a5c3] sm:text-lg">
                    Passively get yield using Jupiter Lend&apos;s earning vaults for USDC and EURC.
                  </p>
                </div>
              </div>

              <Link
                to="/transactions"
                preload="intent"
                className="inline-flex items-center gap-2 self-start rounded-full border border-[#23304a] bg-white/4 px-4 py-2 text-sm font-medium text-[#d4def7] transition-colors hover:bg-white/7"
              >
                Open transactions
                <ArrowUpRight className="size-4" />
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <SummaryCard
                label="Your Deposits"
                value={overview?.totalDepositsUsd ?? "$0.00"}
                accentClass="text-white"
              />
              <SummaryCard
                label="Your Earnings"
                value={overview?.totalEarningsUsd ?? "$0.00"}
                accentClass="text-[#d6ff7b]"
              />
              <SummaryCard
                label="Projected Annual Yield"
                value={overview?.projectedAnnualYieldUsd ?? "$0.00"}
                accentClass="text-[#9bc4ff]"
              />
            </div>

            {persistenceError ? (
              <InlineNotice title="Wallet sync pending" variant="warning">
                {persistenceError}
              </InlineNotice>
            ) : null}

            {!storedSolanaAddress && !persistenceError ? (
              <InlineNotice title="Preparing wallet" variant="info">
                {isPersistingSolanaAddress
                  ? "Syncing your Solana wallet with the backend before Yield actions are enabled."
                  : "Your Solana wallet must be available before Yield actions can be recorded."}
              </InlineNotice>
            ) : null}

            {ledgerSummaryQuery.error instanceof Error ? (
              <InlineNotice title="Yield ledger unavailable" variant="warning">
                {ledgerSummaryQuery.error.message}
              </InlineNotice>
            ) : null}

            {onchainQuery.error instanceof Error ? (
              <InlineNotice title="Yield market data unavailable" variant="warning">
                {onchainQuery.error.message}
              </InlineNotice>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center rounded-full border border-[#1c2638] bg-[#121a27] p-1">
                <span className="rounded-full bg-[#1e2817] px-5 py-2 text-sm font-semibold text-[#d6ff7b]">
                  Earn
                </span>
                <Link
                  to="/transactions"
                  preload="intent"
                  className="px-5 py-2 text-sm font-medium text-[#8ea0c6] transition-colors hover:text-white"
                >
                  Transactions
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#1c2638] bg-white/4 px-4 py-2 text-sm text-[#8ea0c6]">
                <PiggyBank className="size-4 text-[#d6ff7b]" />
                Stablecoin vaults only
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-[#182235] bg-[#09101a]/90">
              <div className="hidden grid-cols-[minmax(0,1.2fr)_0.7fr_0.95fr_0.95fr_0.95fr_auto] gap-6 border-b border-white/6 px-6 py-4 text-sm text-[#8ea0c6] md:grid">
                <span>Vault</span>
                <span>APY</span>
                <span>Deposited</span>
                <span>Earnings</span>
                <span>TVL</span>
                <span />
              </div>

              <div className="divide-y divide-white/6">
                {overview?.vaults.map(vault => (
                  <VaultRow key={vault.asset} vault={vault} onOpen={() => setSelectedAsset(vault.asset)} />
                )) ?? (
                  <div className="space-y-4 px-6 py-8">
                    <LoadingRow />
                    <LoadingRow />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <YieldVaultDialog
        amount={amount}
        amountError={amountLimitError}
        amountValidationError={amountValidation?.error ?? null}
        availableRawAmount={availableRawAmount}
        isPersistingSolanaAddress={isPersistingSolanaAddress}
        isSubmitting={isSubmitting || confirmYieldMutation.isPending}
        isWalletReady={Boolean(storedSolanaAddress)}
        onAmountChange={setAmount}
        onClose={() => {
          setAmount("");
          setSelectedAsset(null);
        }}
        onSelectAction={setActiveAction}
        onSelectPreset={divisor => {
          if (!selectedAsset) {
            return;
          }

          setAmount(
            divisor === 1n
              ? selectedVault
                ? activeAction === "deposit"
                  ? selectedVault.walletBalanceDisplay.replace(` ${selectedVault.label}`, "")
                  : selectedVault.currentPositionDisplay.replace(` ${selectedVault.label}`, "")
                : ""
              : derivePresetYieldAmount(availableRawAmount, selectedAsset, divisor),
          );
        }}
        onSubmit={() => void handleSubmit()}
        open={selectedVault !== null}
        previewAmountRaw={previewQuery.data?.previewAmountRaw ?? null}
        previewError={previewQuery.error instanceof Error ? previewQuery.error.message : null}
        selectedAction={activeAction}
        submitError={submitError}
        vault={selectedVault}
      />
    </AppShell>
  );
}

function YieldVaultDialog(input: {
  amount: string;
  amountError: string | null;
  amountValidationError: string | null;
  availableRawAmount: string;
  isPersistingSolanaAddress: boolean;
  isSubmitting: boolean;
  isWalletReady: boolean;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onSelectAction: (action: YieldAction) => void;
  onSelectPreset: (divisor: bigint) => void;
  onSubmit: () => void;
  open: boolean;
  previewAmountRaw: string | null;
  previewError: string | null;
  selectedAction: YieldAction;
  submitError: string | null;
  vault: ReturnType<typeof buildYieldOverviewViewModel>["vaults"][number] | null;
}) {
  const actionLabel = input.selectedAction === "deposit" ? "Deposit" : "Withdraw";
  const availabilityLabel =
    input.selectedAction === "deposit"
      ? input.vault?.walletBalanceDisplay ?? "0.00"
      : input.vault?.currentPositionDisplay ?? "0.00";

  return (
    <Dialog open={input.open} onOpenChange={isOpen => !isOpen && input.onClose()}>
      <DialogContent className="w-[min(96vw,52rem)] gap-0 overflow-hidden border-[#202b3d] bg-[#0d131d] p-0 text-white">
        {input.vault ? (
          <>
            <DialogHeader className="border-b border-white/6 px-6 py-5">
              <div className="flex items-start gap-4">
                <img
                  src={input.vault.iconPath}
                  alt={`${input.vault.label} token icon`}
                  className="size-14 rounded-full bg-white/8 p-1"
                />
                <div className="min-w-0 space-y-2">
                  <DialogTitle className="text-4xl font-semibold tracking-tight text-white">
                    {input.vault.label}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-[#8ea0c6]">
                    Manage your Jupiter Earn position and record it in the Monra ledger.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryCard
                  label="Your Earnings"
                  value={input.vault.earningsDisplay}
                  note={input.vault.earningsUsd ?? "$0.00"}
                  accentClass="text-[#d6ff7b]"
                  compact
                />
                <SummaryCard
                  label="Deposited"
                  value={input.vault.depositedDisplay}
                  note={input.vault.depositedUsd ?? "$0.00"}
                  accentClass="text-white"
                  compact
                />
              </div>

              <div className="rounded-[1.5rem] border border-[#1d2740] bg-[#111824] px-5 py-4">
                <MetricLine label="APY" value={input.vault.apyDisplay} valueClassName="text-[#72f0b8]" />
                <MetricLine label="Vault TVL" value={input.vault.tvlDisplay} subvalue={input.vault.tvlUsd} />
                <MetricLine
                  label="Total Supply"
                  value={input.vault.totalSupplyDisplay}
                  isLast
                />
              </div>

              <div className="inline-flex w-full items-center rounded-full border border-[#182235] bg-[#081018] p-1">
                <ActionToggle
                  active={input.selectedAction === "deposit"}
                  label="Deposit"
                  onClick={() => input.onSelectAction("deposit")}
                />
                <ActionToggle
                  active={input.selectedAction === "withdraw"}
                  label="Withdraw"
                  onClick={() => input.onSelectAction("withdraw")}
                />
              </div>

              {input.vault.warning ? (
                <InlineNotice title="Ledger scope" variant="warning">
                  {input.vault.warning}
                </InlineNotice>
              ) : null}

              {input.amountValidationError ? (
                <InlineNotice title={`Check the ${input.selectedAction} amount`} variant="warning">
                  {input.amountValidationError}
                </InlineNotice>
              ) : null}

              {input.amountError ? (
                <InlineNotice title="Amount unavailable" variant="warning">
                  {input.amountError}
                </InlineNotice>
              ) : null}

              {input.submitError ? (
                <InlineNotice title={`${actionLabel} failed`} variant="error">
                  {input.submitError}
                </InlineNotice>
              ) : null}

              <div className="rounded-[1.5rem] border border-[#202b3d] bg-[#1a2230] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-2xl font-semibold text-white">{actionLabel}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[#8ea0c6]">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#2a3548] px-3 py-1.5">
                      <Wallet className="size-4" />
                      {availabilityLabel}
                    </span>
                    <PresetButton label="HALF" onClick={() => input.onSelectPreset(2n)} />
                    <PresetButton label="MAX" onClick={() => input.onSelectPreset(1n)} />
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-4 rounded-[1.25rem] border border-white/6 bg-[#141b28] p-4 md:flex-row md:items-end md:justify-between">
                  <div className="inline-flex items-center gap-3 rounded-[1rem] bg-[#192231] px-4 py-3">
                    <img
                      src={input.vault.iconPath}
                      alt=""
                      className="size-9 rounded-full bg-white/10 p-1"
                    />
                    <span className="text-2xl font-semibold text-white">{input.vault.label}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <input
                      value={input.amount}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-20 w-full bg-transparent text-right text-[clamp(2.4rem,8vw,4.5rem)] font-semibold tracking-tight text-[#dbe7ff] outline-none placeholder:text-[#485368]"
                      onChange={event => input.onAmountChange(event.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[#8ea0c6]">
                  <span>
                    Available {input.selectedAction === "deposit" ? "wallet balance" : "vault position"}:
                    {" "}
                    {availabilityLabel}
                  </span>
                  {input.previewAmountRaw ? (
                    <span>
                      Estimated {input.selectedAction === "deposit" ? "shares minted" : "shares burned"}:
                      {" "}
                      {input.previewAmountRaw}
                    </span>
                  ) : null}
                </div>

                {input.previewError ? (
                  <p className="mt-2 text-sm text-[#ffb4b4]">{input.previewError}</p>
                ) : null}
              </div>

              <Button
                type="button"
                className="h-16 w-full rounded-[1.2rem] bg-[#849c5b] text-lg text-[#0b1016] hover:bg-[#93ae64]"
                disabled={!input.isWalletReady || input.isPersistingSolanaAddress || input.isSubmitting}
                onClick={input.onSubmit}
              >
                {input.isSubmitting ? `${actionLabel}ing...` : actionLabel}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard(input: {
  accentClass: string;
  compact?: boolean;
  label: string;
  note?: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.6rem] border border-[#1b2840] bg-[#0d131d]/88 px-5 py-5",
        input.compact ? "min-h-[9rem]" : "min-h-[10.5rem]",
      )}
    >
      <p className={cn("text-lg", input.accentClass)}>{input.label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-tight text-white">{input.value}</p>
      {input.note ? <p className="mt-2 text-lg text-[#8ea0c6]">{input.note}</p> : null}
    </div>
  );
}

function VaultRow(input: {
  onOpen: () => void;
  vault: ReturnType<typeof buildYieldOverviewViewModel>["vaults"][number];
}) {
  return (
    <button
      type="button"
      className="grid w-full gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.025] md:grid-cols-[minmax(0,1.2fr)_0.7fr_0.95fr_0.95fr_0.95fr_auto] md:items-center"
      onClick={input.onOpen}
    >
      <div className="flex items-center gap-4">
        <img
          src={input.vault.iconPath}
          alt={`${input.vault.label} token icon`}
          className="size-12 rounded-full bg-white/8 p-1"
        />
        <div>
          <p className="text-2xl font-semibold text-white">{input.vault.label}</p>
          <p className="mt-1 text-sm text-[#8ea0c6]">Jupiter Earn vault</p>
        </div>
      </div>

      <DataCell label="APY" value={input.vault.apyDisplay} valueClassName="text-[#72f0b8]" />
      <DataCell
        label="Deposited"
        value={input.vault.depositedDisplay}
        secondaryValue={input.vault.depositedUsd ?? "$0.00"}
      />
      <DataCell
        label="Earnings"
        value={input.vault.earningsDisplay}
        secondaryValue={input.vault.earningsUsd ?? "$0.00"}
      />
      <DataCell
        label="TVL"
        value={formatCompactAsset(input.vault.tvlRaw, input.vault.asset)}
        secondaryValue={input.vault.tvlUsd ?? "$0.00"}
      />

      <span className="hidden justify-self-end rounded-full border border-[#25324b] p-4 text-[#b9c8e6] md:inline-flex">
        <ChevronRight className="size-5" />
      </span>
    </button>
  );
}

function DataCell(input: {
  label: string;
  secondaryValue?: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm uppercase tracking-[0.18em] text-[#6f80a2] md:hidden">{input.label}</p>
      <p className={cn("text-2xl font-semibold text-white", input.valueClassName)}>{input.value}</p>
      {input.secondaryValue ? <p className="text-lg text-[#8ea0c6]">{input.secondaryValue}</p> : null}
    </div>
  );
}

function MetricLine(input: {
  isLast?: boolean;
  label: string;
  subvalue?: string | null;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-3", !input.isLast && "border-b border-white/6")}>
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.18em] text-[#8ea0c6]">{input.label}</p>
        {input.subvalue ? <p className="text-sm text-[#6f80a2]">{input.subvalue}</p> : null}
      </div>
      <p className={cn("text-3xl font-semibold text-white", input.valueClassName)}>{input.value}</p>
    </div>
  );
}

function ActionToggle(input: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "flex-1 rounded-full px-5 py-3 text-lg font-semibold transition-colors",
        input.active ? "bg-[#202915] text-[#d6ff7b]" : "text-[#8ea0c6] hover:text-white",
      )}
      onClick={input.onClick}
    >
      {input.label}
    </button>
  );
}

function PresetButton(input: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-xl border border-[#2a3548] bg-[#202938] px-3 py-1.5 font-semibold text-[#dbe7ff] transition-colors hover:bg-[#293447]"
      onClick={input.onClick}
    >
      {input.label}
    </button>
  );
}

function LoadingRow() {
  return <div className="h-28 rounded-[1.35rem] bg-white/[0.03]" />;
}

function formatCompactAsset(rawAmount: string, asset: YieldAsset) {
  const amount = Number.parseFloat(
    rawAmount.replace(/^0+/, "") ? rawAmount : "0",
  );

  if (!Number.isFinite(amount)) {
    return "0";
  }

  const divisor = asset === "usdc" || asset === "eurc" ? 1_000_000 : 1;
  const formattedAmount = amount / divisor;

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(formattedAmount)} ${asset.toUpperCase()}`;
}

function extractErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export default YieldPage;
