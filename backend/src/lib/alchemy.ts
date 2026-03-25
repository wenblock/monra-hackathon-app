import { createHmac, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";
import { fetchWithRetry } from "./outboundHttp.js";
import { logError, logWarn } from "./logger.js";
import {
  TRANSFER_ASSETS,
  SPL_TRANSFER_ASSETS,
  getSplTokenAssetByMintAddress,
  getTransferAssetDecimals,
} from "./assets.js";
import type {
  TransferAsset,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
  TreasuryValuation,
} from "../types.js";

const ALCHEMY_API_BASE_URL = "https://api.g.alchemy.com";
const ALCHEMY_DASHBOARD_API_BASE_URL = "https://dashboard.alchemy.com/api";
const ALCHEMY_SOLANA_RPC_URL = `https://solana-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`;
const SOLANA_MAINNET_NETWORK = "solana-mainnet";
const TREASURY_PRICE_TTL_MS = 15_000;
const TREASURY_PRICE_MAX_STALE_MS = 120_000;
const PRICE_SYMBOL_BY_ASSET: Record<TransferAsset, string> = {
  sol: "SOL",
  usdc: "USDC",
  eurc: "EURC",
};

interface TreasuryPriceSnapshot {
  pricesUsd: Partial<Record<TransferAsset, string>>;
  lastUpdatedAt: string | null;
  fetchedAt: number;
  expiresAt: number;
}

interface AlchemyTokenBalance {
  network?: string;
  tokenAddress?: string | null;
  tokenBalance?: string | null;
}

interface AlchemyTokenBalancesPayload {
  data?: {
    pageKey?: string | null;
    tokens?: AlchemyTokenBalance[];
  };
}

interface AlchemyPricePoint {
  currency?: string;
  value?: string;
  lastUpdatedAt?: string;
}

interface AlchemyTokenPriceEntry {
  symbol?: string;
  prices?: AlchemyPricePoint[];
  error?: string;
}

interface AlchemyTokenPricesPayload {
  data?: AlchemyTokenPriceEntry[];
}

interface AlchemyLatestBlockhashPayload {
  result?: {
    value?: {
      blockhash?: string | null;
    } | null;
  } | null;
}

interface AlchemyAccountInfoPayload {
  result?: {
    value?: unknown | null;
  } | null;
}

interface AlchemyParsedAccountKey {
  pubkey?: string;
  signer?: boolean;
  writable?: boolean;
}

interface AlchemyParsedInstruction {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
  accounts?: number[];
}

interface AlchemyInnerInstructionSet {
  index?: number;
  instructions?: AlchemyParsedInstruction[];
}

interface AlchemyTokenBalanceInfo {
  accountIndex?: number;
  mint?: string;
  owner?: string;
  uiTokenAmount?: {
    amount?: string;
  };
}

export interface AlchemyParsedTransactionResult {
  blockTime?: number | null;
  meta?: {
    err?: unknown | null;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: AlchemyTokenBalanceInfo[];
    postTokenBalances?: AlchemyTokenBalanceInfo[];
    innerInstructions?: AlchemyInnerInstructionSet[] | null;
  } | null;
  transaction?: {
    message?: {
      accountKeys?: Array<AlchemyParsedAccountKey | string>;
      instructions?: AlchemyParsedInstruction[];
    } | null;
  } | null;
}

interface AlchemyParsedTransactionPayload {
  result?: AlchemyParsedTransactionResult | null;
}

export class AlchemyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AlchemyApiError";
  }
}

let treasuryPriceCache: TreasuryPriceSnapshot | null = null;
let treasuryPriceRefreshInFlight: Promise<TreasuryPriceSnapshot | null> | null = null;

function normalizeRawAmount(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("0x")) {
    return BigInt(trimmed).toString();
  }

  return trimmed;
}

