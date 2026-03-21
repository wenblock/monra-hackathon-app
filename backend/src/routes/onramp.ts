import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { createPendingOnrampTransaction } from "../db.js";
import { normalizeMinimumCurrencyAmount } from "../lib/amounts.js";
import {
  createBridgeOnrampTransfer,
  isBridgeApiError,
  syncBridgeStatus,
} from "../lib/bridge.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { userMutationRateLimit } from "../middleware/rateLimits.js";

const createOnrampSchema = z.object({
  amount: z.string().trim().min(1, "EUR amount is required."),
  destinationAsset: z.enum(["usdc", "eurc"]).default("usdc"),
});

export const onrampRouter = Router();
onrampRouter.use(requireAppUser);

onrampRouter.post("/", userMutationRateLimit, async (request, response) => {
  try {
    const parsedBody = createOnrampSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const amount = normalizeEurAmount(parsedBody.data.amount);
    const existingUser = readAppUser(request);

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
    logError("onramp.create_failed", error, {
      requestId: request.requestId,
    });

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
  return normalizeMinimumCurrencyAmount({
    currencyCode: "EUR",
    decimals: 2,
    minimum: 3,
    minimumMessage: "Minimum on-ramp amount is 3 EUR.",
    value,
  });
}
