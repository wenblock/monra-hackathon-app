import { useSendSolanaTransaction } from "@coinbase/cdp-hooks";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronRight, PiggyBank, Wallet } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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
import { useYieldOnchainQuery } from "@/features/yield/use-yield-onchain-query";
import { useYieldPositions } from "@/features/yield/use-yield-positions";
import {
  buildYieldTransaction,
  confirmYieldSignature,
  derivePresetYieldAmount,
  estimateYieldPreviewSharesRaw,
  formatYieldRawAmount,
  parseYieldAmount,
} from "@/features/yield/runtime";
import { logRuntimeError } from "@/lib/log-runtime-error";
import { readErrorMessage } from "@/lib/read-error-message";
import { cn } from "@/lib/utils";
import type { YieldAction, YieldAsset } from "@/types";

const YIELD_ASSET: YieldAsset = "usdc";

function YieldPage() {
  const { user } = useSession();
  const { sendSolanaTransaction } = useSendSolanaTransaction();
  const { showToast } = useToast();
  const snapshotQuery = useDashboardSnapshot(user.cdpUserId);
  const positionsQuery = useYieldPositions(user.cdpUserId);
  const { effectiveSolanaAddress, isPersistingSolanaAddress, persistenceError, storedSolanaAddress } =
    usePersistedSolanaAddress(user.cdpUserId, user.solanaAddress);
  const onchainQuery = useYieldOnchainQuery(effectiveSolanaAddress);
  const confirmYieldMutation = useYieldConfirmMutation({
    userId: user.cdpUserId,
    walletAddress: effectiveSolanaAddress,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<YieldAction>("deposit");
  const [amount, setAmount] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const overview = useMemo(() => {
    if (!positionsQuery.data || !onchainQuery.data) {
      return null;
    }

    return buildYieldOverviewViewModel({
      onchainSnapshot: onchainQuery.data,
      positions: positionsQuery.data,
      valuation: snapshotQuery.data?.valuation,
    });
  }, [onchainQuery.data, positionsQuery.data, snapshotQuery.data?.valuation]);

  const selectedVault = overview?.vaults[0] ?? null;
  const availableRawAmount = selectedVault
    ? activeAction === "deposit"
      ? selectedVault.walletBalanceRaw
      : selectedVault.currentPositionRaw
    : "0";
  const amountValidation = parseYieldAmount(amount, YIELD_ASSET);
  const amountLimitError =
    amountValidation.rawAmount && BigInt(amountValidation.rawAmount) > BigInt(availableRawAmount)
      ? activeAction === "deposit"
        ? `Insufficient ${selectedVault?.label ?? "USDC"} balance for this deposit.`
        : `Amount exceeds the current ${selectedVault?.label ?? "USDC"} position.`
      : null;
  const previewAmountDisplay = useMemo(() => {
    if (!selectedVault || !amountValidation.rawAmount || amountValidation.error || amountLimitError) {
      return null;
    }

    return formatYieldRawAmount(
      estimateYieldPreviewSharesRaw({
        amountRaw: amountValidation.rawAmount,
        asset: YIELD_ASSET,
        conversionRateToSharesRaw: selectedVault.conversionRateToSharesRaw,
      }),
      YIELD_ASSET,
    );
  }, [amountLimitError, amountValidation.error, amountValidation.rawAmount, selectedVault]);

  const positionsErrorMessage = positionsQuery.error
    ? readErrorMessage(positionsQuery.error, "Unable to load tracked Yield positions.")
    : null;
  const onchainErrorMessage = onchainQuery.error
    ? readErrorMessage(onchainQuery.error, "Unable to load yield market data.")
    : null;

  useEffect(() => {
    setSubmitError(null);
  }, [activeAction, amount, isDialogOpen]);

  async function handleSubmit() {
    if (!selectedVault) {
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

    if (amountValidation.error || !amountValidation.normalizedDecimal || !amountValidation.rawAmount) {
      setSubmitError(amountValidation.error ?? "Enter an amount to continue.");
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
        amountRaw: amountValidation.rawAmount,
        asset: YIELD_ASSET,
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
        amount: amountValidation.normalizedDecimal,
        asset: YIELD_ASSET,
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
      setIsDialogOpen(false);
    } catch (error) {
      logRuntimeError("Unable to complete the yield action.", error);
      setSubmitError(readErrorMessage(error, "Unable to complete the yield action."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
          <PanelCard className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                  Jupiter Lend Earn
                </p>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                    Earn interest on your USDC
                  </h1>
                  <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                    Deposit treasury USDC into Jupiter&apos;s Earn vault while keeping tracked principal in Monra.
                  </p>
                </div>
              </div>

              <Link
                to="/transactions"
                preload="intent"
                className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Open transactions
                <ArrowUpRight className="size-4" />
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <SummaryCard label="Your Deposits" value={overview?.totalDepositsUsd ?? "$0.00"} />
              <SummaryCard
                label="Your Earnings"
                value={overview?.totalEarningsUsd ?? "$0.00"}
                tone="positive"
              />
              <SummaryCard
                label="Projected Annual Yield"
                value={overview?.projectedAnnualYieldUsd ?? "$0.00"}
                tone="muted"
              />
            </div>
          </PanelCard>

          <PanelCard className="flex items-center justify-center">
            <div className="max-w-sm space-y-4 text-center xl:text-left">
              <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary xl:mx-0">
                <PiggyBank className="size-7" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">USDC-only vault</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  EURC Yield is no longer available in the active product flow. Existing EURC Yield activity stays in
                  the transaction ledger as history.
                </p>
              </div>
            </div>
          </PanelCard>
        </section>

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

        {positionsErrorMessage ? (
          <InlineNotice title="Yield positions unavailable" variant="warning">
            {positionsErrorMessage}
          </InlineNotice>
        ) : null}

        {onchainErrorMessage ? (
          <InlineNotice title="Yield market data unavailable" variant="warning">
            {onchainErrorMessage}
          </InlineNotice>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2 py-2">
            <span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Earn
            </span>
            <Link
              to="/transactions"
              preload="intent"
              className="px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Transactions
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
            <PiggyBank className="size-4 text-primary" />
            USDC vault only
          </div>
        </div>

        <PanelCard className="overflow-hidden p-0">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_0.7fr_0.9fr_0.9fr_0.9fr_auto] gap-6 border-b border-border px-6 py-4 text-sm text-muted-foreground md:grid">
            <span>Vault</span>
            <span>APY</span>
            <span>Deposited</span>
            <span>Earnings</span>
            <span>TVL</span>
            <span />
          </div>

          <div className="divide-y divide-border">
            {selectedVault ? (
              <VaultRow vault={selectedVault} onOpen={() => setIsDialogOpen(true)} />
            ) : (
              <div className="space-y-4 px-6 py-6">
                <LoadingRow />
              </div>
            )}
          </div>
        </PanelCard>
      </div>

      <YieldVaultDialog
        amount={amount}
        amountError={amountLimitError}
        amountValidationError={amountValidation.error}
        availableRawAmount={availableRawAmount}
        isPersistingSolanaAddress={isPersistingSolanaAddress}
        isSubmitting={isSubmitting || confirmYieldMutation.isPending}
        isWalletReady={Boolean(storedSolanaAddress)}
        onAmountChange={setAmount}
        onClose={() => {
          setAmount("");
          setIsDialogOpen(false);
        }}
        onSelectAction={setActiveAction}
        onSelectPreset={divisor => {
          if (!selectedVault) {
            return;
          }

          setAmount(
            divisor === 1n
              ? activeAction === "deposit"
                ? selectedVault.walletBalanceDisplay.replace(` ${selectedVault.label}`, "")
                : selectedVault.currentPositionDisplay.replace(` ${selectedVault.label}`, "")
              : derivePresetYieldAmount(availableRawAmount, YIELD_ASSET, divisor),
          );
        }}
        onSubmit={() => void handleSubmit()}
        open={isDialogOpen && Boolean(selectedVault)}
        previewAmountDisplay={previewAmountDisplay}
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
  previewAmountDisplay: string | null;
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
      <DialogContent className="max-h-[min(90vh,46rem)] overflow-y-auto border-border bg-card p-0 text-foreground sm:max-w-2xl">
        {input.vault ? (
          <>
            <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <img
                  src={input.vault.iconPath}
                  alt={`${input.vault.label} token icon`}
                  className="size-12 rounded-full bg-background p-1"
                />
                <div className="space-y-1">
                  <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">
                    {input.vault.label} Yield
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Deposit into the Jupiter Earn vault and keep the tracked principal in Monra.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard
                  compact
                  label="Your Earnings"
                  note={
                    input.vault.isUntrackedPosition
                      ? `Current position: ${input.vault.currentPositionDisplay}`
                      : (input.vault.earningsUsd ?? "$0.00")
                  }
                  tone="positive"
                  value={input.vault.earningsDisplay}
                />
                <SummaryCard
                  compact
                  label="Deposited"
                  note={
                    input.vault.isUntrackedPosition
                      ? "Future Monra Yield actions will start tracked principal."
                      : (input.vault.depositedUsd ?? "$0.00")
                  }
                  value={input.vault.depositedDisplay}
                />
              </div>

              <PanelCard className="space-y-0 p-0">
                <MetricLine label="APY" value={input.vault.apyDisplay} valueClassName="text-primary" />
                <MetricLine
                  isLast
                  label="Vault TVL"
                  subvalue={input.vault.tvlUsd}
                  value={input.vault.tvlDisplay}
                />
              </PanelCard>

              <div className="inline-flex w-full items-center rounded-full border border-border bg-secondary p-1">
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

              <PanelCard className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xl font-semibold text-foreground">{actionLabel}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
                      <Wallet className="size-4" />
                      {availabilityLabel}
                    </span>
                    <PresetButton label="HALF" onClick={() => input.onSelectPreset(2n)} />
                    <PresetButton label="MAX" onClick={() => input.onSelectPreset(1n)} />
                  </div>
                </div>

                <div className="grid gap-4 rounded-[1.4rem] border border-border bg-background p-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-end">
                  <div className="inline-flex items-center gap-3 rounded-[1rem] border border-border bg-card px-4 py-3">
                    <img src={input.vault.iconPath} alt="" className="size-8 rounded-full bg-background p-1" />
                    <span className="text-xl font-semibold text-foreground">{input.vault.label}</span>
                  </div>

                  <div className="min-w-0">
                    <input
                      value={input.amount}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-16 w-full bg-transparent text-right text-[clamp(2.2rem,7vw,3.75rem)] font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/55"
                      onChange={event => input.onAmountChange(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>
                    Available {input.selectedAction === "deposit" ? "wallet balance" : "vault position"}:{" "}
                    {availabilityLabel}
                  </span>
                  {input.previewAmountDisplay ? (
                    <span>
                      Estimated {input.selectedAction === "deposit" ? "shares minted" : "shares burned"}:{" "}
                      {input.previewAmountDisplay}
                    </span>
                  ) : null}
                </div>
              </PanelCard>

              <Button
                type="button"
                className="h-12 w-full rounded-xl"
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
  compact?: boolean;
  label: string;
  note?: string;
  tone?: "default" | "muted" | "positive";
  value: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.4rem] border border-border bg-card px-5 py-5",
        input.compact ? "min-h-[8.5rem]" : "min-h-[9.75rem]",
      )}
    >
      <p
        className={cn(
          "text-sm font-medium uppercase tracking-[0.12em]",
          input.tone === "positive"
            ? "text-primary"
            : input.tone === "muted"
              ? "text-muted-foreground"
              : "text-foreground",
        )}
      >
        {input.label}
      </p>
      <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{input.value}</p>
      {input.note ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{input.note}</p> : null}
    </div>
  );
}

function PanelCard(input: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[1.75rem] border border-border bg-card p-6 shadow-sm", input.className)}>
      {input.children}
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
      className="grid w-full gap-4 px-6 py-5 text-left transition-colors hover:bg-secondary/45 md:grid-cols-[minmax(0,1.4fr)_0.7fr_0.9fr_0.9fr_0.9fr_auto] md:items-center"
      onClick={input.onOpen}
    >
      <div className="flex items-center gap-4">
        <img
          src={input.vault.iconPath}
          alt={`${input.vault.label} token icon`}
          className="size-12 rounded-full bg-background p-1"
        />
        <div>
          <p className="text-2xl font-semibold text-foreground">{input.vault.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">Jupiter Earn vault</p>
          {input.vault.trackingBadge ? (
            <p className="mt-1 text-sm text-[color:color-mix(in_srgb,var(--warning)_80%,black)]">
              {input.vault.trackingBadge}
            </p>
          ) : null}
        </div>
      </div>

      <DataCell label="APY" value={input.vault.apyDisplay} valueClassName="text-primary" />
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
      <DataCell label="TVL" value={input.vault.tvlDisplay} secondaryValue={input.vault.tvlUsd ?? "$0.00"} />

      <span className="hidden justify-self-end rounded-full border border-border bg-background p-4 text-muted-foreground md:inline-flex">
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
      <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground md:hidden">{input.label}</p>
      <p className={cn("text-2xl font-semibold text-foreground", input.valueClassName)}>{input.value}</p>
      {input.secondaryValue ? <p className="text-base text-muted-foreground">{input.secondaryValue}</p> : null}
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
    <div className={cn("flex items-start justify-between gap-4 px-5 py-4", !input.isLast && "border-b border-border")}>
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">{input.label}</p>
        {input.subvalue ? <p className="text-sm text-muted-foreground">{input.subvalue}</p> : null}
      </div>
      <p className={cn("text-2xl font-semibold text-foreground", input.valueClassName)}>{input.value}</p>
    </div>
  );
}

function ActionToggle(input: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "flex-1 rounded-full px-4 py-2.5 text-base font-semibold transition-colors",
        input.active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
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
      className="rounded-xl border border-border bg-card px-3 py-1.5 font-semibold text-foreground transition-colors hover:bg-secondary"
      onClick={input.onClick}
    >
      {input.label}
    </button>
  );
}

function LoadingRow() {
  return <div className="h-28 rounded-[1.35rem] bg-secondary/60" />;
}

export default YieldPage;
