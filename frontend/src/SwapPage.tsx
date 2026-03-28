import { useSignSolanaTransaction } from "@coinbase/cdp-hooks";
import { ArrowDown, ArrowLeftRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AppShell from "@/AppShell";
import { Button } from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  TRANSFER_ASSETS,
  getTransferAssetDecimals,
  getTransferAssetIconPath,
  getTransferAssetLabel,
} from "@/assets";
import { useDashboardSnapshot } from "@/features/dashboard/use-dashboard-snapshot";
import { useApiClient } from "@/features/session/use-api-client";
import { usePersistedSolanaAddress } from "@/features/session/use-persisted-solana-address";
import { useSession } from "@/features/session/use-session";
import { useExecuteSwapMutation } from "@/features/swaps/use-swap-mutations";
import { logRuntimeError } from "@/lib/log-runtime-error";
import { cn } from "@/lib/utils";
import type { SwapOrderResponse, TransferAsset } from "@/types";

interface LocalSwapOrder extends SwapOrderResponse {
  requestedAmount: string;
  requestedInputAsset: TransferAsset;
  requestedOutputAsset: TransferAsset;
}

const QUOTE_DEBOUNCE_MS = 350;
const QUOTE_POLL_INTERVAL_MS = 4_000;
const QUOTE_STALE_MS = 8_000;

