import { Router } from "express";
import { z } from "zod";

import { readAuthIdentity, requireAuthIdentity } from "../auth/requestAuth.js";
import { getUserByCdpUserId } from "../db/repositories/usersRepo.js";
import { isConstraintViolation } from "../db/errors.js";
import { isBridgeApiError } from "../lib/bridge.js";
import { sendError } from "../lib/http.js";
import { getCountryName } from "../lib/countries.js";
import { logError } from "../lib/logger.js";
import {
  OnboardingFlowError,
  executeOnboardingFlow,
  requiresOnboarding,
} from "../lib/onboardingFlow.js";

const onboardingSchema = z
  .object({
    accountType: z.enum(["individual", "business"]),
    fullName: z.string().trim().min(1, "Full name is required."),
    countryCode: z.string().trim().length(2, "Country code must be a 2-letter ISO code."),
    businessName: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accountType === "business" && !data.businessName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["businessName"],
        message: "Business name is required for business accounts.",
      });
    }
  });

export const onboardingRouter = Router();

onboardingRouter.post("/", requireAuthIdentity, async (request, response) => {
  try {
    const parsedBody = onboardingSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendError(
        response,
        400,
        parsedBody.error.issues[0]?.message ?? "Invalid onboarding payload.",
      );
    }

    const identity = readAuthIdentity(request);

    const existingUser = await getUserByCdpUserId(identity.cdpUserId);
    if (existingUser && !requiresOnboarding(existingUser)) {
      return sendError(response, 409, "A Monra user already exists for this account.");
    }

    if (!identity.email) {
      return sendError(response, 400, "Authenticated email is required to complete onboarding.");
    }

    const countryCode = parsedBody.data.countryCode.toUpperCase();
    const countryName = getCountryName(countryCode);
    if (!countryName) {
      return sendError(response, 400, "Selected country is not supported.");
    }

    const onboarding = await executeOnboardingFlow(identity, {
      accountType: parsedBody.data.accountType,
      businessName: parsedBody.data.businessName,
      countryCode,
      countryName,
      fullName: parsedBody.data.fullName,
    });

    return response.status(onboarding.createdLocalUser ? 201 : 200).json({
      bridge: onboarding.bridge,
      status: "active",
      identity,
      user: onboarding.user,
    });
  } catch (error) {
    const originalError = getOnboardingErrorCause(error);
    const context = getOnboardingErrorContext(error);

    logError("onboarding.failed", originalError, {
      bridgeRequestAttempted: context?.bridgeRequestAttempted ?? false,
      cdpUserId: context?.cdpUserId ?? null,
      requestId: request.requestId,
      stage: context?.stage ?? "unknown",
    });

    if (isBridgeApiError(originalError)) {
      return sendError(response, 502, originalError.message);
    }

    if (isUsersPrimaryKeyViolation(originalError)) {
      return sendError(
        response,
        503,
        "Unable to complete onboarding because local user storage is temporarily out of sync. Please try again.",
      );
    }

    if (context?.bridgeRequestAttempted) {
      return sendError(
        response,
        500,
        "Unable to complete onboarding. Your profile was saved locally, so retrying will resume Bridge onboarding.",
      );
    }

    return sendError(response, 500, "Unable to complete onboarding.");
  }
});

function getOnboardingErrorCause(error: unknown) {
  if (error instanceof OnboardingFlowError) {
    return error.originalError;
  }

  return error;
}

function getOnboardingErrorContext(error: unknown) {
  if (!(error instanceof OnboardingFlowError)) {
    return null;
  }

  return {
    bridgeRequestAttempted: error.bridgeRequestAttempted,
    cdpUserId: error.cdpUserId,
    stage: error.stage,
  };
}

function isUsersPrimaryKeyViolation(error: unknown) {
  return isConstraintViolation(error, "users_pkey");
}
