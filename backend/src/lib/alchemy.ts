import { createHmac, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";
import {
  SPL_TRANSFER_ASSETS,
  getSplTokenAssetByMintAddress,
  getTransferAssetDecimals,
} from "./assets.js";
import type {
  TransferAsset,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
} from "../types.js";

const ALCHEMY_API_BASE_URL = "https://api.g.alchemy.com";
const ALCHEMY_DASHBOARD_API_BASE_URL = "https://dashboard.alchemy.com/api";
const ALCHEMY_SOLANA_RPC_URL = `https://solana-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`;
const SOLANA_MAINNET_NETWORK = "solana-mainnet";

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
      console.error(`[Alchemy] ${response.status}: ${message}`);
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
  const response = await fetch(
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
  );

  return readAlchemyJson<AlchemyTokenBalancesPayload>(response);
}

async function fetchAlchemyRpc<T>(method: string, params: unknown[]) {
  const response = await fetch(ALCHEMY_SOLANA_RPC_URL, {
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
  });

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
  };
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

  const response = await fetch(`${ALCHEMY_DASHBOARD_API_BASE_URL}/update-webhook-addresses`, {
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
  });

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