function SwapPage() {
  const client = useApiClient();
  const { user } = useSession();
  const { signSolanaTransaction } = useSignSolanaTransaction();
  const { showToast } = useToast();
  const snapshotQuery = useDashboardSnapshot(user.cdpUserId);
  const executeSwapMutation = useExecuteSwapMutation(user.cdpUserId);
  const { effectiveSolanaAddress, isPersistingSolanaAddress, persistenceError, storedSolanaAddress } =
    usePersistedSolanaAddress(user.cdpUserId, user.solanaAddress);

  const [inputAsset, setInputAsset] = useState<TransferAsset>("usdc");
  const [outputAsset, setOutputAsset] = useState<TransferAsset>("eurc");
  const [inputAmount, setInputAmount] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmittingSwap, setIsSubmittingSwap] = useState(false);

  const balances = snapshotQuery.data?.balances;
  const valuation = snapshotQuery.data?.valuation;
  const amountValidation = validateSwapAmountInput(
    inputAmount,
    inputAsset,
    balances?.[inputAsset].raw ?? null,
  );
  const canRequestQuote = useMemo(
    () =>
      Boolean(storedSolanaAddress) &&
      inputAsset !== outputAsset &&
      amountValidation.rawAmount !== null &&
      amountValidation.error === null,
    [
      amountValidation.error,
      amountValidation.rawAmount,
      inputAsset,
      outputAsset,
      storedSolanaAddress,
    ],
  );
  const quoteState = useSwapQuoteController({
    client,
    enabled: canRequestQuote,
    inputAsset,
    normalizedAmount: amountValidation.normalizedDecimal,
    outputAsset,
    paused: executeSwapMutation.isPending || isSubmittingSwap,
  });
  const swapOrder = quoteState.latestQuote;
  const outputAmountDisplay =
    quoteState.isBlockingPending && !swapOrder
      ? "Calculating..."
      : swapOrder?.quote.outputAmountDecimal ?? (inputAmount ? "0" : "0.0");
  const outputAmountUsd = swapOrder
    ? formatUsdAmount(
        swapOrder.quote.outputAmountDecimal,
        swapOrder.quote.outputAsset,
        valuation?.pricesUsd,
      )
    : null;
  const inputAmountUsd =
    amountValidation.normalizedDecimal && valuation
      ? formatUsdAmount(amountValidation.normalizedDecimal, inputAsset, valuation.pricesUsd)
      : null;
  const isFormDisabled =
    executeSwapMutation.isPending ||
    isSubmittingSwap ||
    inputAsset === outputAsset ||
    !effectiveSolanaAddress;
  const quoteNotice = quoteState.blockingError ?? quoteState.refreshWarning;
  const quoteNoticeTitle = quoteState.blockingError ? "Quote unavailable" : "Refreshing quote";

  useEffect(() => {
    setSubmitError(null);
  }, [inputAmount, inputAsset, outputAsset]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!effectiveSolanaAddress) {
      setSubmitError("Connect your Solana wallet to continue.");
      return;
    }

    if (!storedSolanaAddress) {
      setSubmitError(
        isPersistingSolanaAddress
          ? "Your Solana wallet is still syncing to the backend."
          : "Your Solana wallet must be synced to the backend before swapping.",
      );
      return;
    }

    if (inputAsset === outputAsset) {
      setSubmitError("Select two different assets to swap.");
      return;
    }

    if (amountValidation.error) {
      setSubmitError(amountValidation.error);
      return;
    }

    if (!amountValidation.normalizedDecimal) {
      setSubmitError("Enter the amount you want to swap.");
      return;
    }

    setSubmitError(null);
    setIsSubmittingSwap(true);

    try {
      const activeOrder = await getActiveSwapOrder({
        client,
        inputAsset,
        normalizedAmount: amountValidation.normalizedDecimal,
        outputAsset,
        swapOrder,
      });

      quoteState.applyExternalQuote(activeOrder, {
        inputAsset,
        normalizedAmount: amountValidation.normalizedDecimal,
        outputAsset,
      });

      const signedTransaction = await signSolanaTransaction({
        solanaAccount: effectiveSolanaAddress,
        transaction: activeOrder.transaction,
      });

      const response = await executeSwapMutation.mutateAsync({
        requestId: activeOrder.requestId,
        signedTransaction: signedTransaction.signedTransaction,
      });

      setInputAmount("");
      quoteState.reset();
      showToast({
        title: "Swap complete",
        description: `${formatSwapLeg(response.transaction.amountDisplay, response.transaction.asset)} swapped into ${formatSwapLeg(response.transaction.outputAmountDisplay, response.transaction.outputAsset)}.`,
        variant: "success",
      });
    } catch (error) {
      logRuntimeError("Unable to complete swap.", error);
      setSubmitError(extractErrorMessage(error, "Unable to complete swap."));
    } finally {
      setIsSubmittingSwap(false);
    }
  }

  function handleFlip() {
    setInputAsset(outputAsset);
    setOutputAsset(inputAsset);
    setSubmitError(null);
    quoteState.reset();
  }

  return (
    <AppShell>
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-6">
        <div className="w-full max-w-[34rem] space-y-5">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Swap assets</h1>
            <p className="text-sm text-muted-foreground">
              Convert between SOL, USDC, and EURC directly from the treasury wallet.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="relative rounded-[2rem] border border-border bg-card p-3 shadow-[0_28px_60px_-42px_rgba(18,18,18,0.22)]">
              <SwapPanel
                amount={inputAmount}
                amountUsd={inputAmountUsd}
                asset={inputAsset}
                balanceLabel={balances ? `${balances[inputAsset].formatted} ${getTransferAssetLabel(inputAsset)}` : null}
                label="Sell"
                onAmountChange={setInputAmount}
                onAssetChange={setInputAsset}
                otherAsset={outputAsset}
              />

              <div className="relative z-10 -my-4 flex justify-center">
                <button
                  type="button"
                  className="flex size-16 items-center justify-center rounded-[1.4rem] border border-border bg-background text-foreground shadow-[0_18px_40px_-24px_rgba(18,18,18,0.2)] transition-transform hover:-translate-y-0.5"
                  onClick={handleFlip}
                >
                  <span className="sr-only">Switch swap direction</span>
                  <ArrowDown className="size-6" />
                </button>
              </div>

              <SwapPanel
                amount={outputAmountDisplay}
                amountUsd={outputAmountUsd}
                asset={outputAsset}
                balanceLabel={balances ? `${balances[outputAsset].formatted} ${getTransferAssetLabel(outputAsset)}` : null}
                label="Buy"
                onAssetChange={setOutputAsset}
                otherAsset={inputAsset}
                readOnly
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
                  ? "Syncing your Solana wallet with the backend before swaps are enabled."
                  : "Your Solana wallet must be available before swaps can be quoted."}
              </InlineNotice>
            ) : null}

            {amountValidation.error ? (
              <InlineNotice title="Check the sell amount" variant="warning">
                {amountValidation.error}
              </InlineNotice>
            ) : null}

            {quoteNotice ? (
              <InlineNotice title={quoteNoticeTitle} variant="warning">
                {quoteNotice}
              </InlineNotice>
            ) : null}

            {submitError ? (
              <InlineNotice title="Swap failed" variant="error">
                {submitError}
              </InlineNotice>
            ) : null}

            {snapshotQuery.error instanceof Error ? (
              <InlineNotice title="Balances unavailable" variant="warning">
                {snapshotQuery.error.message}
              </InlineNotice>
            ) : null}

            <Button
              type="submit"
              className="h-14 w-full rounded-[1.75rem] text-lg"
              disabled={isFormDisabled || !swapOrder || quoteState.isBlockingPending}
            >
              {executeSwapMutation.isPending || isSubmittingSwap ? "Swapping..." : "Swap"}
            </Button>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.6rem] border border-border/70 bg-card/60 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {formatRateLabel(swapOrder) ?? "Quote refreshes automatically."}
              </span>
              <span className="inline-flex items-center gap-2 font-medium text-foreground">
                <ArrowLeftRight className="size-4 text-muted-foreground" />
                {quoteState.isRefreshing && swapOrder ? "Refreshing quote..." : formatFeeLabel(swapOrder)}
              </span>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

