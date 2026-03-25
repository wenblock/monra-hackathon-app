import { Router } from "express";
import { z } from "zod";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { isUniqueViolation } from "../db/errors.js";
import { getUserBalancesByUserId, updateUserSolanaAddress } from "../db/repositories/usersRepo.js";
import {
  fetchSolanaTransactionContext,
  isAlchemyApiError,
  updateAlchemyWebhookAddresses,
} from "../lib/alchemy.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { isValidSolanaAddress } from "../lib/solana.js";
import { userMutationRateLimit } from "../middleware/rateLimits.js";
import { buildTreasurySnapshotForUser, createEmptyTreasuryValuation, createEmptyYieldPortfolioSnapshot } from "../services/treasuryService.js";

const solanaAddressSchema = z.object({
  solanaAddress: z.string().trim().min(1, "Solana address is required."),
});

const solanaTransactionContextSchema = z
  .object({
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
usersRouter.use(requireAppUser);

usersRouter.post("/solana-address", userMutationRateLimit, async (request, response) => {
  try {
    const parsedBody = solanaAddressSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const existingUser = readAppUser(request);

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

    const user = await updateUserSolanaAddress(
      existingUser.cdpUserId,
      parsedBody.data.solanaAddress,
    );

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    return response.json({ user });
  } catch (error) {
    logError("users.solana_address_save_failed", error, {
      requestId: request.requestId,
    });

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
    const user = readAppUser(request);
    const treasurySnapshot = await buildTreasurySnapshotForUser(user.id).catch(async error => {
      logError("users.treasury_valuation_failed", error, {
        requestId: request.requestId,
        userId: user.id,
      });
      return {
        balances: await getUserBalancesByUserId(user.id),
        valuation: createEmptyTreasuryValuation(),
        yield: createEmptyYieldPortfolioSnapshot(),
      };
    });

    return response.json({
      balances: treasurySnapshot.balances,
      network: "solana-mainnet",
      valuation: treasurySnapshot.valuation,
      yield: treasurySnapshot.yield,
    });
  } catch (error) {
    logError("users.balances_fetch_failed", error, {
      requestId: request.requestId,
    });

    return sendError(response, 500, "Unable to fetch Solana balances.");
  }
});

usersRouter.post("/solana-transaction-context", userMutationRateLimit, async (request, response) => {
  try {
    const parsedBody = solanaTransactionContextSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    readAppUser(request);

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
    logError("users.solana_transaction_context_failed", error, {
      requestId: request.requestId,
    });

    if (isAlchemyApiError(error)) {
      return sendError(response, 502, "Unable to prepare Solana transaction context.");
    }

    return sendError(response, 500, "Unable to prepare Solana transaction context.");
  }
});
