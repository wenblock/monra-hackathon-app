import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import {
  createPendingOfframpTransaction,
  getRecipientByIdForUser,
  getRecipientByPublicIdForUser,
} from "../db.js";
import { normalizeMinimumCurrencyAmount } from "../lib/amounts.js";
import {
  createBridgeOfframpTransfer,
  isBridgeApiError,
  syncBridgeStatus,
} from "../lib/bridge.js";
import type { OfframpSourceAsset } from "../types.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { userMutationRateLimit } from "../middleware/rateLimits.js";

const createOfframpSchema = z.object({
  amount: z.string().trim().min(1, "Amount is required."),
  sourceAsset: z.enum(["eurc", "usdc"]).default("eurc"),
  recipientId: z.coerce.number().int().positive("Recipient id must be a positive integer.").optional(),
  recipientPublicId: z.string().trim().uuid("Recipient public id must be a valid UUID.").optional(),
}).superRefine((data, ctx) => {
  if (data.recipientId === undefined && !data.recipientPublicId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recipientPublicId"],
      message: "Recipient public id is required.",
    });
  }
});

const displayCurrencyByAsset: Record<OfframpSourceAsset, string> = {
  eurc: "EUR",
  usdc: "USD",
};

export const offrampRouter = Router();
offrampRouter.use(requireAppUser);

offrampRouter.post("/", userMutationRateLimit, async (request, response) => {
  try {
    const parsedBody = createOfframpSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const amount = normalizeOfframpAmount(parsedBody.data.amount, parsedBody.data.sourceAsset);
    const existingUser = readAppUser(request);

    if (!existingUser.bridgeCustomerId) {
      return sendError(response, 409, "Bridge onboarding must be completed before using off-ramp.");
    }

    if (!existingUser.solanaAddress) {
      return sendError(response, 409, "Your Solana wallet is still syncing. Try again in a moment.");
    }

    const recipient = parsedBody.data.recipientPublicId
      ? await getRecipientByPublicIdForUser(existingUser.id, parsedBody.data.recipientPublicId)
      : await getRecipientByIdForUser(existingUser.id, parsedBody.data.recipientId!);
    if (!recipient) {
      return sendError(response, 404, "Recipient not found.");
    }

    if (recipient.kind !== "bank" || !recipient.bridgeExternalAccountId) {
      return sendError(response, 409, "Off-ramp requires a saved bank recipient.");
    }

    const synced = await syncBridgeStatus(existingUser);
    if (synced.bridge.customerStatus !== "active" || !synced.bridge.hasAcceptedTermsOfService) {
      return sendError(response, 409, "Bridge onboarding must be active before creating an off-ramp.");
    }

    const bridgeTransfer = await createBridgeOfframpTransfer({
      amount,
      bridgeCustomerId: existingUser.bridgeCustomerId,
      externalAccountId: recipient.bridgeExternalAccountId,
      returnAddress: existingUser.solanaAddress,
      sourceAddress: existingUser.solanaAddress,
      sourceAsset: parsedBody.data.sourceAsset,
    });

    const transaction = await createPendingOfframpTransaction({
      amount,
      asset: parsedBody.data.sourceAsset,
      bridgeTransferId: bridgeTransfer.bridgeTransferId,
      bridgeTransferStatus: bridgeTransfer.bridgeTransferStatus,
      depositInstructions: bridgeTransfer.depositInstructions,
      receiptUrl: bridgeTransfer.receiptUrl,
      recipientId: recipient.id,
      recipientName: recipient.displayName,
      sourceAmount: bridgeTransfer.sourceAmount,
      sourceCurrency: bridgeTransfer.sourceCurrency,
      userId: existingUser.id,
      walletAddress: existingUser.solanaAddress,
    });

    return response.status(201).json({ transaction });
  } catch (error) {
    logError("offramp.create_failed", error, {
      requestId: request.requestId,
    });

    if (isBridgeApiError(error)) {
      return sendError(response, 502, error.message);
    }

    if (error instanceof Error && /amount/i.test(error.message)) {
      return sendError(response, 400, error.message);
    }

    return sendError(response, 500, "Unable to create off-ramp.");
  }
});

function normalizeOfframpAmount(value: string, sourceAsset: OfframpSourceAsset) {
  return normalizeMinimumCurrencyAmount({
    currencyCode: sourceAsset.toUpperCase(),
    decimals: 6,
    minimum: 3,
    minimumMessage: `Minimum off-ramp amount is 3 ${displayCurrencyByAsset[sourceAsset]}.`,
    value,
  });
}