export function formatTokenAmount(rawAmount: string, decimals: number) {
  const isNegative = rawAmount.startsWith("-");
  const unsignedAmount = isNegative ? rawAmount.slice(1) : rawAmount;
  const normalizedAmount = unsignedAmount.replace(/^0+/, "") || "0";

  if (decimals === 0) {
    return `${isNegative ? "-" : ""}${normalizedAmount}`;
  }

  const paddedAmount = normalizedAmount.padStart(decimals + 1, "0");
  const whole = paddedAmount.slice(0, -decimals);
  const fraction = paddedAmount.slice(-decimals).replace(/0+$/, "");

  return `${isNegative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function createEmptyBalance(decimals: number) {
  return {
    formatted: formatTokenAmount("0", decimals),
    raw: "0",
  };
}

function isNativeSolBalance(tokenAddress?: string | null) {
  if (tokenAddress == null) {
    return true;
  }

  const normalizedAddress = tokenAddress.trim().toLowerCase();
  return normalizedAddress === "" || normalizedAddress === "native" || normalizedAddress === "sol";
}

export function createUnavailableTreasuryValuation(
  unavailableAssets: TransferAsset[] = [...TRANSFER_ASSETS],
): TreasuryValuation {
  return {
    liquidTreasuryValueUsd: null,
    yieldInvestedValueUsd: null,
    treasuryValueUsd: null,
    assetValuesUsd: {
      sol: null,
      usdc: null,
      eurc: null,
    },
    pricesUsd: {
      sol: null,
      usdc: null,
      eurc: null,
    },
    lastUpdatedAt: null,
    isStale: true,
    unavailableAssets,
  };
}

async function readAlchemyJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message = extractAlchemyErrorMessage(data, text, response.status);

    if (response.status >= 400 && response.status < 500) {
      logWarn("alchemy.request_failed", {
        responseMessage: message,
        status: response.status,
      });
    }

    throw new AlchemyApiError(message, response.status);
  }

  return data as T;
}

function extractAlchemyErrorMessage(data: unknown, rawText: string, status: number) {
  if (data && typeof data === "object") {
    if ("message" in data && typeof data.message === "string" && data.message.trim().length > 0) {
      return data.message;
    }

    if (
      "error" in data &&
      data.error &&
      typeof data.error === "object" &&
      "message" in data.error &&
      typeof data.error.message === "string" &&
      data.error.message.trim().length > 0
    ) {
      return data.error.message;
    }
  }

  if (rawText.trim().length > 0) {
    return `Alchemy request failed with status ${status}: ${rawText}`;
  }

  return `Alchemy request failed with status ${status}.`;
}

async function fetchAlchemyTokenBalances(address: string, pageKey?: string) {
  const response = await fetchWithRetry(
    `${ALCHEMY_API_BASE_URL}/data/v1/${config.alchemyApiKey}/assets/tokens/balances/by-address`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        addresses: [
          {
            address,
            networks: [SOLANA_MAINNET_NETWORK],
          },
        ],
        ...(pageKey ? { pageKey } : {}),
      }),
    },
    {
      retries: config.outboundRequestRetries,
      timeoutMs: config.outboundRequestTimeoutMs,
    },
  );

  return readAlchemyJson<AlchemyTokenBalancesPayload>(response);
}

async function fetchAlchemyTokenPricesBySymbol(symbols: string[]) {
  const url = new URL(`${ALCHEMY_API_BASE_URL}/prices/v1/${config.alchemyApiKey}/tokens/by-symbol`);

  for (const symbol of symbols) {
    url.searchParams.append("symbols", symbol);
  }

  const response = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
    {
      retries: config.outboundRequestRetries,
      timeoutMs: config.outboundRequestTimeoutMs,
    },
  );

  return readAlchemyJson<AlchemyTokenPricesPayload>(response);
}

async function fetchAlchemyRpc<T>(method: string, params: unknown[]) {
  const response = await fetchWithRetry(
    ALCHEMY_SOLANA_RPC_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${method}-${Date.now()}`,
        method,
        params,
      }),
    },
    {
      retries: config.outboundRequestRetries,
      timeoutMs: config.outboundRequestTimeoutMs,
    },
  );

  const data = await readAlchemyJson<T & { error?: { message?: string } }>(response);

  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new AlchemyApiError(
      typeof data.error.message === "string" && data.error.message.trim().length > 0
        ? data.error.message
        : `Alchemy RPC ${method} failed.`,
      502,
    );
  }

  return data;
}

