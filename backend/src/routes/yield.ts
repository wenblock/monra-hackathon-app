import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { normalizeSwapAmount } from "../lib/amounts.js";
import { highCostUserActionRateLimit } from "../middleware/rateLimits.js";
import { isServiceError } from "../services/errors.js";
import { confirmYieldTransactionForUser, getYieldLedgerSummaryForUser } from "../services/yieldService.js";
import type { YieldAsset } from "../types.js";

const confirmYieldSchema = z.object({
  action: z.enum(["deposit", "withdraw"]),
  amount: z.string().trim().min(1, "Amount is required."),
  asset: z.enum(["usdc", "eurc"]),
  transactionSignature: z.string().trim().min(1, "Transaction signature is required."),
});

export const yieldRouter = Router();
yieldRouter.use(requireAppUser);

yieldRouter.get("/ledger-summary", async (request, response) => {
  try {
    const existingUser = readAppUser(request);

    return response.json({
      ledgerSummary: await getYieldLedgerSummaryForUser(existingUser.id),
    });
  } catch (error) {
    logError("yield.ledger_summary_failed", error, {
      requestId: request.requestId,
    });

    if (isServiceError(error)) {
      return sendError(response, error.status, error.message);
    }

    return sendError(response, 500, "Unable to load the yield ledger summary.");
  }
});

yieldRouter.post("/confirm", highCostUserActionRateLimit, async (request, response) => {
  try {
    const parsedBody = confirmYieldSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const existingUser = readAppUser(request);

    return response.json(
      await confirmYieldTransactionForUser({
        action: parsedBody.data.action,
        amount: parsedBody.data.amount,
        asset: parsedBody.data.asset,
        transactionSignature: parsedBody.data.transactionSignature,
        user: existingUser,
      }),
    );
  } catch (error) {
    logError("yield.confirm_failed", error, {
      requestId: request.requestId,
    });

    if (isServiceError(error)) {
      return sendError(response, error.status, error.message);
    }

    return sendError(response, 500, "Unable to confirm the yield transaction.");
  }
});

export function normalizeYieldAmount(value: string, asset: YieldAsset) {
  return normalizeSwapAmount(value, asset);
}
