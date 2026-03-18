import { Router } from "express";
import { z } from "zod";

import { validateAccessToken } from "../auth/validateAccessToken.js";
import { createUser, getUserByCdpUserId } from "../db.js";
import {
  buildStoredBridgeComplianceState,
  createBridgeKycLink,
  isBridgeApiError,
} from "../lib/bridge.js";
import { sendError } from "../lib/http.js";
import { getCountryName } from "../lib/countries.js";

const onboardingSchema = z
  .object({
    accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
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

onboardingRouter.post("/", async (request, response) => {
  try {
    const parsedBody = onboardingSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendError(
        response,
        400,
        parsedBody.error.issues[0]?.message ?? "Invalid onboarding payload.",
      );
    }

    const identity = await validateAccessToken(parsedBody.data.accessToken);

    const existingUser = await getUserByCdpUserId(identity.cdpUserId);
    if (existingUser) {
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

    const bridgeFullName =
      parsedBody.data.accountType === "business"
        ? parsedBody.data.businessName!.trim()
        : parsedBody.data.fullName;
    const bridgeKycLink = await createBridgeKycLink({
      accountType: parsedBody.data.accountType,
      cdpUserId: identity.cdpUserId,
      email: identity.email,
      fullName: bridgeFullName,
    });

    const user = await createUser({
      cdpUserId: identity.cdpUserId,
      email: identity.email,
      accountType: parsedBody.data.accountType,
      fullName: parsedBody.data.fullName,
      countryCode,
      countryName,
      businessName: parsedBody.data.businessName,
      bridgeCustomerId: bridgeKycLink.customerId,
      bridgeKycLink: bridgeKycLink.kycLink,
      bridgeKycLinkId: bridgeKycLink.id,
      bridgeKycStatus: bridgeKycLink.kycStatus,
      bridgeTosLink: bridgeKycLink.tosLink,
      bridgeTosStatus: bridgeKycLink.tosStatus,
    });

    return response.status(201).json({
      bridge: buildStoredBridgeComplianceState(user),
      status: "active",
      identity,
      user,
    });
  } catch (error) {
    console.error(error);
    if (isBridgeApiError(error)) {
      return sendError(response, 502, error.message);
    }

    return sendError(response, 500, "Unable to complete onboarding.");
  }
});