export async function fetchSolanaBalances(address: string): Promise<SolanaBalancesResponse> {
  let pageKey: string | undefined;
  let foundSol = false;
  const sol = createEmptyBalance(9);
  const tokenBalances = Object.fromEntries(
    SPL_TRANSFER_ASSETS.map(asset => [asset, createEmptyBalance(getTransferAssetDecimals(asset))]),
  ) as Record<Exclude<TransferAsset, "sol">, ReturnType<typeof createEmptyBalance>>;
  const foundTokenAssets = new Set<Exclude<TransferAsset, "sol">>();

  do {
    const payload = await fetchAlchemyTokenBalances(address, pageKey);
    const tokens = Array.isArray(payload.data?.tokens) ? payload.data.tokens : [];

    for (const token of tokens) {
      if (token.network && token.network !== SOLANA_MAINNET_NETWORK) {
        continue;
      }

      const rawBalance =
        typeof token.tokenBalance === "string" && token.tokenBalance.trim().length > 0
          ? normalizeRawAmount(token.tokenBalance)
          : "0";

      const tokenAsset = getSplTokenAssetByMintAddress(token.tokenAddress);
      if (tokenAsset) {
        tokenBalances[tokenAsset].raw = rawBalance;
        tokenBalances[tokenAsset].formatted = formatTokenAmount(
          rawBalance,
          getTransferAssetDecimals(tokenAsset),
        );
        foundTokenAssets.add(tokenAsset);
        continue;
      }

      if (!foundSol && isNativeSolBalance(token.tokenAddress)) {
        sol.raw = rawBalance;
        sol.formatted = formatTokenAmount(rawBalance, 9);
        foundSol = true;
      }
    }

    pageKey =
      typeof payload.data?.pageKey === "string" && payload.data.pageKey.trim().length > 0
        ? payload.data.pageKey
        : undefined;
  } while (pageKey && (!foundSol || foundTokenAssets.size < SPL_TRANSFER_ASSETS.length));

  return {
    balances: {
      ...tokenBalances,
      sol,
    },
    network: "solana-mainnet",
    valuation: createUnavailableTreasuryValuation(),
    yield: {
      positions: {
        usdc: {
          currentPosition: { formatted: "0", raw: "0" },
          earnings: { formatted: "0", raw: "0" },
          status: "none",
          valueUsd: "0.00",
        },
      },
    },
  };
}

async function refreshTreasuryPrices(now: number) {
  if (treasuryPriceRefreshInFlight) {
    return treasuryPriceRefreshInFlight;
  }

  treasuryPriceRefreshInFlight = (async () => {
    try {
      const payload = await fetchAlchemyTokenPricesBySymbol(
        TRANSFER_ASSETS.map(asset => PRICE_SYMBOL_BY_ASSET[asset]),
      );
      const priceEntries = Array.isArray(payload.data) ? payload.data : [];
      const pricesUsd: Partial<Record<TransferAsset, string>> = {};
      let lastUpdatedAt: string | null = null;

      for (const asset of TRANSFER_ASSETS) {
        const symbol = PRICE_SYMBOL_BY_ASSET[asset];
        const entry = priceEntries.find(candidate => candidate.symbol?.trim().toUpperCase() === symbol);
        const usdPrice = entry?.prices?.find(
          price => price.currency?.trim().toLowerCase() === "usd" && typeof price.value === "string",
        );

        if (!usdPrice?.value) {
          continue;
        }

        pricesUsd[asset] = usdPrice.value;

        if (usdPrice.lastUpdatedAt) {
          lastUpdatedAt = getMostRecentTimestamp(lastUpdatedAt, usdPrice.lastUpdatedAt);
        }
      }

      const snapshot: TreasuryPriceSnapshot = {
        pricesUsd,
        lastUpdatedAt,
        fetchedAt: now,
        expiresAt: now + TREASURY_PRICE_TTL_MS,
      };

      treasuryPriceCache = snapshot;
      return snapshot;
    } catch (error) {
      logError("alchemy.treasury_price_refresh_failed", error);
      return null;
    } finally {
      treasuryPriceRefreshInFlight = null;
    }
  })();

  return treasuryPriceRefreshInFlight;
}

