import { Router, type Request } from "express";
import { z } from "zod";

import { validateAccessToken } from "../auth/validateAccessToken.js";
import {
  createRecipient,
  deleteRecipientByIdForUser,
  getRecipientByIdForUser,
  getUserByCdpUserId,
  listRecipientsByUserId,
} from "../db.js";
import {
  createBridgeExternalAccount,
  deleteBridgeExternalAccount,
  isBridgeApiError,
} from "../lib/bridge.js";
import { sendError } from "../lib/http.js";
import { getSepaCountryName } from "../lib/sepaCountries.js";
import { isValidSolanaAddress } from "../lib/solana.js";

const createRecipientSchema = z
  .discriminatedUnion("kind", [
    z.object({
      accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
      kind: z.literal("wallet"),
      fullName: z.string().trim().min(1, "Full name is required."),
      walletAddress: z.string().trim().min(1, "Solana wallet address is required."),
    }),
    z.object({
      accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
      kind: z.literal("bank"),
      bankCountryCode: z.string().trim().length(3, "Bank country must be a 3-letter ISO code."),
      recipientType: z.enum(["individual", "business"]),
      firstName: z.string().trim().optional(),
      lastName: z.string().trim().optional(),
      businessName: z.string().trim().optional(),
      bankName: z.string().trim().min(1, "Bank name is required."),
      iban: z.string().trim().min(1, "IBAN is required."),
      bic: z.string().trim().min(1, "BIC is required."),
    }),
  ])
  .superRefine((data, ctx) => {
    if (data.kind !== "bank") {
      return;
    }

    if (!getSepaCountryName(data.bankCountryCode.toUpperCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankCountryCode"],
        message: "Selected bank country is not supported.",
      });
    }

    if (data.recipientType === "individual") {
      if (!data.firstName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["firstName"],
          message: "First name is required.",
        });
      }

      if (!data.lastName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lastName"],
          message: "Last name is required.",
        });
      }
    }

    if (data.recipientType === "business" && !data.businessName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["businessName"],
        message: "Business name is required.",
      });
    }
  });

const recipientIdSchema = z.object({
  recipientId: z.coerce.number().int().positive("Recipient id must be a positive integer."),
});

export const recipientsRouter = Router();

recipientsRouter.get("/", async (request, response) => {
  try {
    const accessToken = extractAccessToken(request);
    if (!accessToken) {
      return sendError(response, 400, "Missing access token.");
    }

    const identity = await validateAccessToken(accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    const recipients = await listRecipientsByUserId(user.id);
    return response.json({ recipients });
  } catch (error) {
    console.error(error);
    return sendError(response, 401, "Invalid or expired CDP access token.");
  }
});

recipientsRouter.post("/", async (request, response) => {
  try {
    const parsedBody = createRecipientSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const identity = await validateAccessToken(parsedBody.data.accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    if (parsedBody.data.kind === "wallet") {
      const walletAddress = parsedBody.data.walletAddress.trim();
      if (!isValidSolanaAddress(walletAddress)) {
        return sendError(response, 400, "Solana wallet address is invalid.");
      }

      const recipient = await createRecipient({
        userId: user.id,
        kind: "wallet",
        displayName: parsedBody.data.fullName.trim(),
        walletAddress,
      });

      return response.status(201).json({ recipient });
    }

    const bankCountryCode = parsedBody.data.bankCountryCode.toUpperCase();
    const bankName = parsedBody.data.bankName.trim();
    const iban = normalizeCompactValue(parsedBody.data.iban);
    const bic = normalizeCompactValue(parsedBody.data.bic);

    if (!user.bridgeCustomerId) {
      return sendError(response, 409, "Bridge customer not configured for this user.");
    }

    const bridgeExternalAccount = await createBridgeExternalAccount({
      userId: user.id,
      bridgeCustomerId: user.bridgeCustomerId,
      bankCountryCode,
      bankName,
      iban,
      bic,
      recipientType: parsedBody.data.recipientType,
      ...(parsedBody.data.recipientType === "business"
        ? { businessName: parsedBody.data.businessName!.trim() }
        : {
            firstName: parsedBody.data.firstName!.trim(),
            lastName: parsedBody.data.lastName!.trim(),
          }),
    });

    const displayName =
      parsedBody.data.recipientType === "business"
        ? parsedBody.data.businessName!.trim()
        : `${parsedBody.data.firstName!.trim()} ${parsedBody.data.lastName!.trim()}`;

    let recipient;

    try {
      recipient = await createRecipient({
        userId: user.id,
        kind: "bank",
        displayName,
        bankRecipientType: parsedBody.data.recipientType,
        bankCountryCode,
        bankName,
        iban,
        bic,
        firstName:
          parsedBody.data.recipientType === "individual"
            ? parsedBody.data.firstName!.trim()
            : null,
        lastName:
          parsedBody.data.recipientType === "individual" ? parsedBody.data.lastName!.trim() : null,
        businessName:
          parsedBody.data.recipientType === "business"
            ? parsedBody.data.businessName!.trim()
            : null,
        bridgeExternalAccountId: bridgeExternalAccount.id,
      });
    } catch (error) {
      await deleteBridgeExternalAccount({
        bridgeCustomerId: user.bridgeCustomerId,
        externalAccountId: bridgeExternalAccount.id,
      }).catch(cleanupError => {
        console.error("Unable to roll back Bridge external account creation.", cleanupError);
      });

      throw error;
    }

    return response.status(201).json({ recipient });
  } catch (error) {
    console.error(error);

    if (isBridgeApiError(error)) {
      return sendError(response, 502, error.message);
    }

    if (isUniqueViolation(error)) {
      return sendError(response, 409, "A recipient with this account already exists.");
    }

    return sendError(response, 500, "Unable to create recipient.");
  }
});

recipientsRouter.delete("/:recipientId", async (request, response) => {
  try {
    const accessToken = extractAccessToken(request);
    if (!accessToken) {
      return sendError(response, 400, "Missing access token.");
    }

    const parsedParams = recipientIdSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendError(
        response,
        400,
        parsedParams.error.issues[0]?.message ?? "Invalid recipient identifier.",
      );
    }

    const identity = await validateAccessToken(accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    const recipient = await getRecipientByIdForUser(user.id, parsedParams.data.recipientId);
    if (!recipient) {
      return sendError(response, 404, "Recipient not found.");
    }

    if (recipient.kind === "bank" && recipient.bridgeExternalAccountId) {
      if (!user.bridgeCustomerId) {
        return sendError(response, 409, "Bridge customer not configured for this user.");
      }

      await deleteBridgeExternalAccount({
        bridgeCustomerId: user.bridgeCustomerId,
        externalAccountId: recipient.bridgeExternalAccountId,
      });
    }

    await deleteRecipientByIdForUser(user.id, parsedParams.data.recipientId);
    return response.status(204).send();
  } catch (error) {
    console.error(error);

    if (isBridgeApiError(error)) {
      return sendError(response, 502, error.message);
    }

    return sendError(response, 500, "Unable to delete recipient.");
  }
});

function extractAccessToken(request: Request) {
  const authorizationHeader =
    typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

function normalizeCompactValue(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function isUniqueViolation(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "23505";
}
