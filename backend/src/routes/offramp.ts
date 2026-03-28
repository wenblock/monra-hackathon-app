import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { normalizeMinimumCurrencyAmount } from "../lib/amounts.js";
import type { OfframpSourceAsset } from "../types.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { userMutationRateLimit } from "../middleware/rateLimits.js";
import { isServiceError } from "../services/errors.js";
import { createOfframpForUser } from "../services/offrampService.js";

const createOfframpSchema = z.object({
  amount: z.string().trim().min(1, "Amount is required."),
  requestId: z.string().trim().uuid("Request id must be a valid UUID."),
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
    const transaction = await createOfframpForUser({
      amount,
      recipientId: parsedBody.data.recipientId,
      recipientPublicId: parsedBody.data.recipientPublicId,
      requestId: parsedBody.data.requestId,
      sourceAsset: parsedBody.data.sourceAsset,
      user: existingUser,
    });

    return response.status(201).json({ transaction });
  } catch (error) {
    logError("offramp.create_failed", error, {
      requestId: request.requestId,
    });

    if (isServiceError(error)) {
      return sendError(response, error.status, error.message);
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
