import { Router } from "express";
import { z } from "zod";

import { validateAccessToken } from "../auth/validateAccessToken.js";
import { getUserByCdpUserId } from "../db.js";
import {
  buildStoredBridgeComplianceState,
  isBridgeApiError,
  syncBridgeStatus,
} from "../lib/bridge.js";
import { sendError } from "../lib/http.js";

const bridgeStatusSchema = z.object({
  accessToken: z.string().trim().min(1, "Missing accessToken parameter."),
});

export const bridgeRouter = Router();

bridgeRouter.post("/status", async (request, response) => {
  try {
    const parsedBody = bridgeStatusSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendError(response, 400, parsedBody.error.issues[0]?.message ?? "Invalid request.");
    }

    const identity = await validateAccessToken(parsedBody.data.accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    if (!user.bridgeCustomerId) {
      return response.json({
        bridge: buildStoredBridgeComplianceState(user),
        user,
      });
    }

    const synced = await syncBridgeStatus(user);
    return response.json(synced);
  } catch (error) {
    console.error(error);
    if (isBridgeApiError(error)) {
      return sendError(response, 502, error.message);
    }

    return sendError(response, 502, "Unable to sync Bridge status.");
  }
});
