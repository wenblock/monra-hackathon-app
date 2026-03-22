import {
  getRecipientByIdForUser,
  getRecipientByPublicIdForUser,
} from "../db/repositories/recipientsRepo.js";
import { createPendingOfframpTransaction } from "../db/repositories/transactionsWriteRepo.js";
import {
  createBridgeOfframpTransfer,
  isBridgeApiError,
} from "../lib/bridge.js";
import type { AppUser, OfframpSourceAsset } from "../types.js";
import { syncBridgeStatus } from "./bridgeStatusService.js";
import { ServiceError } from "./errors.js";

interface OfframpServiceDependencies {
  createBridgeOfframpTransfer: typeof createBridgeOfframpTransfer;
  createPendingOfframpTransaction: typeof createPendingOfframpTransaction;
  getRecipientByIdForUser: typeof getRecipientByIdForUser;
  getRecipientByPublicIdForUser: typeof getRecipientByPublicIdForUser;
  syncBridgeStatus: typeof syncBridgeStatus;
}

const defaultDependencies: OfframpServiceDependencies = {
  createBridgeOfframpTransfer,
  createPendingOfframpTransaction,
  getRecipientByIdForUser,
  getRecipientByPublicIdForUser,
  syncBridgeStatus,
};

export async function createOfframpForUser(input: {
  amount: string;
  sourceAsset: OfframpSourceAsset;
  recipientId?: number;
  recipientPublicId?: string;
  user: AppUser;
}, dependencies: OfframpServiceDependencies = defaultDependencies) {
  if (!input.user.bridgeCustomerId) {
    throw new ServiceError("Bridge onboarding must be completed before using off-ramp.", 409);
  }

  if (!input.user.solanaAddress) {
    throw new ServiceError("Your Solana wallet is still syncing. Try again in a moment.", 409);
  }

  try {
    const recipient = input.recipientPublicId
      ? await dependencies.getRecipientByPublicIdForUser(input.user.id, input.recipientPublicId)
      : await dependencies.getRecipientByIdForUser(input.user.id, input.recipientId!);
    if (!recipient) {
      throw new ServiceError("Recipient not found.", 404);
    }

    if (recipient.kind !== "bank" || !recipient.bridgeExternalAccountId) {
      throw new ServiceError("Off-ramp requires a saved bank recipient.", 409);
    }

    const synced = await dependencies.syncBridgeStatus(input.user);
    if (synced.bridge.customerStatus !== "active" || !synced.bridge.hasAcceptedTermsOfService) {
      throw new ServiceError("Bridge onboarding must be active before creating an off-ramp.", 409);
    }

    const bridgeTransfer = await dependencies.createBridgeOfframpTransfer({
      amount: input.amount,
      bridgeCustomerId: input.user.bridgeCustomerId,
      externalAccountId: recipient.bridgeExternalAccountId,
      returnAddress: input.user.solanaAddress,
      sourceAddress: input.user.solanaAddress,
      sourceAsset: input.sourceAsset,
    });

    return dependencies.createPendingOfframpTransaction({
      amount: input.amount,
      asset: input.sourceAsset,
      bridgeTransferId: bridgeTransfer.bridgeTransferId,
      bridgeTransferStatus: bridgeTransfer.bridgeTransferStatus,
      depositInstructions: bridgeTransfer.depositInstructions,
      receiptUrl: bridgeTransfer.receiptUrl,
      recipientId: recipient.id,
      recipientName: recipient.displayName,
      sourceAmount: bridgeTransfer.sourceAmount,
      sourceCurrency: bridgeTransfer.sourceCurrency,
      userId: input.user.id,
      walletAddress: input.user.solanaAddress,
    });
  } catch (error) {
    if (isBridgeApiError(error)) {
      throw new ServiceError(error.message, 502);
    }

    if (error instanceof ServiceError) {
      throw error;
    }

    if (error instanceof Error && /amount/i.test(error.message)) {
      throw new ServiceError(error.message, 400);
    }

    throw error;
  }
}
