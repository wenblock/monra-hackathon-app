import { getYieldTransactionByUserIdAndSignature } from "../db/repositories/transactionsReadRepo.js";
import { createConfirmedYieldTransaction } from "../db/repositories/transactionsWriteRepo.js";
import { getUserBalancesByUserId } from "../db/repositories/usersRepo.js";
import { getYieldPositionByUserId } from "../db/repositories/yieldPositionsRepo.js";
import { fetchSolanaParsedTransaction, isAlchemyApiError, isSolanaTransactionSuccessful } from "../lib/alchemy.js";
import { getTransferAssetLabel } from "../lib/assets.js";
import { normalizeSwapAmount } from "../lib/amounts.js";
import { normalizeAlchemyTransaction } from "../lib/alchemyWebhook.js";
import { broadcastLatestTransactionSnapshot } from "../lib/transactionStream.js";
import { includesJupiterLendEarnInstruction } from "../lib/yield.js";
import type { AlchemyParsedTransactionResult } from "../lib/alchemy.js";
import type { AppUser, YieldAction, YieldAsset, YieldConfirmResponse } from "../types.js";
import { ServiceError } from "./errors.js";

interface YieldServiceDependencies {
  broadcastLatestTransactionSnapshot: typeof broadcastLatestTransactionSnapshot;
  createConfirmedYieldTransaction: typeof createConfirmedYieldTransaction;
  fetchSolanaParsedTransaction: typeof fetchSolanaParsedTransaction;
  getUserBalancesByUserId: typeof getUserBalancesByUserId;
  getYieldTransactionByUserIdAndSignature: typeof getYieldTransactionByUserIdAndSignature;
  getYieldPositionByUserId: typeof getYieldPositionByUserId;
}

const defaultDependencies: YieldServiceDependencies = {
  broadcastLatestTransactionSnapshot,
  createConfirmedYieldTransaction,
  fetchSolanaParsedTransaction,
  getUserBalancesByUserId,
  getYieldTransactionByUserIdAndSignature,
  getYieldPositionByUserId,
};

export async function getYieldPositionForUser(
  userId: number,
  dependencies: YieldServiceDependencies = defaultDependencies,
) {
  return dependencies.getYieldPositionByUserId(userId);
}

export async function confirmYieldTransactionForUser(
  input: {
    action: YieldAction;
    amount: string;
    asset: YieldAsset;
    transactionSignature: string;
    user: AppUser;
  },
  dependencies: YieldServiceDependencies = defaultDependencies,
) {
  if (!input.user.solanaAddress) {
    throw new ServiceError("Your Solana wallet is still syncing. Try again in a moment.", 409);
  }

  try {
    const normalizedAmount = normalizeSwapAmount(input.amount, input.asset);
    const expectedEntryType = input.action === "deposit" ? "yield_deposit" : "yield_withdraw";
    const existingTransaction = await dependencies.getYieldTransactionByUserIdAndSignature(
      input.user.id,
      input.transactionSignature,
    );

    if (existingTransaction) {
      if (existingTransaction.entryType !== expectedEntryType || existingTransaction.asset !== input.asset) {
        return {
          message: "Stored transaction does not match the requested yield action.",
          status: "failed",
        };
      }

      return buildExistingYieldConfirmResponse(input.user.id, existingTransaction, dependencies);
    }

    const parsedTransaction = await dependencies.fetchSolanaParsedTransaction(input.transactionSignature);

    if (!isSolanaTransactionSuccessful(parsedTransaction)) {
      return {
        message: "Yield transaction failed on-chain.",
        status: "failed",
      };
    }

    if (!includesJupiterLendEarnInstruction(parsedTransaction)) {
      return {
        message: "Transaction does not include a Jupiter Lend Earn instruction.",
        status: "failed",
      };
    }

    const matchedTransfer = findMatchingYieldTransfer({
      action: input.action,
      amountRaw: normalizedAmount.raw,
      asset: input.asset,
      parsedTransaction,
      user: input.user,
    });

    if (!matchedTransfer) {
      return {
        message: `Confirmed transaction did not contain the expected ${input.action} transfer for ${getTransferAssetLabel(input.asset)}.`,
        status: "failed",
      };
    }

    const createdYieldTransaction = await dependencies.createConfirmedYieldTransaction({
      action: input.action,
      amountRaw: normalizedAmount.raw,
      asset: input.asset,
      confirmedAt: matchedTransfer.confirmedAt,
      counterpartyWalletAddress: matchedTransfer.counterpartyWalletAddress ?? null,
      fromWalletAddress: matchedTransfer.fromWalletAddress,
      transactionSignature: input.transactionSignature,
      userId: input.user.id,
      walletAddress: input.user.solanaAddress,
    });

    await dependencies.broadcastLatestTransactionSnapshot(
      input.user.id,
      createdYieldTransaction.balances,
    );

    return {
      ...createdYieldTransaction,
      status: "confirmed",
    };
  } catch (error) {
    if (isAlchemyApiError(error)) {
      if (error.status === 404) {
        return {
          message: "Transaction is not confirmed yet. Try again in a moment.",
          status: "pending",
        };
      }

      throw new ServiceError("Unable to validate the confirmed Solana transaction.", 502);
    }

    if (error instanceof Error && /amount/i.test(error.message)) {
      throw new ServiceError(error.message, 400);
    }

    if (error instanceof ServiceError) {
      throw error;
    }

    throw error;
  }
}

async function buildExistingYieldConfirmResponse(
  userId: number,
  existingTransaction: Awaited<ReturnType<typeof getYieldTransactionByUserIdAndSignature>>,
  dependencies: YieldServiceDependencies,
): Promise<YieldConfirmResponse> {
  if (!existingTransaction) {
    return {
      message: "Transaction is not confirmed yet. Try again in a moment.",
      status: "pending",
    };
  }

  if (existingTransaction.status === "failed") {
    return {
      message: existingTransaction.failureReason ?? "Yield transaction failed on-chain.",
      status: "failed",
    };
  }

  return {
    balances: await dependencies.getUserBalancesByUserId(userId),
    position: await dependencies.getYieldPositionByUserId(userId),
    status: "confirmed",
    transaction: existingTransaction,
  };
}

function findMatchingYieldTransfer(input: {
  action: YieldAction;
  amountRaw: string;
  asset: YieldAsset;
  parsedTransaction: AlchemyParsedTransactionResult;
  user: AppUser;
}) {
  const userWalletAddress = input.user.solanaAddress;

  if (!userWalletAddress) {
    return null;
  }

  const usersByAddress = new Map([[userWalletAddress, input.user]]);
  const expectedDirection = input.action === "deposit" ? "outbound" : "inbound";
  const normalizedEntries = normalizeAlchemyTransaction({
    parsedTransaction: input.parsedTransaction,
    signature: "yield-validation",
    usersByAddress,
  });

  return (
    normalizedEntries.find(
      entry =>
        entry.entryType === (input.action === "deposit" ? "yield_deposit" : "yield_withdraw") &&
        entry.direction === expectedDirection &&
        entry.asset === input.asset &&
        entry.amountRaw === input.amountRaw &&
        entry.trackedWalletAddress === userWalletAddress,
    ) ?? null
  );
}