export async function getTreasuryPrices(now = Date.now()) {
  if (treasuryPriceCache && now <= treasuryPriceCache.expiresAt) {
    return treasuryPriceCache;
  }

  if (
    treasuryPriceCache &&
    now - treasuryPriceCache.fetchedAt <= TREASURY_PRICE_MAX_STALE_MS
  ) {
    if (!treasuryPriceRefreshInFlight) {
      void refreshTreasuryPrices(now);
    }

    return treasuryPriceCache;
  }

  return refreshTreasuryPrices(now);
}

export function resetTreasuryPriceCacheForTests() {
  treasuryPriceCache = null;
  treasuryPriceRefreshInFlight = null;
}

export function buildTreasuryValuation(
  balances: SolanaBalancesResponse["balances"],
  treasuryPrices: TreasuryPriceSnapshot | null,
  optionsOrNow:
    | {
        yieldInvestedValueUsd?: string | null;
      }
    | number = {},
  nowOverride = Date.now(),
): TreasuryValuation {
  if (!treasuryPrices) {
    return createUnavailableTreasuryValuation();
  }

  const options =
    typeof optionsOrNow === "number"
      ? {}
      : optionsOrNow;
  const now = typeof optionsOrNow === "number" ? optionsOrNow : nowOverride;
  const valuation = createUnavailableTreasuryValuation([]);
  let treasuryTotalUsd = 0;

  for (const asset of TRANSFER_ASSETS) {
    const usdPrice = treasuryPrices.pricesUsd[asset];
    const parsedPrice = usdPrice ? Number.parseFloat(usdPrice) : Number.NaN;
    const parsedBalance = Number.parseFloat(balances[asset].formatted);

    if (!Number.isFinite(parsedPrice) || !Number.isFinite(parsedBalance)) {
      valuation.unavailableAssets.push(asset);
      continue;
    }

    valuation.pricesUsd[asset] = usdPrice ?? null;
    valuation.assetValuesUsd[asset] = formatUsdAmount(parsedBalance * parsedPrice);
    treasuryTotalUsd += parsedBalance * parsedPrice;
  }

  valuation.lastUpdatedAt = treasuryPrices.lastUpdatedAt;
  valuation.isStale = now > treasuryPrices.expiresAt;
  valuation.liquidTreasuryValueUsd =
    valuation.unavailableAssets.length === 0 ? formatUsdAmount(treasuryTotalUsd) : null;
  valuation.yieldInvestedValueUsd = normalizeUsdString(options.yieldInvestedValueUsd ?? "0");

  const parsedLiquidTreasuryValue = valuation.liquidTreasuryValueUsd
    ? Number.parseFloat(valuation.liquidTreasuryValueUsd)
    : Number.NaN;
  const parsedYieldInvestedValue = valuation.yieldInvestedValueUsd
    ? Number.parseFloat(valuation.yieldInvestedValueUsd)
    : Number.NaN;

  valuation.treasuryValueUsd =
    Number.isFinite(parsedLiquidTreasuryValue) && Number.isFinite(parsedYieldInvestedValue)
      ? formatUsdAmount(parsedLiquidTreasuryValue + parsedYieldInvestedValue)
      : null;

  return valuation;
}

