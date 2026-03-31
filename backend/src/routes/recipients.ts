import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { isUniqueViolation } from "../db/errors.js";
import {
  createRecipient,
  deleteRecipientByIdForUser,
  deleteRecipientByPublicIdForUser,
  getRecipientByBridgeExternalAccountId,
  getRecipientByIdForUser,
  getRecipientByIbanForUser,
  getRecipientByPublicIdForUser,
  listRecipientsByUserId,
} from "../db/repositories/recipientsRepo.js";
import {
  createBridgeExternalAccount,
  deleteBridgeExternalAccount,
  isBridgeApiError,
} from "../lib/bridge.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { getSepaCountryName } from "../lib/sepaCountries.js";
import { isValidSolanaAddress } from "../lib/solana.js";
import { userMutationRateLimit } from "../middleware/rateLimits.js";
import {
  completeBridgeRequestSession,
  getOrCreateBridgeRequestSession,
} from "../services/bridgeRequestSessionsService.js";
import { isServiceError } from "../services/errors.js";

const createRecipientSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("wallet"),
      fullName: z.string().trim().min(1, "Full name is required."),
      walletAddress: z.string().trim().min(1, "Solana wallet address is required."),
    }),
    z.object({
      kind: z.literal("bank"),
      bankCountryCode: z.string().trim().length(3, "Bank country must be a 3-letter ISO code."),
      requestId: z.string().trim().uuid("Request id must be a valid UUID."),
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

const recipientReferenceSchema = z.object({
  recipientReference: z.string().trim().min(1, "Recipient identifier is required."),
});

export const recipientsRouter = Router();
recipientsRouter.use(requireAppUser);

recipientsRouter.get("/", async (request, response) => {
  try {
    const user = readAppUser(request);

    const recipients = await listRecipientsByUserId(user.id);
    return response.json({ recipients });
  } catch (error) {
    logError("recipients.list_failed", error, {
      requestId: request.requestId,
    });
    return sendError(response, 500, "Unable to load recipients.");
  }
});

recipientsRouter.post("/", userMutationRateLimit, async (request, response) => {
  try {
    const parsedBody = createRecipientSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const user = readAppUser(request);

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

    const bridgeRequestSession = await getOrCreateBridgeRequestSession({
      operationType: "external_account",
      requestId: parsedBody.data.requestId,
      payload: {
        bankCountryCode,
        bankName,
        iban,
        bic,
        bridgeCustomerId: user.bridgeCustomerId,
        recipientType: parsedBody.data.recipientType,
        ...(parsedBody.data.recipientType === "business"
          ? { businessName: parsedBody.data.businessName!.trim() }
          : {
              firstName: parsedBody.data.firstName!.trim(),
              lastName: parsedBody.data.lastName!.trim(),
            }),
      },
      userId: user.id,
      cdpUserId: user.cdpUserId,
    });

    const bridgeExternalAccount = await createBridgeExternalAccount({
      bridgeCustomerId: user.bridgeCustomerId,
      bankCountryCode,
      bankName,
      iban,
      bic,
      recipientType: parsedBody.data.recipientType,
      idempotencyKey: bridgeRequestSession.idempotencyKey,
      ...(parsedBody.data.recipientType === "business"
        ? { businessName: parsedBody.data.businessName!.trim() }
        : {
            firstName: parsedBody.data.firstName!.trim(),
            lastName: parsedBody.data.lastName!.trim(),
          }),
    });
    await completeBridgeRequestSession({
      operationType: "external_account",
      requestId: parsedBody.data.requestId,
      bridgeObjectId: bridgeExternalAccount.id,
    });

    const displayName =
      parsedBody.data.recipientType === "business"
        ? parsedBody.data.businessName!.trim()
        : `${parsedBody.data.firstName!.trim()} ${parsedBody.data.lastName!.trim()}`;

    let recipient;
    let status = 201;

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
      if (isUniqueViolation(error)) {
        const existingRecipient = await findExistingBankRecipientOnReplay({
          bridgeExternalAccountId: bridgeExternalAccount.id,
          iban,
          userId: user.id,
        });

        if (existingRecipient) {
          recipient = existingRecipient;
          status = 200;
        }
      }

      if (recipient) {
        return response.status(status).json({ recipient });
      }

      await deleteBridgeExternalAccount({
        bridgeCustomerId: user.bridgeCustomerId,
        externalAccountId: bridgeExternalAccount.id,
      }).catch(cleanupError => {
        logError("recipients.bridge_external_account_rollback_failed", cleanupError, {
          externalAccountId: bridgeExternalAccount.id,
          requestId: request.requestId,
          userId: user.id,
        });
      });

      throw error;
    }

    return response.status(status).json({ recipient });
  } catch (error) {
    logError("recipients.create_failed", error, {
      requestId: request.requestId,
    });

    if (isServiceError(error)) {
      return sendError(response, error.status, error.message);
    }

    if (isBridgeApiError(error)) {
      return sendError(response, 502, error.message);
    }

    if (isUniqueViolation(error)) {
      return sendError(response, 409, "A recipient with this account already exists.");
    }

    return sendError(response, 500, "Unable to create recipient.");
  }
});

recipientsRouter.delete("/:recipientReference", userMutationRateLimit, async (request, response) => {
  try {
    const parsedParams = recipientReferenceSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendError(
        response,
        400,
        parsedParams.error.issues[0]?.message ?? "Invalid recipient identifier.",
      );
    }

    const user = readAppUser(request);
    const recipientReference = parseRecipientReference(parsedParams.data.recipientReference);
    if (!recipientReference) {
      return sendError(response, 400, "Invalid recipient identifier.");
    }

    const recipient =
      recipientReference.kind === "publicId"
        ? await getRecipientByPublicIdForUser(user.id, recipientReference.value)
        : await getRecipientByIdForUser(user.id, recipientReference.value);
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

    if (recipientReference.kind === "publicId") {
      await deleteRecipientByPublicIdForUser(user.id, recipientReference.value);
    } else {
      await deleteRecipientByIdForUser(user.id, recipientReference.value);
    }

    return response.status(204).send();
  } catch (error) {
    logError("recipients.delete_failed", error, {
      requestId: request.requestId,
    });

    if (isBridgeApiError(error)) {
      return sendError(response, 502, error.message);
    }

    return sendError(response, 500, "Unable to delete recipient.");
  }
});

function normalizeCompactValue(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

async function findExistingBankRecipientOnReplay(input: {
  bridgeExternalAccountId: string;
  iban: string;
  userId: number;
}) {
  return (
    (await getRecipientByBridgeExternalAccountId(input.bridgeExternalAccountId)) ??
    (await getRecipientByIbanForUser(input.userId, input.iban))
  );
}

function parseRecipientReference(value: string) {
  const normalized = value.trim();

  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? { kind: "legacyId" as const, value: parsed }
      : null;
  }

  return z.string().uuid().safeParse(normalized).success
    ? { kind: "publicId" as const, value: normalized }
    : null;
}
