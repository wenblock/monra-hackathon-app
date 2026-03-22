import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { normalizeMinimumCurrencyAmount } from "../lib/amounts.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { userMutationRateLimit } from "../middleware/rateLimits.js";
import { isServiceError } from "../services/errors.js";
import { createOnrampForUser } from "../services/onrampService.js";

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
    const transaction = await createOnrampForUser({
      amount,
      destinationAsset: parsedBody.data.destinationAsset,
      user: existingUser,
    });

    return response.status(201).json({ transaction });
  } catch (error) {
    logError("onramp.create_failed", error, {
      requestId: request.requestId,
    });

    if (isServiceError(error)) {
      return sendError(response, error.status, error.message);
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
