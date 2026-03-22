import { createPendingOnrampTransaction } from "../db/repositories/transactionsWriteRepo.js";
import { createBridgeOnrampTransfer, isBridgeApiError } from "../lib/bridge.js";
import type { AppUser, OnrampDestinationAsset } from "../types.js";
import { syncBridgeStatus } from "./bridgeStatusService.js";
import { ServiceError } from "./errors.js";

interface OnrampServiceDependencies {
  createBridgeOnrampTransfer: typeof createBridgeOnrampTransfer;
  createPendingOnrampTransaction: typeof createPendingOnrampTransaction;
  syncBridgeStatus: typeof syncBridgeStatus;
}

const defaultDependencies: OnrampServiceDependencies = {
  createBridgeOnrampTransfer,
  createPendingOnrampTransaction,
  syncBridgeStatus,
};

export async function createOnrampForUser(input: {
  amount: string;
  destinationAsset: OnrampDestinationAsset;
  user: AppUser;
}, dependencies: OnrampServiceDependencies = defaultDependencies) {
  if (!input.user.bridgeCustomerId) {
    throw new ServiceError("Bridge onboarding must be completed before using on-ramp.", 409);
  }

  if (!input.user.solanaAddress) {
    throw new ServiceError("Your Solana wallet is still syncing. Try again in a moment.", 409);
  }

  try {
    const synced = await dependencies.syncBridgeStatus(input.user);
    if (synced.bridge.customerStatus !== "active" || !synced.bridge.hasAcceptedTermsOfService) {
      throw new ServiceError("Bridge onboarding must be active before creating an on-ramp.", 409);
    }

    const bridgeTransfer = await dependencies.createBridgeOnrampTransfer({
      amount: input.amount,
      bridgeCustomerId: input.user.bridgeCustomerId,
      destinationAddress: input.user.solanaAddress,
      destinationAsset: input.destinationAsset,
    });

    return dependencies.createPendingOnrampTransaction({
      asset: input.destinationAsset,
      userId: input.user.id,
      walletAddress: input.user.solanaAddress,
      bridgeTransferId: bridgeTransfer.bridgeTransferId,
      bridgeTransferStatus: bridgeTransfer.bridgeTransferStatus,
      sourceAmount: bridgeTransfer.sourceAmount,
      sourceCurrency: bridgeTransfer.sourceCurrency,
      expectedDestinationAmount: bridgeTransfer.destinationAmount,
      depositInstructions: bridgeTransfer.depositInstructions,
      receiptUrl: bridgeTransfer.receiptUrl,
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
