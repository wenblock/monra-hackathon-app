import { Router } from "express";
import { z } from "zod";

import { validateAccessToken } from "../auth/validateAccessToken.js";
import { getUserBalancesByUserId, getUserByCdpUserId, updateUserSolanaAddress } from "../db.js";
import {
  buildTreasuryValuation,
  createUnavailableTreasuryValuation,
  fetchSolanaTransactionContext,
  getTreasuryPrices,
  isAlchemyApiError,
  updateAlchemyWebhookAddresses,
} from "../lib/alchemy.js";
import { sendError } from "../lib/http.js";
import { isValidSolanaAddress } from "../lib/solana.js";

const solanaAddressSchema = z.object({
  accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
  solanaAddress: z.string().trim().min(1, "Solana address is required."),
});

const solanaTransactionContextSchema = z
  .object({
    accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
    asset: z.enum(["sol", "usdc", "eurc"]),
    senderAddress: z.string().trim().min(1, "Sender wallet address is required."),
    recipientAddress: z.string().trim().min(1, "Recipient wallet address is required."),
    recipientTokenAccountAddress: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.asset !== "sol" && !data.recipientTokenAccountAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientTokenAccountAddress"],
        message: "Recipient token account address is required.",
      });
    }
  });

export const usersRouter = Router();

usersRouter.post("/solana-address", async (request, response) => {
  try {
    const parsedBody = solanaAddressSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const identity = await validateAccessToken(parsedBody.data.accessToken);
    const existingUser = await getUserByCdpUserId(identity.cdpUserId);

    if (!existingUser) {
      return sendError(response, 404, "Monra user not found.");
    }

    if (!isValidSolanaAddress(parsedBody.data.solanaAddress)) {
      return sendError(response, 400, "Solana address is invalid.");
    }

    if (
      existingUser.solanaAddress &&
      existingUser.solanaAddress !== parsedBody.data.solanaAddress
    ) {
      return sendError(response, 409, "Stored Solana wallet cannot be changed.");
    }

    if (existingUser.solanaAddress === parsedBody.data.solanaAddress) {
      return response.json({ user: existingUser });
    }

    await updateAlchemyWebhookAddresses({
      addressesToAdd: [parsedBody.data.solanaAddress],
    });

    const user = await updateUserSolanaAddress(identity.cdpUserId, parsedBody.data.solanaAddress);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    return response.json({ user });
  } catch (error) {
    console.error(error);

    if (isUniqueViolation(error)) {
      return sendError(response, 409, "This Solana wallet is already linked to another user.");
    }

    if (isAlchemyApiError(error)) {
      return sendError(response, 502, "Unable to register wallet with the Alchemy webhook.");
    }

    return sendError(response, 500, "Unable to save Solana address.");
  }
});

usersRouter.get("/balances", async (request, response) => {
  try {
    const accessToken = extractAccessToken(request.headers.authorization);
    if (!accessToken) {
      return sendError(response, 400, "Missing access token.");
    }

    const identity = await validateAccessToken(accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    const balances = await getUserBalancesByUserId(user.id);
    const valuation = await getTreasuryPrices()
      .then(treasuryPrices => buildTreasuryValuation(balances, treasuryPrices))
      .catch(error => {
        console.error("Unable to build treasury valuation.", error);
        return createUnavailableTreasuryValuation();
      });

    return response.json({
      balances,
      network: "solana-mainnet",
      valuation,
    });
  } catch (error) {
    console.error(error);

    if (isUnauthorizedTokenError(error)) {
      return sendError(response, 401, "Invalid or expired CDP access token.");
    }

    return sendError(response, 500, "Unable to fetch Solana balances.");
  }
});

usersRouter.post("/solana-transaction-context", async (request, response) => {
  try {
    const parsedBody = solanaTransactionContextSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const identity = await validateAccessToken(parsedBody.data.accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    if (!isValidSolanaAddress(parsedBody.data.senderAddress)) {
      return sendError(response, 400, "Sender wallet address is invalid.");
    }

    if (!isValidSolanaAddress(parsedBody.data.recipientAddress)) {
      return sendError(response, 400, "Recipient wallet address is invalid.");
    }

    if (
      parsedBody.data.recipientTokenAccountAddress &&
      !isValidSolanaAddress(parsedBody.data.recipientTokenAccountAddress)
    ) {
      return sendError(response, 400, "Recipient token account address is invalid.");
    }

    const transactionContext = await fetchSolanaTransactionContext({
      asset: parsedBody.data.asset,
      recipientTokenAccountAddress: parsedBody.data.recipientTokenAccountAddress,
    });

    return response.json(transactionContext);
  } catch (error) {
    console.error(error);

    if (isAlchemyApiError(error)) {
      return sendError(response, 502, "Unable to prepare Solana transaction context.");
    }

    return sendError(response, 500, "Unable to prepare Solana transaction context.");
  }
});

function extractAccessToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

function isUnauthorizedTokenError(error: unknown) {
  return error instanceof Error && /access token/i.test(error.message);
}

function isUniqueViolation(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "23505";
}
