import express, { Router, type Request } from "express";

import {
  validateAlchemyWebhookSignature,
} from "../lib/alchemy.js";
import {
  describeBridgeWebhookSignatureHeader,
  validateBridgeWebhookSignature,
} from "../lib/bridge.js";
import { extractBridgeTransferWebhookEvent } from "../lib/bridgeWebhook.js";
import { sendError } from "../lib/http.js";
import { logError, logWarn } from "../lib/logger.js";
import { isServiceError } from "../services/errors.js";
import {
  processAlchemyAddressActivityEvent,
  processBridgeTransferWebhookEvent,
} from "../services/webhooksService.js";

export const bridgeWebhookRouter = Router();
export const alchemyWebhookRouter = Router();

function isJsonWebhookRequest(request: Request) {
  return Boolean(request.is("application/json"));
}

bridgeWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    try {
      if (!isJsonWebhookRequest(request)) {
        return sendError(response, 415, "Webhook requests must use Content-Type: application/json.");
      }

      const rawBody = request.body;
      if (!Buffer.isBuffer(rawBody)) {
        return sendError(response, 400, "Webhook body must be raw JSON.");
      }

      const signatureHeader = request.header("X-Webhook-Signature");
      const verification =
        typeof signatureHeader === "string"
          ? validateBridgeWebhookSignature(rawBody, signatureHeader)
          : { error: "Missing Bridge webhook signature.", isValid: false };

      if (!verification.isValid) {
        logWarn("webhooks.bridge_signature_invalid", {
          error: verification.error ?? "Invalid Bridge webhook signature.",
          requestId: request.requestId,
          ...(process.env.NODE_ENV !== "production"
            ? {
                signatureHeader:
                  typeof signatureHeader === "string"
                    ? describeBridgeWebhookSignatureHeader(signatureHeader)
                    : { missing: true },
              }
            : {}),
        });

        return sendError(response, 401, verification.error ?? "Invalid Bridge webhook signature.");
      }

      const payload = JSON.parse(rawBody.toString("utf8")) as unknown;
      const event = extractBridgeTransferWebhookEvent(payload);

      if (!event) {
        return response.status(200).json({ ignored: true });
      }

      const result = await processBridgeTransferWebhookEvent({
        bridgeDestinationTxHash: event.bridgeDestinationTxHash,
        bridgeTransferId: event.bridgeTransferId,
        bridgeTransferStatus: event.bridgeTransferStatus,
        destinationAmountDecimal: event.destinationAmountDecimal,
        eventCreatedAt: event.eventCreatedAt ? new Date(event.eventCreatedAt) : null,
        eventId: event.eventId,
        eventObjectId: event.eventObjectId,
        receiptUrl: event.receiptUrl,
        webhookId: event.webhookId,
      });

      return response.status(200).json({
        applied: result.applied,
        affectedUsers: result.affectedUserIds.length,
      });
    } catch (error) {
      logError("webhooks.bridge_processing_failed", error, {
        requestId: request.requestId,
      });

      if (error instanceof SyntaxError) {
        return sendError(response, 400, "Webhook payload must be valid JSON.");
      }

      if (isServiceError(error)) {
        return sendError(response, error.status, error.message);
      }

      return sendError(response, 500, "Unable to process Bridge webhook.");
    }
  },
);

alchemyWebhookRouter.post(
  "/address-activity",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    try {
      if (!isJsonWebhookRequest(request)) {
        return sendError(response, 415, "Webhook requests must use Content-Type: application/json.");
      }

      const rawBody = request.body;
      if (!Buffer.isBuffer(rawBody)) {
        return sendError(response, 400, "Webhook body must be raw JSON.");
      }

      const signatureHeader = request.header("X-Alchemy-Signature");
      if (!signatureHeader || !validateAlchemyWebhookSignature(rawBody, signatureHeader)) {
        logWarn("webhooks.alchemy_signature_invalid", {
          requestId: request.requestId,
        });
        return sendError(response, 401, "Invalid webhook signature.");
      }

      const result = await processAlchemyAddressActivityEvent({
        payload: JSON.parse(rawBody.toString("utf8")) as unknown,
        requestId: request.requestId,
      });

      return response.status(200).json({
        applied: result.applied,
        affectedUsers: result.affectedUsers,
        ...(result.ignored ? { ignored: true } : {}),
      });
    } catch (error) {
      logError("webhooks.alchemy_processing_failed", error, {
        requestId: request.requestId,
      });

      if (error instanceof SyntaxError) {
        return sendError(response, 400, "Webhook payload must be valid JSON.");
      }

      if (isServiceError(error)) {
        return sendError(response, error.status, error.message);
      }

      return sendError(response, 500, "Unable to process Alchemy webhook.");
    }
  },
);