export async function fetchLatestSolanaBlockhash() {
  const payload = await fetchAlchemyRpc<AlchemyLatestBlockhashPayload>("getLatestBlockhash", [
    {
      commitment: "confirmed",
    },
  ]);
  const blockhash = payload.result?.value?.blockhash;

  if (typeof blockhash !== "string" || blockhash.trim().length === 0) {
    throw new AlchemyApiError("Alchemy RPC getLatestBlockhash returned no blockhash.", 502);
  }

  return blockhash;
}

export async function fetchSolanaAccountInfo(address: string) {
  const payload = await fetchAlchemyRpc<AlchemyAccountInfoPayload>("getAccountInfo", [
    address,
    {
      commitment: "confirmed",
      encoding: "base64",
    },
  ]);

  return payload.result?.value ?? null;
}

export async function fetchSolanaTransactionContext(input: {
  asset: TransferAsset;
  recipientTokenAccountAddress?: string;
}): Promise<SolanaTransactionContextResponse> {
  const recentBlockhash = await fetchLatestSolanaBlockhash();

  if (input.asset === "sol") {
    return { recentBlockhash };
  }

  if (!input.recipientTokenAccountAddress) {
    throw new AlchemyApiError("Recipient token account address is required for SPL token transfers.", 400);
  }

  const recipientTokenAccountExists =
    (await fetchSolanaAccountInfo(input.recipientTokenAccountAddress)) !== null;

  return {
    recentBlockhash,
    recipientTokenAccountExists,
  };
}

export async function fetchSolanaParsedTransaction(signature: string) {
  const payload = await fetchAlchemyRpc<AlchemyParsedTransactionPayload>("getTransaction", [
    signature,
    {
      commitment: "confirmed",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    },
  ]);

  if (!payload.result) {
    throw new AlchemyApiError(`Alchemy RPC getTransaction returned no transaction for ${signature}.`, 404);
  }

  return payload.result;
}

export function isSolanaTransactionSuccessful(parsedTransaction: AlchemyParsedTransactionResult) {
  return parsedTransaction.meta != null && parsedTransaction.meta.err == null;
}

export async function updateAlchemyWebhookAddresses(input: {
  addressesToAdd?: string[];
  addressesToRemove?: string[];
}) {
  const addressesToAdd = (input.addressesToAdd ?? []).filter(Boolean);
  const addressesToRemove = (input.addressesToRemove ?? []).filter(Boolean);

  if (addressesToAdd.length === 0 && addressesToRemove.length === 0) {
    return;
  }

  const response = await fetchWithRetry(
    `${ALCHEMY_DASHBOARD_API_BASE_URL}/update-webhook-addresses`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Alchemy-Token": config.alchemyWebhookAuthToken,
      },
      body: JSON.stringify({
        webhook_id: config.alchemyWebhookId,
        addresses_to_add: addressesToAdd,
        addresses_to_remove: addressesToRemove,
      }),
    },
    {
      retries: config.outboundRequestRetries,
      timeoutMs: config.outboundRequestTimeoutMs,
    },
  );

  await readAlchemyJson<Record<string, never>>(response);
}

export function validateAlchemyWebhookSignature(rawBody: Buffer, signature: string) {
  const expectedSignature = createHmac("sha256", config.alchemyWebhookSigningKey)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isAlchemyApiError(error: unknown): error is AlchemyApiError {
  return error instanceof AlchemyApiError;
}

export function isSupportedSplTokenMintAddress(value: string | null | undefined) {
  return getSplTokenAssetByMintAddress(value) !== null;
}

function formatUsdAmount(value: number) {
  return value.toFixed(2);
}

function normalizeUsdString(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? formatUsdAmount(parsedValue) : null;
}

function getMostRecentTimestamp(current: string | null, next: string) {
  if (!current) {
    return next;
  }

  return Date.parse(next) > Date.parse(current) ? next : current;
}
