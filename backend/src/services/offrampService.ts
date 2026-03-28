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
import {
  completeBridgeRequestSession,
  getOrCreateBridgeRequestSession,
} from "./bridgeRequestSessionsService.js";
import { syncBridgeStatus } from "./bridgeStatusService.js";
import { ServiceError } from "./errors.js";

interface OfframpServiceDependencies {
  completeBridgeRequestSession: typeof completeBridgeRequestSession;
  createBridgeOfframpTransfer: typeof createBridgeOfframpTransfer;
  createPendingOfframpTransaction: typeof createPendingOfframpTransaction;
  getRecipientByIdForUser: typeof getRecipientByIdForUser;
  getRecipientByPublicIdForUser: typeof getRecipientByPublicIdForUser;
  getOrCreateBridgeRequestSession: typeof getOrCreateBridgeRequestSession;
  syncBridgeStatus: typeof syncBridgeStatus;
}

const defaultDependencies: OfframpServiceDependencies = {
  completeBridgeRequestSession,
  createBridgeOfframpTransfer,
  createPendingOfframpTransaction,
  getRecipientByIdForUser,
  getRecipientByPublicIdForUser,
  getOrCreateBridgeRequestSession,
  syncBridgeStatus,
};

export async function createOfframpForUser(input: {
  amount: string;
  sourceAsset: OfframpSourceAsset;
  recipientId?: number;
  recipientPublicId?: string;
  requestId: string;
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

    const bridgeRequestSession = await dependencies.getOrCreateBridgeRequestSession({
      operationType: "offramp_transfer",
      requestId: input.requestId,
      payload: {
        amount: input.amount,
        bridgeCustomerId: input.user.bridgeCustomerId,
        externalAccountId: recipient.bridgeExternalAccountId,
        returnAddress: input.user.solanaAddress,
        sourceAddress: input.user.solanaAddress,
        sourceAsset: input.sourceAsset,
      },
      userId: input.user.id,
      cdpUserId: input.user.cdpUserId,
    });

    const bridgeTransfer = await dependencies.createBridgeOfframpTransfer({
      amount: input.amount,
      bridgeCustomerId: input.user.bridgeCustomerId,
      clientReferenceId: input.requestId,
      externalAccountId: recipient.bridgeExternalAccountId,
      idempotencyKey: bridgeRequestSession.idempotencyKey,
      returnAddress: input.user.solanaAddress,
      sourceAddress: input.user.solanaAddress,
      sourceAsset: input.sourceAsset,
    });
    await dependencies.completeBridgeRequestSession({
      operationType: "offramp_transfer",
      requestId: input.requestId,
      bridgeObjectId: bridgeTransfer.bridgeTransferId,
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
