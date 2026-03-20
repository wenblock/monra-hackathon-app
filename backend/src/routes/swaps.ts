import { Router } from "express";
import { z } from "zod";

import { validateAccessToken } from "../auth/validateAccessToken.js";
import {
  createConfirmedSwapTransaction,
  getUserByCdpUserId,
  listTransactionsByUserIdPaginated,
} from "../db.js";
import { buildTreasuryValuation, getTreasuryPrices } from "../lib/alchemy.js";
import {
  getTransferAssetDecimals,
  getTransferAssetMintAddress,
  getTransferAssetLabel,
} from "../lib/assets.js";
import {
  executeJupiterSwap,
  getCachedSwapOrder,
  getJupiterSwapOrder,
  JupiterApiError,
  rememberSwapOrder,
} from "../lib/jupiter.js";
import { sendError } from "../lib/http.js";
import { broadcastTransactionSnapshot } from "../lib/transactionStream.js";
import type { TransferAsset } from "../types.js";

const createSwapOrderSchema = z.object({
  accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
  amount: z.string().trim().min(1, "Amount is required."),
  inputAsset: z.enum(["sol", "usdc", "eurc"]),
  outputAsset: z.enum(["sol", "usdc", "eurc"]),
});

const executeSwapSchema = z.object({
  accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
  requestId: z.string().trim().min(1, "Request id is required."),
  signedTransaction: z.string().trim().min(1, "Signed transaction is required."),
});

export const swapsRouter = Router();

swapsRouter.post("/order", async (request, response) => {
  try {
    const parsedBody = createSwapOrderSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    if (parsedBody.data.inputAsset === parsedBody.data.outputAsset) {
      return sendError(response, 400, "Select two different assets to swap.");
    }

    const normalizedAmount = normalizeSwapAmount(parsedBody.data.amount, parsedBody.data.inputAsset);
    const identity = await validateAccessToken(parsedBody.data.accessToken);
    const existingUser = await getUserByCdpUserId(identity.cdpUserId);

    if (!existingUser) {
      return sendError(response, 404, "Monra user not found.");
    }

    if (!existingUser.solanaAddress) {
      return sendError(response, 409, "Your Solana wallet is still syncing. Try again in a moment.");
    }

    const order = await getJupiterSwapOrder({
      amount: normalizedAmount.raw,
      inputMint: getTransferAssetMintAddress(parsedBody.data.inputAsset),
      outputMint: getTransferAssetMintAddress(parsedBody.data.outputAsset),
      taker: existingUser.solanaAddress,
    });

    rememberSwapOrder(order.requestId, {
      inputAmountRaw: normalizedAmount.raw,
      inputAsset: parsedBody.data.inputAsset,
      outputAmountRaw: order.outAmount,
      outputAsset: parsedBody.data.outputAsset,
      userId: existingUser.id,
      walletAddress: existingUser.solanaAddress,
    });

    return response.json({
      requestId: order.requestId,
      quotedAt: new Date().toISOString(),
      quote: {
        feeBps: order.feeBps,
        feeMint: order.feeMint,
        inputAmountDecimal: normalizedAmount.decimal,
        inputAmountRaw: normalizedAmount.raw,
        inputAsset: parsedBody.data.inputAsset,
        mode: order.mode,
        outputAmountDecimal: formatAssetAmount(order.outAmount, parsedBody.data.outputAsset),
        outputAmountRaw: order.outAmount,
        outputAsset: parsedBody.data.outputAsset,
        router: order.router,
      },
      transaction: order.transaction,
    });
  } catch (error) {
    console.error(error);

    if (error instanceof JupiterApiError) {
      return sendError(response, mapJupiterOrderStatus(error.status), error.message);
    }

    if (error instanceof Error && /amount/i.test(error.message)) {
      return sendError(response, 400, error.message);
    }

    return sendError(response, 500, "Unable to create swap order.");
  }
});

