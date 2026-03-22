import type { AppUser } from "../types.js";
import { buildStoredBridgeComplianceState, fetchBridgeCustomer } from "../lib/bridge.js";
import { updateUserBridgeStatuses } from "../db/repositories/usersRepo.js";

export async function syncBridgeStatus(user: AppUser) {
  if (!user.bridgeCustomerId) {
    return {
      bridge: buildStoredBridgeComplianceState(user),
      user,
    };
  }

  const customer = await fetchBridgeCustomer(user.bridgeCustomerId);
  const updatedUser = await updateUserBridgeStatuses({
    bridgeKycStatus: customer.status,
    bridgeTosStatus: customer.hasAcceptedTermsOfService ? "approved" : "pending",
    userId: user.id,
  });

  return {
    bridge: {
      customerStatus: customer.status,
      hasAcceptedTermsOfService: customer.hasAcceptedTermsOfService,
      showKycAlert: Boolean(updatedUser.bridgeKycLink && customer.status !== "active"),
      showTosAlert: Boolean(updatedUser.bridgeTosLink && !customer.hasAcceptedTermsOfService),
    },
    user: updatedUser,
  };
}
