import type {
  AppUser,
  AuthIdentity,
  BridgeComplianceState,
  BridgeKycStatus,
  BridgeTosStatus,
} from "../types.js";
import { buildStoredBridgeComplianceState, createBridgeKycLink } from "./bridge.js";
import { createUser, getUserByCdpUserId, updateUserBridgeStatuses } from "../db.js";
import {
  completeBridgeRequestSession,
  getOrCreateBridgeRequestSession,
} from "../services/bridgeRequestSessionsService.js";

export interface OnboardingSubmission {
  accountType: AppUser["accountType"];
  businessName?: string;
  countryCode: string;
  countryName: string;
  fullName: string;
  requestId: string;
}

interface CreateBridgeKycLinkResult {
  customerId: string;
  id: string;
  kycLink: string;
  kycStatus: BridgeKycStatus;
  tosLink: string;
  tosStatus: BridgeTosStatus;
}

interface OnboardingFlowDependencies {
  createBridgeKycLink: (input: {
    accountType: AppUser["accountType"];
    cdpUserId: string;
    email: string;
    fullName: string;
    idempotencyKey: string;
  }) => Promise<CreateBridgeKycLinkResult>;
  createUser: typeof createUser;
  getUserByCdpUserId: typeof getUserByCdpUserId;
  completeBridgeRequestSession: typeof completeBridgeRequestSession;
  getOrCreateBridgeRequestSession: typeof getOrCreateBridgeRequestSession;
  updateUserBridgeStatuses: typeof updateUserBridgeStatuses;
}

export class OnboardingFlowError extends Error {
  constructor(
    message: string,
    readonly originalError: unknown,
    readonly cdpUserId: string,
    readonly stage: "create_bridge_link" | "create_local_user" | "persist_bridge_link",
    readonly bridgeRequestAttempted: boolean,
  ) {
    super(message, {
      cause: originalError instanceof Error ? originalError : undefined,
    });
    this.name = "OnboardingFlowError";
  }
}

const defaultDependencies: OnboardingFlowDependencies = {
  createBridgeKycLink,
  createUser,
  completeBridgeRequestSession,
  getUserByCdpUserId,
  getOrCreateBridgeRequestSession,
  updateUserBridgeStatuses,
};

function buildBridgeFullName(user: AppUser) {
  if (user.accountType === "business") {
    return user.businessName?.trim() || user.fullName;
  }

  return user.fullName;
}

function buildPendingUserInput(identity: AuthIdentity, submission: OnboardingSubmission) {
  return {
    accountType: submission.accountType,
    businessName: submission.businessName,
    cdpUserId: identity.cdpUserId,
    countryCode: submission.countryCode,
    countryName: submission.countryName,
    email: identity.email!,
    fullName: submission.fullName,
  };
}

export function requiresOnboarding(user: AppUser | null) {
  return !user || !user.bridgeCustomerId;
}

export async function executeOnboardingFlow(
  identity: AuthIdentity,
  submission: OnboardingSubmission,
  dependencies: OnboardingFlowDependencies = defaultDependencies,
): Promise<{
  bridge: BridgeComplianceState;
  createdLocalUser: boolean;
  user: AppUser;
}> {
  const existingUser = await dependencies.getUserByCdpUserId(identity.cdpUserId);
  if (existingUser?.bridgeCustomerId) {
    return {
      bridge: buildStoredBridgeComplianceState(existingUser),
      createdLocalUser: false,
      user: existingUser,
    };
  }

  let user = existingUser;
  let createdLocalUser = false;

  if (!user) {
    try {
      user = await dependencies.createUser(buildPendingUserInput(identity, submission));
      createdLocalUser = true;
    } catch (error) {
      throw new OnboardingFlowError(
        "Unable to create a local onboarding user.",
        error,
        identity.cdpUserId,
        "create_local_user",
        false,
      );
    }
  }

  let bridgeKycLink: CreateBridgeKycLinkResult;

  try {
    const bridgeRequestSession = await dependencies.getOrCreateBridgeRequestSession({
      operationType: "kyc_link",
      requestId: submission.requestId,
      payload: {
        accountType: user.accountType,
        cdpUserId: identity.cdpUserId,
        email: identity.email!,
        fullName: buildBridgeFullName(user),
      },
      userId: user.id,
      cdpUserId: identity.cdpUserId,
    });

    bridgeKycLink = await dependencies.createBridgeKycLink({
      accountType: user.accountType,
      cdpUserId: identity.cdpUserId,
      email: identity.email!,
      fullName: buildBridgeFullName(user),
      idempotencyKey: bridgeRequestSession.idempotencyKey,
    });
    await dependencies.completeBridgeRequestSession({
      operationType: "kyc_link",
      requestId: submission.requestId,
      bridgeObjectId: bridgeKycLink.id,
    });
  } catch (error) {
    throw new OnboardingFlowError(
      "Unable to create a Bridge KYC link.",
      error,
      identity.cdpUserId,
      "create_bridge_link",
      true,
    );
  }

  try {
    const completedUser = await dependencies.updateUserBridgeStatuses({
      bridgeCustomerId: bridgeKycLink.customerId,
      bridgeKycLink: bridgeKycLink.kycLink,
      bridgeKycLinkId: bridgeKycLink.id,
      bridgeKycStatus: bridgeKycLink.kycStatus,
      bridgeTosLink: bridgeKycLink.tosLink,
      bridgeTosStatus: bridgeKycLink.tosStatus,
      userId: user.id,
    });

    return {
      bridge: buildStoredBridgeComplianceState(completedUser),
      createdLocalUser,
      user: completedUser,
    };
  } catch (error) {
    throw new OnboardingFlowError(
      "Unable to persist Bridge onboarding state locally.",
      error,
      identity.cdpUserId,
      "persist_bridge_link",
      true,
    );
  }
}