function useSwapQuoteController(input: {
  client: ReturnType<typeof useApiClient>;
  enabled: boolean;
  inputAsset: TransferAsset;
  normalizedAmount: string | null;
  outputAsset: TransferAsset;
  paused: boolean;
}) {
  const [latestQuote, setLatestQuote] = useState<LocalSwapOrder | null>(null);
  const [blockingError, setBlockingError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [isBlockingPending, setIsBlockingPending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWindowActive, setIsWindowActive] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );
  const requestSequenceRef = useRef(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const lastRequestedKeyRef = useRef<string | null>(null);
  const consecutivePollingFailuresRef = useRef(0);
  const previousWindowActiveRef = useRef(isWindowActive);
  const latestQuoteRef = useRef<LocalSwapOrder | null>(null);
  const requestKey =
    input.enabled && input.normalizedAmount
      ? `${input.inputAsset}:${input.outputAsset}:${input.normalizedAmount}`
      : null;
  useEffect(() => {
    latestQuoteRef.current = latestQuote;
  }, [latestQuote]);

  const requestQuote = useCallback(
    async (mode: "initial" | "poll") => {
      if (!requestKey || !input.normalizedAmount) {
        return null;
      }

      const hasExistingQuote = latestQuoteRef.current !== null;
      const sequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = sequence;

      activeAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      if (mode === "initial" || !hasExistingQuote) {
        setIsBlockingPending(true);
        setBlockingError(null);
        setRefreshWarning(null);
      } else {
        setIsRefreshing(true);
      }

      try {
        const order = await input.client.fetchSwapOrder(
          {
            amount: input.normalizedAmount,
            inputAsset: input.inputAsset,
            outputAsset: input.outputAsset,
          },
          abortController.signal,
        );

        if (sequence !== requestSequenceRef.current) {
          return null;
        }

        const nextQuote = decorateSwapOrder(order, {
          inputAsset: input.inputAsset,
          normalizedAmount: input.normalizedAmount,
          outputAsset: input.outputAsset,
        });

        consecutivePollingFailuresRef.current = 0;
        latestQuoteRef.current = nextQuote;
        setLatestQuote(nextQuote);
        setBlockingError(null);
        setRefreshWarning(null);
        return nextQuote;
      } catch (error) {
        if (isAbortError(error) || sequence !== requestSequenceRef.current) {
          return null;
        }

        logRuntimeError("Unable to preview swap order.", error);
        const message = extractErrorMessage(error, "Unable to preview this swap.");

        if (mode === "poll" && hasExistingQuote) {
          consecutivePollingFailuresRef.current += 1;
          if (consecutivePollingFailuresRef.current >= 2) {
            setRefreshWarning(
              "Refreshing the quote in the background. The last good quote is still shown.",
            );
          }
        } else {
          latestQuoteRef.current = null;
          setLatestQuote(null);
          setBlockingError(message);
        }

        return null;
      } finally {
        if (sequence === requestSequenceRef.current) {
          setIsBlockingPending(false);
          setIsRefreshing(false);
        }
      }
    },
    [
      input.client,
      input.inputAsset,
      input.normalizedAmount,
      input.outputAsset,
      requestKey,
    ],
  );

  useEffect(() => {
    const handleWindowFocus = () => setIsWindowActive(!document.hidden);
    const handleWindowBlur = () => setIsWindowActive(false);
    const handleVisibilityChange = () => setIsWindowActive(!document.hidden && document.hasFocus());

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(
    () => () => {
      if (pollingIntervalRef.current !== null) {
        window.clearInterval(pollingIntervalRef.current);
      }
      activeAbortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!requestKey) {
      activeAbortControllerRef.current?.abort();
      setLatestQuote(null);
      setBlockingError(null);
      setRefreshWarning(null);
      setIsBlockingPending(false);
      setIsRefreshing(false);
      lastRequestedKeyRef.current = null;
      consecutivePollingFailuresRef.current = 0;
      return;
    }

    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (lastRequestedKeyRef.current !== requestKey) {
      activeAbortControllerRef.current?.abort();
      setLatestQuote(null);
      setBlockingError(null);
      setRefreshWarning(null);
      setIsBlockingPending(false);
      setIsRefreshing(false);
      consecutivePollingFailuresRef.current = 0;
      lastRequestedKeyRef.current = requestKey;
    }

    const timeoutId = window.setTimeout(() => {
      void requestQuote("initial");
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [requestKey, requestQuote]);

  useEffect(() => {
    if (!requestKey || !latestQuote || input.paused || !isWindowActive) {
      if (pollingIntervalRef.current !== null) {
        window.clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = window.setInterval(() => {
      void requestQuote("poll");
    }, QUOTE_POLL_INTERVAL_MS);

    return () => {
      if (pollingIntervalRef.current !== null) {
        window.clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [input.paused, isWindowActive, latestQuote, requestKey, requestQuote]);

  useEffect(() => {
    const resumedWindow = isWindowActive && !previousWindowActiveRef.current;
    previousWindowActiveRef.current = isWindowActive;

    if (!requestKey || input.paused || !latestQuote || !resumedWindow) {
      return;
    }

    void requestQuote("poll");
  }, [input.paused, isWindowActive, latestQuote, requestKey, requestQuote]);

  function reset() {
    activeAbortControllerRef.current?.abort();
    latestQuoteRef.current = null;
    setLatestQuote(null);
    setBlockingError(null);
    setRefreshWarning(null);
    setIsBlockingPending(false);
    setIsRefreshing(false);
    consecutivePollingFailuresRef.current = 0;
    lastRequestedKeyRef.current = null;
  }

  function applyExternalQuote(
    order: SwapOrderResponse | LocalSwapOrder,
    params: {
      inputAsset: TransferAsset;
      normalizedAmount: string;
      outputAsset: TransferAsset;
    },
  ) {
    const decoratedOrder = decorateSwapOrder(order, params);

    latestQuoteRef.current = decoratedOrder;
    setLatestQuote(decoratedOrder);
    setBlockingError(null);
    setRefreshWarning(null);
    setIsBlockingPending(false);
    setIsRefreshing(false);
    consecutivePollingFailuresRef.current = 0;
    lastRequestedKeyRef.current = `${params.inputAsset}:${params.outputAsset}:${params.normalizedAmount}`;
  }

  return {
    applyExternalQuote,
    blockingError,
    isBlockingPending,
    isRefreshing,
    latestQuote,
    refreshWarning,
    reset,
  };
}

function decorateSwapOrder(
  order: SwapOrderResponse | LocalSwapOrder,
  params: {
    inputAsset: TransferAsset;
    normalizedAmount: string;
    outputAsset: TransferAsset;
  },
) {
  return {
    ...order,
    requestedAmount: params.normalizedAmount,
    requestedInputAsset: params.inputAsset,
    requestedOutputAsset: params.outputAsset,
  } satisfies LocalSwapOrder;
}

function SwapPanel({
  amount,
  amountUsd,
  asset,
  balanceLabel,
  label,
  onAmountChange,
  onAssetChange,
  otherAsset,
  readOnly = false,
}: {
  amount: string;
  amountUsd: string | null;
  asset: TransferAsset;
  balanceLabel: string | null;
  label: string;
  onAmountChange?: (nextValue: string) => void;
  onAssetChange: (nextAsset: TransferAsset) => void;
  otherAsset: TransferAsset;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-[1.7rem] border border-border bg-background p-6 text-foreground">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {readOnly ? (
            <div
              className={cn(
                "mt-3 min-h-[4rem] text-[clamp(2rem,7vw,4rem)] font-semibold tracking-tight text-foreground",
                amount === "Calculating..." && "text-3xl text-muted-foreground",
              )}
            >
              {amount}
            </div>
          ) : (
            <input
              value={amount}
              inputMode="decimal"
              placeholder="0.0"
              className="mt-3 h-16 w-full bg-transparent text-[clamp(2rem,7vw,4rem)] font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40"
              onChange={event => onAmountChange?.(event.target.value)}
            />
          )}
          <p className="mt-2 text-sm text-muted-foreground">{amountUsd ?? "USD value updates with the quote."}</p>
        </div>

        <div className="min-w-[11rem]">
          <AssetSelect asset={asset} onAssetChange={onAssetChange} otherAsset={otherAsset} />
          <p className="mt-4 text-right text-sm text-muted-foreground">
            {balanceLabel ? `Balance ${balanceLabel}` : "Balance unavailable"}
          </p>
        </div>
      </div>
    </div>
  );
}

function AssetSelect({
  asset,
  onAssetChange,
  otherAsset,
}: {
  asset: TransferAsset;
  onAssetChange: (nextAsset: TransferAsset) => void;
  otherAsset: TransferAsset;
}) {
  return (
    <Select value={asset} onValueChange={nextValue => onAssetChange(nextValue as TransferAsset)}>
      <SelectTrigger className="h-14 rounded-full border-border bg-card px-3 text-foreground hover:bg-secondary focus:ring-border [&_svg]:text-muted-foreground">
        <div className="flex items-center gap-3">
          <img
            src={getTransferAssetIconPath(asset)}
            alt={`${getTransferAssetLabel(asset)} token icon`}
            className="size-9 rounded-full bg-white p-1"
          />
          <span className="text-lg font-semibold">{getTransferAssetLabel(asset)}</span>
        </div>
      </SelectTrigger>
      <SelectContent className="min-w-[12rem]">
        {TRANSFER_ASSETS.map(nextAsset => (
          <SelectItem key={nextAsset} value={nextAsset} disabled={nextAsset === otherAsset}>
            <div className="flex items-center gap-3">
              <img
                src={getTransferAssetIconPath(nextAsset)}
                alt=""
                className="size-6 rounded-full bg-white p-0.5"
              />
              <span>{getTransferAssetLabel(nextAsset)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

async function getActiveSwapOrder(input: {
  client: ReturnType<typeof useApiClient>;
  inputAsset: TransferAsset;
  normalizedAmount: string;
  outputAsset: TransferAsset;
  swapOrder: LocalSwapOrder | null;
}) {
  if (
    input.swapOrder &&
    !isSwapOrderStale(input.swapOrder) &&
    input.swapOrder.requestedAmount === input.normalizedAmount &&
    input.swapOrder.requestedInputAsset === input.inputAsset &&
    input.swapOrder.requestedOutputAsset === input.outputAsset
  ) {
    return input.swapOrder;
  }

  return input.client.fetchSwapOrder({
    amount: input.normalizedAmount,
    inputAsset: input.inputAsset,
    outputAsset: input.outputAsset,
  });
}

function validateSwapAmountInput(
  value: string,
  asset: TransferAsset,
  balanceRaw: string | null,
) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return {
      error: null,
      normalizedDecimal: null,
      rawAmount: null,
    };
  }

  const decimals = getTransferAssetDecimals(asset);
  const amountPattern = new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`);

  if (!amountPattern.test(trimmedValue)) {
    return {
      error: `Enter a valid ${getTransferAssetLabel(asset)} amount with up to ${decimals} decimal places.`,
      normalizedDecimal: null,
      rawAmount: null,
    };
  }

  const [wholePart, fractionPart = ""] = trimmedValue.split(".");
  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const normalizedDecimal = normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
  const rawAmount = BigInt(`${normalizedWhole}${fractionPart.padEnd(decimals, "0")}` || "0").toString();

  if (BigInt(rawAmount) <= 0n) {
    return {
      error: "Amount must be greater than zero.",
      normalizedDecimal: null,
      rawAmount: null,
    };
  }

  if (balanceRaw !== null && BigInt(rawAmount) > BigInt(balanceRaw)) {
    return {
      error: `Insufficient ${getTransferAssetLabel(asset)} balance for this swap.`,
      normalizedDecimal,
      rawAmount,
    };
  }

  return {
    error: null,
    normalizedDecimal,
    rawAmount,
  };
}

function isSwapOrderStale(order: LocalSwapOrder) {
  const quotedAt = Date.parse(order.quotedAt);

  if (!Number.isFinite(quotedAt)) {
    return true;
  }

  return Date.now() - quotedAt > QUOTE_STALE_MS;
}

function formatFeeLabel(order: LocalSwapOrder | null) {
  const feeBps = order?.quote.feeBps;

  if (feeBps !== null && feeBps !== undefined) {
    return `Fee ${(feeBps / 100).toFixed(2)}%`;
  }

  return "Fee included";
}

function formatRateLabel(order: LocalSwapOrder | null) {
  if (!order) {
    return null;
  }

  const inputAmount = Number.parseFloat(order.quote.inputAmountDecimal);
  const outputAmount = Number.parseFloat(order.quote.outputAmountDecimal);

  if (
    !Number.isFinite(inputAmount) ||
    !Number.isFinite(outputAmount) ||
    inputAmount <= 0 ||
    outputAmount <= 0
  ) {
    return null;
  }

  const inputPerOutput = inputAmount / outputAmount;
  const quote = order.quote;

  return `1 ${getTransferAssetLabel(quote.outputAsset)} = ${inputPerOutput.toFixed(6)} ${getTransferAssetLabel(quote.inputAsset)}`;
}

function formatUsdAmount(
  amountDecimal: string,
  asset: TransferAsset,
  pricesUsd: Record<TransferAsset, string | null> | undefined,
) {
  const amount = Number.parseFloat(amountDecimal);
  const price = Number.parseFloat(pricesUsd?.[asset] ?? "");

  if (!Number.isFinite(amount) || !Number.isFinite(price)) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(amount * price);
}

function formatSwapLeg(amount: string | null, asset: TransferAsset | null) {
  if (!amount || !asset) {
    return "the quoted output";
  }

  return `${amount} ${getTransferAssetLabel(asset)}`;
}

function extractErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default SwapPage;
