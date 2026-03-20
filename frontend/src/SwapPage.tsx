import { useSignSolanaTransaction } from "@coinbase/cdp-hooks";
import { ArrowDown, ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";

import AppShell from "@/AppShell";
import { useDashboardSnapshot } from "@/features/dashboard/use-dashboard-snapshot";
import { usePersistedSolanaAddress } from "@/features/session/use-persisted-solana-address";
import { useSession } from "@/features/session/use-session";
import { useExecuteSwapMutation } from "@/features/swaps/use-swap-mutations";
import { Button } from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import {
  TRANSFER_ASSETS,
  getTransferAssetDecimals,
  getTransferAssetIconPath,
  getTransferAssetLabel,
} from "@/assets";
import { useApiClient } from "@/features/session/use-api-client";
import { logRuntimeError } from "@/lib/log-runtime-error";
import { cn } from "@/lib/utils";
import type { SwapOrderResponse, TransferAsset } from "@/types";

interface LocalSwapOrder extends SwapOrderResponse {
  requestedAmount: string;
  requestedInputAsset: TransferAsset;
  requestedOutputAsset: TransferAsset;
}

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
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [swapOrder, setSwapOrder] = useState<LocalSwapOrder | null>(null);
  const [isQuotePending, setIsQuotePending] = useState(false);

  const balances = snapshotQuery.data?.balances;
  const valuation = snapshotQuery.data?.valuation;
  const amountValidation = validateSwapAmountInput(
    inputAmount,
    inputAsset,
    balances?.[inputAsset].raw ?? null,
  );
  const outputAmountDisplay = isQuotePending
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
    executeSwapMutation.isPending || inputAsset === outputAsset || !effectiveSolanaAddress;
  const canRequestQuote =
    Boolean(storedSolanaAddress) &&
    inputAsset !== outputAsset &&
    amountValidation.rawAmount !== null &&
    amountValidation.error === null;

  useEffect(() => {
    if (!canRequestQuote) {
      setIsQuotePending(false);
      setQuoteError(null);
      setSwapOrder(null);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsQuotePending(true);
      setQuoteError(null);

      void client
        .fetchSwapOrder(
          {
            amount: amountValidation.normalizedDecimal!,
            inputAsset,
            outputAsset,
          },
          abortController.signal,
        )
        .then(order => {
          setSwapOrder({
            ...order,
            requestedAmount: amountValidation.normalizedDecimal!,
            requestedInputAsset: inputAsset,
            requestedOutputAsset: outputAsset,
          });
        })
        .catch(error => {
          if (isAbortError(error)) {
            return;
          }

          logRuntimeError("Unable to preview swap order.", error);
          setSwapOrder(null);
          setQuoteError(extractErrorMessage(error, "Unable to preview this swap."));
        })
        .finally(() => {
          if (!abortController.signal.aborted) {
            setIsQuotePending(false);
          }
        });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [
    amountValidation.error,
    amountValidation.normalizedDecimal,
    canRequestQuote,
    client,
    inputAsset,
    outputAsset,
  ]);

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

    try {
      const activeOrder = await getActiveSwapOrder({
        client,
        inputAsset,
        normalizedAmount: amountValidation.normalizedDecimal,
        outputAsset,
        swapOrder,
      });

      setSwapOrder({
        ...activeOrder,
        requestedAmount: amountValidation.normalizedDecimal,
        requestedInputAsset: inputAsset,
        requestedOutputAsset: outputAsset,
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
      setQuoteError(null);
      setSwapOrder(null);
      showToast({
        title: "Swap complete",
        description: `${formatSwapLeg(response.transaction.amountDisplay, response.transaction.asset)} swapped into ${formatSwapLeg(response.transaction.outputAmountDisplay, response.transaction.outputAsset)}.`,
        variant: "success",
      });
    } catch (error) {
      logRuntimeError("Unable to complete swap.", error);
      setSubmitError(extractErrorMessage(error, "Unable to complete swap."));
    }
  }

  function handleFlip() {
    setInputAsset(outputAsset);
    setOutputAsset(inputAsset);
    setQuoteError(null);
    setSubmitError(null);
    setSwapOrder(null);
  }

  return (
    <AppShell>
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-6">
        <div className="w-full max-w-[34rem] space-y-5">
          <div className="space-y-2 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Jupiter Swap
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Swap assets</h1>
            <p className="text-sm text-muted-foreground">
              Convert between SOL, USDC, and EURC directly from the treasury wallet.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="relative rounded-[2rem] border border-border/60 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_45%),linear-gradient(180deg,#111316_0%,#17191d_100%)] p-3 shadow-[0_36px_80px_-48px_rgba(18,18,18,0.85)]">
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
                  className="flex size-16 items-center justify-center rounded-[1.4rem] border border-white/8 bg-[#1b1d21] text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.75)] transition-transform hover:-translate-y-0.5"
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

            {quoteError ? (
              <InlineNotice title="Quote unavailable" variant="warning">
                {quoteError}
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
              disabled={isFormDisabled || !swapOrder || isQuotePending}
            >
              {executeSwapMutation.isPending ? "Swapping..." : "Swap"}
            </Button>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.6rem] border border-border/70 bg-card/60 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {formatRateLabel(swapOrder) ?? "Quote refreshes automatically."}
              </span>
              <span className="inline-flex items-center gap-2 font-medium text-foreground">
                <ArrowLeftRight className="size-4 text-muted-foreground" />
                {formatFeeLabel(swapOrder)}
              </span>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
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
    <div className="rounded-[1.7rem] border border-white/8 bg-black/18 p-6 text-white backdrop-blur-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/72">{label}</p>
          {readOnly ? (
            <div
              className={cn(
                "mt-3 min-h-[4rem] text-[clamp(2rem,7vw,4rem)] font-semibold tracking-tight text-white",
                amount === "Calculating..." && "text-3xl text-white/60",
              )}
            >
              {amount}
            </div>
          ) : (
            <input
              value={amount}
              inputMode="decimal"
              placeholder="0.0"
              className="mt-3 h-16 w-full bg-transparent text-[clamp(2rem,7vw,4rem)] font-semibold tracking-tight text-white outline-none placeholder:text-white/25"
              onChange={event => onAmountChange?.(event.target.value)}
            />
          )}
          <p className="mt-2 text-sm text-white/55">{amountUsd ?? "USD value updates with the quote."}</p>
        </div>

        <div className="min-w-[11rem]">
          <AssetSelect asset={asset} onAssetChange={onAssetChange} otherAsset={otherAsset} />
          <p className="mt-4 text-right text-sm text-white/55">
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
      <SelectTrigger className="h-14 rounded-full border-white/10 bg-white/6 px-3 text-white hover:bg-white/8 focus:ring-white/10 [&_svg]:text-white/60">
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

  return Date.now() - quotedAt > 15_000;
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

  if (!Number.isFinite(inputAmount) || !Number.isFinite(outputAmount) || inputAmount <= 0 || outputAmount <= 0) {
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
