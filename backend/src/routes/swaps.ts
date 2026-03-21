import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { createConfirmedSwapTransaction } from "../db.js";
import { normalizeSwapAmount as normalizeSwapInputAmount } from "../lib/amounts.js";
import {
  getTransferAssetDecimals,
  getTransferAssetMintAddress,
} from "../lib/assets.js";
import {
  executeJupiterSwap,
  getJupiterSwapOrder,
  JupiterApiError,
} from "../lib/jupiter.js";
import { getSharedSwapQuote, storeSharedSwapQuote } from "../db/runtime.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { broadcastLatestTransactionSnapshot } from "../lib/transactionStream.js";
import { highCostUserActionRateLimit } from "../middleware/rateLimits.js";
import type { TransferAsset } from "../types.js";

const createSwapOrderSchema = z.object({
  amount: z.string().trim().min(1, "Amount is required."),
  inputAsset: z.enum(["sol", "usdc", "eurc"]),
  outputAsset: z.enum(["sol", "usdc", "eurc"]),
});

const executeSwapSchema = z.object({
  requestId: z.string().trim().min(1, "Request id is required."),
  signedTransaction: z.string().trim().min(1, "Signed transaction is required."),
});

export const swapsRouter = Router();
swapsRouter.use(requireAppUser);

swapsRouter.post("/order", highCostUserActionRateLimit, async (request, response) => {
  try {
    const parsedBody = createSwapOrderSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    if (parsedBody.data.inputAsset === parsedBody.data.outputAsset) {
      return sendError(response, 400, "Select two different assets to swap.");
    }

    const normalizedAmount = normalizeSwapAmount(parsedBody.data.amount, parsedBody.data.inputAsset);
    const existingUser = readAppUser(request);

    if (!existingUser.solanaAddress) {
      return sendError(response, 409, "Your Solana wallet is still syncing. Try again in a moment.");
    }

    const order = await getJupiterSwapOrder({
      amount: normalizedAmount.raw,
      inputMint: getTransferAssetMintAddress(parsedBody.data.inputAsset),
      outputMint: getTransferAssetMintAddress(parsedBody.data.outputAsset),
      taker: existingUser.solanaAddress,
    });

    await storeSharedSwapQuote({
      inputAmountRaw: normalizedAmount.raw,
      inputAsset: parsedBody.data.inputAsset,
      outputAmountRaw: order.outAmount,
      outputAsset: parsedBody.data.outputAsset,
      requestId: order.requestId,
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
    logError("swaps.order_failed", error, {
      requestId: request.requestId,
    });

    if (error instanceof JupiterApiError) {
      return sendError(response, mapJupiterOrderStatus(error.status), error.message);
    }

    if (error instanceof Error && /amount/i.test(error.message)) {
      return sendError(response, 400, error.message);
    }

    return sendError(response, 500, "Unable to create swap order.");
  }
});

swapsRouter.post("/execute", highCostUserActionRateLimit, async (request, response) => {
  try {
    const parsedBody = executeSwapSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const existingUser = readAppUser(request);

    if (!existingUser.solanaAddress) {
      return sendError(response, 409, "Your Solana wallet is still syncing. Try again in a moment.");
    }

    const cachedOrder = await getSharedSwapQuote(parsedBody.data.requestId);
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
    logError("swaps.execute_failed", error, {
      requestId: request.requestId,
    });

    if (error instanceof JupiterApiError) {
      return sendError(response, mapJupiterExecuteStatus(error.status), error.message);
    }

    return sendError(response, 500, "Unable to execute swap.");
  }
});

export function normalizeSwapAmount(value: string, asset: TransferAsset) {
  return normalizeSwapInputAmount(value, asset);
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
