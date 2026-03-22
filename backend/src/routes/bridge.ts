import { Router, type Request, type Response } from "express";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import {
  buildStoredBridgeComplianceState,
  isBridgeApiError,
} from "../lib/bridge.js";
import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";
import { syncBridgeStatus } from "../services/bridgeStatusService.js";

export const bridgeRouter = Router();

async function handleBridgeStatus(request: Request, response: Response) {
  try {
    const user = readAppUser(request);

    if (!user.bridgeCustomerId) {
      return response.json({
        bridge: buildStoredBridgeComplianceState(user),
        user,
      });
    }

    const synced = await syncBridgeStatus(user);
    return response.json(synced);
  } catch (error) {
    logError("bridge.status_failed", error, {
      requestId: request.requestId ?? null,
    });

    if (isBridgeApiError(error)) {
      return sendError(response, 502, error.message);
    }

    return sendError(response, 500, "Unable to sync Bridge status.");
  }
}

bridgeRouter.get("/status", requireAppUser, handleBridgeStatus);
bridgeRouter.post("/status", requireAppUser, handleBridgeStatus);
