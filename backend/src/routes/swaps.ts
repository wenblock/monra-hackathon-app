import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { normalizeSwapAmount as normalizeSwapInputAmount } from "../lib/amounts.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { highCostUserActionRateLimit } from "../middleware/rateLimits.js";
import { isServiceError } from "../services/errors.js";
import { createSwapOrderForUser, executeSwapForUser } from "../services/swapsService.js";
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

    const existingUser = readAppUser(request);
    return response.json(
      await createSwapOrderForUser({
        amount: parsedBody.data.amount,
        inputAsset: parsedBody.data.inputAsset,
        outputAsset: parsedBody.data.outputAsset,
        user: existingUser,
      }),
    );
  } catch (error) {
    logError("swaps.order_failed", error, {
      requestId: request.requestId,
    });

    if (isServiceError(error)) {
      return sendError(response, error.status, error.message);
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
    return response.json(
      await executeSwapForUser({
        requestId: parsedBody.data.requestId,
        signedTransaction: parsedBody.data.signedTransaction,
        user: existingUser,
      }),
    );
  } catch (error) {
    logError("swaps.execute_failed", error, {
      requestId: request.requestId,
    });

    if (isServiceError(error)) {
      return sendError(response, error.status, error.message);
    }

    return sendError(response, 500, "Unable to execute swap.");
  }
});

export function normalizeSwapAmount(value: string, asset: TransferAsset) {
  return normalizeSwapInputAmount(value, asset);
}
