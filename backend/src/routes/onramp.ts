import { Router } from "express";
import { z } from "zod";

import { validateAccessToken } from "../auth/validateAccessToken.js";
import { createPendingOnrampTransaction, getUserByCdpUserId } from "../db.js";
import {
  createBridgeOnrampTransfer,
  isBridgeApiError,
  syncBridgeStatus,
} from "../lib/bridge.js";
import { sendError } from "../lib/http.js";

const createOnrampSchema = z.object({
  accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
  amount: z.string().trim().min(1, "EUR amount is required."),
  destinationAsset: z.enum(["usdc", "eurc"]).default("usdc"),
});

export const onrampRouter = Router();

onrampRouter.post("/", async (request, response) => {
  try {
    const parsedBody = createOnrampSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const amount = normalizeEurAmount(parsedBody.data.amount);
    const identity = await validateAccessToken(parsedBody.data.accessToken);
    const existingUser = await getUserByCdpUserId(identity.cdpUserId);

    if (!existingUser) {
      return sendError(response, 404, "Monra user not found.");
    }

    if (!existingUser.bridgeCustomerId) {
      return sendError(response, 409, "Bridge onboarding must be completed before using on-ramp.");
    }

    if (!existingUser.solanaAddress) {
      return sendError(response, 409, "Your Solana wallet is still syncing. Try again in a moment.");
    }

    const synced = await syncBridgeStatus(existingUser);
    if (synced.bridge.customerStatus !== "active" || !synced.bridge.hasAcceptedTermsOfService) {
      return sendError(response, 409, "Bridge onboarding must be active before creating an on-ramp.");
    }

    const bridgeTransfer = await createBridgeOnrampTransfer({
      amount,
      bridgeCustomerId: existingUser.bridgeCustomerId,
      destinationAddress: existingUser.solanaAddress,
      destinationAsset: parsedBody.data.destinationAsset,
    });

    const transaction = await createPendingOnrampTransaction({
      asset: parsedBody.data.destinationAsset,
      userId: existingUser.id,
      walletAddress: existingUser.solanaAddress,
      bridgeTransferId: bridgeTransfer.bridgeTransferId,
      bridgeTransferStatus: bridgeTransfer.bridgeTransferStatus,
      sourceAmount: bridgeTransfer.sourceAmount,
      sourceCurrency: bridgeTransfer.sourceCurrency,
      expectedDestinationAmount: bridgeTransfer.destinationAmount,
      depositInstructions: bridgeTransfer.depositInstructions,
      receiptUrl: bridgeTransfer.receiptUrl,
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

    return sendError(response, 500, "Unable to create on-ramp.");
  }
});

function normalizeEurAmount(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Enter a valid EUR amount with up to 2 decimal places.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const normalizedAmount = normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
  const parsedAmount = Number.parseFloat(normalizedAmount);

  if (!Number.isFinite(parsedAmount) || parsedAmount < 3) {
    throw new Error("Minimum on-ramp amount is 3 EUR.");
  }

  return normalizedAmount;
}
