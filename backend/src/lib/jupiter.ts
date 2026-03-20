import { config } from "../config.js";
import type { TransferAsset } from "../types.js";

const ORDER_CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedSwapOrder {
  createdAt: number;
  inputAsset: TransferAsset;
  inputAmountRaw: string;
  outputAsset: TransferAsset;
  outputAmountRaw: string;
  userId: number;
  walletAddress: string;
}

interface JupiterOrderApiResponse {
  feeBps?: number;
  feeMint?: string;
  mode?: string;
  outAmount?: string;
  requestId?: string;
  router?: string;
  transaction?: string | null;
}

interface JupiterExecuteApiResponse {
  code?: number;
  error?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
  signature?: string;
  status?: "Failed" | "Success";
}

export interface JupiterSwapOrder {
  feeBps: number | null;
  feeMint: string | null;
  mode: string | null;
  outAmount: string;
  requestId: string;
  router: string | null;
  transaction: string;
}

export interface JupiterSwapExecution {
  code: number;
  error: string | null;
  inputAmountResult: string | null;
  outputAmountResult: string | null;
  signature: string | null;
  status: "Failed" | "Success";
}

export class JupiterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "JupiterApiError";
  }
}

const swapOrderCache = new Map<string, CachedSwapOrder>();

export async function getJupiterSwapOrder(input: {
  amount: string;
  inputMint: string;
  outputMint: string;
  taker: string;
}) {
  const response = await fetch(
    `${config.jupiterApiBaseUrl}/order?${new URLSearchParams({
      amount: input.amount,
      inputMint: input.inputMint,
      outputMint: input.outputMint,
      taker: input.taker,
    }).toString()}`,
    {
      headers: buildJupiterHeaders(),
    },
  );

  const payload = await readJupiterJson<JupiterOrderApiResponse>(response);

  if (!payload.requestId || !payload.transaction || !payload.outAmount) {
    throw new JupiterApiError("Jupiter order response was missing required fields.", 502);
  }

  return {
    feeBps: typeof payload.feeBps === "number" ? payload.feeBps : null,
    feeMint: typeof payload.feeMint === "string" ? payload.feeMint : null,
    mode: typeof payload.mode === "string" ? payload.mode : null,
    outAmount: payload.outAmount,
    requestId: payload.requestId,
    router: typeof payload.router === "string" ? payload.router : null,
    transaction: payload.transaction,
  } satisfies JupiterSwapOrder;
}

export async function executeJupiterSwap(input: { requestId: string; signedTransaction: string }) {
  const response = await fetch(`${config.jupiterApiBaseUrl}/execute`, {
    method: "POST",
    headers: {
      ...buildJupiterHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await readJupiterJson<JupiterExecuteApiResponse>(response);

  return {
    code: typeof payload.code === "number" ? payload.code : -1001,
    error: typeof payload.error === "string" ? payload.error : null,
    inputAmountResult:
      typeof payload.inputAmountResult === "string" ? payload.inputAmountResult : null,
    outputAmountResult:
      typeof payload.outputAmountResult === "string" ? payload.outputAmountResult : null,
    signature: typeof payload.signature === "string" ? payload.signature : null,
    status: payload.status === "Success" ? "Success" : "Failed",
  } satisfies JupiterSwapExecution;
}

export function rememberSwapOrder(
  requestId: string,
  order: Omit<CachedSwapOrder, "createdAt">,
) {
  pruneExpiredSwapOrders(Date.now());
  swapOrderCache.set(requestId, {
    ...order,
    createdAt: Date.now(),
  });
}

export function getCachedSwapOrder(requestId: string, now = Date.now()) {
  pruneExpiredSwapOrders(now);
  return swapOrderCache.get(requestId) ?? null;
}

export function clearCachedSwapOrdersForTests() {
  swapOrderCache.clear();
}

function buildJupiterHeaders() {
  if (!config.jupiterApiKey) {
    throw new JupiterApiError("Jupiter API key is not configured.", 500);
  }

  return {
    "x-api-key": config.jupiterApiKey,
  };
}

async function readJupiterJson<T>(response: Response) {
  const text = await response.text();
  const payload = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const message =
      extractJupiterErrorMessage(payload) ??
      (response.statusText || "Jupiter request failed.");
    throw new JupiterApiError(message, response.status);
  }

  return payload as T;
}

function extractJupiterErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error;
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }

  return null;
}

function pruneExpiredSwapOrders(now: number) {
  for (const [requestId, order] of swapOrderCache.entries()) {
    if (now - order.createdAt > ORDER_CACHE_TTL_MS) {
      swapOrderCache.delete(requestId);
    }
  }
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
