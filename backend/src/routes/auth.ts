import { Router } from "express";
import { z } from "zod";

import { validateAccessToken } from "../auth/validateAccessToken.js";
import { getUserByCdpUserId } from "../db.js";
import { buildStoredBridgeComplianceState, syncBridgeStatus } from "../lib/bridge.js";
import { sendError } from "../lib/http.js";

const sessionSchema = z.object({
  accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
});

export const authRouter = Router();

authRouter.post("/session", async (request, response) => {
  try {
    const parsedBody = sessionSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const identity = await validateAccessToken(parsedBody.data.accessToken);
    if (!identity.email) {
      return sendError(response, 400, "Authenticated email is required to continue.");
    }

    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return response.json({
        bridge: null,
        status: "needs_onboarding",
        identity,
        user: null,
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
        console.error("Unable to refresh Bridge status during bootstrap.", bridgeError);
      }
    }

    return response.json({
      bridge,
      status: "active",
      identity,
      user: syncedUser,
    });
  } catch (error) {
    console.error(error);
    return sendError(response, 401, "Invalid or expired CDP access token.");
  }
});