swapsRouter.post("/execute", async (request, response) => {
  try {
    const parsedBody = executeSwapSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const identity = await validateAccessToken(parsedBody.data.accessToken);
    const existingUser = await getUserByCdpUserId(identity.cdpUserId);

    if (!existingUser) {
      return sendError(response, 404, "Monra user not found.");
    }

    if (!existingUser.solanaAddress) {
      return sendError(response, 409, "Your Solana wallet is still syncing. Try again in a moment.");
    }

    const cachedOrder = getCachedSwapOrder(parsedBody.data.requestId);
    if (!cachedOrder || cachedOrder.userId !== existingUser.id) {
      return sendError(response, 409, "Swap quote expired. Refresh the quote and try again.");
    }

    if (cachedOrder.walletAddress !== existingUser.solanaAddress) {
      return sendError(response, 409, "Stored Solana wallet does not match the swap quote.");
    }

    const execution = await executeJupiterSwap({
      requestId: parsedBody.data.requestId,
      signedTransaction: parsedBody.data.signedTransaction,
    });

    if (execution.status !== "Success") {
      return sendError(response, 409, mapJupiterExecuteError(execution.code, execution.error));
    }

    if (!execution.signature) {
      return sendError(response, 502, "Jupiter execute succeeded without a transaction signature.");
    }

    const createdSwap = await createConfirmedSwapTransaction({
      inputAmountRaw: execution.inputAmountResult ?? cachedOrder.inputAmountRaw,
      inputAsset: cachedOrder.inputAsset,
      outputAmountRaw: execution.outputAmountResult ?? cachedOrder.outputAmountRaw,
      outputAsset: cachedOrder.outputAsset,
      transactionSignature: execution.signature,
      userId: existingUser.id,
      walletAddress: existingUser.solanaAddress,
    });

    await broadcastLatestTransactionSnapshot(existingUser.id, createdSwap.balances);

    return response.json(createdSwap);
  } catch (error) {
    console.error(error);

    if (error instanceof JupiterApiError) {
      return sendError(response, mapJupiterExecuteStatus(error.status), error.message);
    }

    return sendError(response, 500, "Unable to execute swap.");
  }
});

export function normalizeSwapAmount(value: string, asset: TransferAsset) {
  const trimmed = value.trim();
  const decimals = getTransferAssetDecimals(asset);
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);

  if (!pattern.test(trimmed)) {
    throw new Error(
      `Enter a valid ${getTransferAssetLabel(asset)} amount with up to ${decimals} decimal places.`,
    );
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const decimal = normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
  const raw = BigInt(`${normalizedWhole}${fractionPart.padEnd(decimals, "0")}` || "0").toString();

  if (BigInt(raw) <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return { decimal, raw };
}

function formatAssetAmount(rawAmount: string, asset: TransferAsset) {
  const decimals = getTransferAssetDecimals(asset);
  const normalizedAmount = rawAmount.replace(/^0+/, "") || "0";
  const paddedAmount = normalizedAmount.padStart(decimals + 1, "0");
  const whole = paddedAmount.slice(0, -decimals);
  const fraction = paddedAmount.slice(-decimals).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function mapJupiterOrderStatus(status: number) {
  return status >= 400 && status < 500 ? 400 : 502;
}

function mapJupiterExecuteStatus(status: number) {
  return status >= 400 && status < 500 ? 409 : 502;
}

function mapJupiterExecuteError(code: number, error: string | null) {
  if (code === -1 || code === -2003) {
    return "Swap quote expired. Refresh the quote and try again.";
  }

  if (code === -1003) {
    return "Swap transaction was not fully signed.";
  }

  return error ?? "Swap execution failed.";
}

async function broadcastLatestTransactionSnapshot(
  userId: number,
  balancesOverride?: Awaited<ReturnType<typeof createConfirmedSwapTransaction>>["balances"],
) {
  const [balances, transactionPage, treasuryPrices] = await Promise.all([
    Promise.resolve(balancesOverride),
    listTransactionsByUserIdPaginated(userId, { limit: 5 }),
    getTreasuryPrices(),
  ]);

  if (!balances) {
    return;
  }

  broadcastTransactionSnapshot(userId, {
    balances,
    valuation: buildTreasuryValuation(balances, treasuryPrices),
    transactions: transactionPage.transactions,
  });
}
