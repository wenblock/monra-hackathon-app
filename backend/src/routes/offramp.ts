import { Router } from "express";
import { z } from "zod";

import { validateAccessToken } from "../auth/validateAccessToken.js";
import {
  createPendingOfframpTransaction,
  getRecipientByIdForUser,
  getUserByCdpUserId,
} from "../db.js";
import {
  createBridgeOfframpTransfer,
  isBridgeApiError,
  syncBridgeStatus,
} from "../lib/bridge.js";
import type { OfframpSourceAsset } from "../types.js";
import { sendError } from "../lib/http.js";

const createOfframpSchema = z.object({
  accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
  amount: z.string().trim().min(1, "Amount is required."),
  sourceAsset: z.enum(["eurc", "usdc"]).default("eurc"),
  recipientId: z.coerce.number().int().positive("Recipient id must be a positive integer."),
});

const displayCurrencyByAsset: Record<OfframpSourceAsset, string> = {
  eurc: "EUR",
  usdc: "USD",
};

export const offrampRouter = Router();

offrampRouter.post("/", async (request, response) => {
  try {
    const parsedBody = createOfframpSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const amount = normalizeOfframpAmount(parsedBody.data.amount, parsedBody.data.sourceAsset);
    const identity = await validateAccessToken(parsedBody.data.accessToken);
    const existingUser = await getUserByCdpUserId(identity.cdpUserId);

    if (!existingUser) {
      return sendError(response, 404, "Monra user not found.");
    }

    if (!existingUser.bridgeCustomerId) {
      return sendError(response, 409, "Bridge onboarding must be completed before using off-ramp.");
    }

    if (!existingUser.solanaAddress) {
      return sendError(response, 409, "Your Solana wallet is still syncing. Try again in a moment.");
    }

    const recipient = await getRecipientByIdForUser(existingUser.id, parsedBody.data.recipientId);
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
    console.error(error);

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
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error(`Enter a valid ${sourceAsset.toUpperCase()} amount with up to 6 decimal places.`);
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const normalizedAmount = normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
  const parsedAmount = Number.parseFloat(normalizedAmount);

  if (!Number.isFinite(parsedAmount) || parsedAmount < 3) {
    throw new Error(`Minimum off-ramp amount is 3 ${displayCurrencyByAsset[sourceAsset]}.`);
  }

  return normalizedAmount;
}
