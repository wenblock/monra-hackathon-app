import { Router } from "express";

import { readAuthIdentity, requireAuthIdentity } from "../auth/requestAuth.js";
import { getUserByCdpUserId } from "../db.js";
import { buildStoredBridgeComplianceState, syncBridgeStatus } from "../lib/bridge.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { requiresOnboarding } from "../lib/onboardingFlow.js";
import { authSessionRateLimit } from "../middleware/rateLimits.js";
import type { AppUser } from "../types.js";

export const authRouter = Router();

export function getSessionStatus(user: AppUser | null) {
  return requiresOnboarding(user) ? "needs_onboarding" : "active";
}

authRouter.post("/session", authSessionRateLimit, requireAuthIdentity, async (request, response) => {
  try {
    const identity = readAuthIdentity(request);
    if (!identity.email) {
      return sendError(response, 400, "Authenticated email is required to continue.");
    }

    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user || getSessionStatus(user) === "needs_onboarding") {
      return response.json({
        bridge: null,
        status: "needs_onboarding",
        identity,
        user,
      });
    }

    let syncedUser = user;
    let bridge = buildStoredBridgeComplianceState(user);

    if (user.bridgeCustomerId) {
      try {
        const synced = await syncBridgeStatus(user);
        syncedUser = synced.user;
        bridge = synced.bridge;
      } catch (bridgeError) {
        logError("auth.bridge_status_refresh_failed", bridgeError, {
          cdpUserId: user.cdpUserId,
          requestId: request.requestId,
        });
      }
    }

    return response.json({
      bridge,
      status: "active",
      identity,
      user: syncedUser,
    });
  } catch (error) {
    logError("auth.session_bootstrap_failed", error, {
      requestId: request.requestId,
    });
    return sendError(response, 500, "Unable to bootstrap session.");
  }
});
