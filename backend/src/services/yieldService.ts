import { getYieldLedgerSummaryByUserId, createConfirmedYieldTransaction } from "../db/repositories/transactionsWriteRepo.js";
import { fetchSolanaParsedTransaction, isAlchemyApiError, isSolanaTransactionSuccessful } from "../lib/alchemy.js";
import { getTransferAssetLabel } from "../lib/assets.js";
import { normalizeSwapAmount } from "../lib/amounts.js";
import { normalizeAlchemyTransaction } from "../lib/alchemyWebhook.js";
import { broadcastLatestTransactionSnapshot } from "../lib/transactionStream.js";
import { includesJupiterLendEarnInstruction } from "../lib/yield.js";
import type { AlchemyParsedTransactionResult } from "../lib/alchemy.js";
import type { AppUser, YieldAction, YieldAsset } from "../types.js";
import { ServiceError } from "./errors.js";

interface YieldServiceDependencies {
  broadcastLatestTransactionSnapshot: typeof broadcastLatestTransactionSnapshot;
  createConfirmedYieldTransaction: typeof createConfirmedYieldTransaction;
  fetchSolanaParsedTransaction: typeof fetchSolanaParsedTransaction;
  getYieldLedgerSummaryByUserId: typeof getYieldLedgerSummaryByUserId;
}

const defaultDependencies: YieldServiceDependencies = {
  broadcastLatestTransactionSnapshot,
  createConfirmedYieldTransaction,
  fetchSolanaParsedTransaction,
  getYieldLedgerSummaryByUserId,
};

export async function getYieldLedgerSummaryForUser(
  userId: number,
  dependencies: YieldServiceDependencies = defaultDependencies,
) {
  return dependencies.getYieldLedgerSummaryByUserId(userId);
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
    const parsedTransaction = await dependencies.fetchSolanaParsedTransaction(input.transactionSignature);

    if (!isSolanaTransactionSuccessful(parsedTransaction)) {
      throw new ServiceError("Yield transaction failed on-chain.", 409);
    }

    if (!includesJupiterLendEarnInstruction(parsedTransaction)) {
      throw new ServiceError("Transaction does not include a Jupiter Lend Earn instruction.", 409);
    }

    const matchedTransfer = findMatchingYieldTransfer({
      action: input.action,
      amountRaw: normalizedAmount.raw,
      asset: input.asset,
      parsedTransaction,
      user: input.user,
    });

    if (!matchedTransfer) {
      throw new ServiceError(
        `Confirmed transaction did not contain the expected ${input.action} transfer for ${getTransferAssetLabel(input.asset)}.`,
        409,
      );
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
    const ledgerSummary = await dependencies.getYieldLedgerSummaryByUserId(input.user.id);

    await dependencies.broadcastLatestTransactionSnapshot(
      input.user.id,
      createdYieldTransaction.balances,
    );

    return {
      ...createdYieldTransaction,
      ledgerSummary,
    };
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }

    if (isAlchemyApiError(error)) {
      if (error.status === 404) {
        throw new ServiceError("Transaction is not confirmed yet. Try again in a moment.", 409);
      }

      throw new ServiceError("Unable to validate the confirmed Solana transaction.", 502);
    }

    if (error instanceof Error && /amount/i.test(error.message)) {
      throw new ServiceError(error.message, 400);
    }

    throw error;
  }
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
