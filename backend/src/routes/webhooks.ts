import express, { Router, type Request } from "express";

import {
  applyAlchemyWebhookEffects,
  applyBridgeTransferWebhookUpdate,
  getOfframpByBroadcastDetails,
  getRecipientByWalletAddressForUser,
  getSwapTransactionUserIdsBySignature,
  getPendingOnrampByDestinationTxHash,
  getUsersBySolanaAddresses,
  type WebhookLedgerEntryInput,
} from "../db.js";
import {
  fetchSolanaParsedTransaction,
  isAlchemyApiError,
  isSolanaTransactionSuccessful,
  validateAlchemyWebhookSignature,
} from "../lib/alchemy.js";
import { mapWithConcurrency } from "../lib/async.js";
import { isOfframpSourceAsset } from "../lib/assets.js";
import {
  describeBridgeWebhookSignatureHeader,
  validateBridgeWebhookSignature,
} from "../lib/bridge.js";
import {
  extractAlchemyAddressActivityEvent,
  extractCandidateWalletAddresses,
  normalizeAlchemyTransaction,
} from "../lib/alchemyWebhook.js";
import { extractBridgeTransferWebhookEvent } from "../lib/bridgeWebhook.js";
import { config } from "../config.js";
import { sendError } from "../lib/http.js";
import { logError, logWarn } from "../lib/logger.js";
import { broadcastLatestTransactionSnapshot } from "../lib/transactionStream.js";

type AlchemyWebhookEffect =
  | {
      type: "ledger";
      entry: WebhookLedgerEntryInput;
    }
  | {
      type: "offramp_broadcast";
      transactionId: number;
      txHash: string;
      amountDecimal: string;
      amountRaw: string;
      fromWalletAddress: string;
      toWalletAddress?: string | null;
      confirmedAt: Date;
    }
  | {
      type: "onramp_completion";
      txHash: string;
      amountDecimal: string;
      amountRaw: string;
      fromWalletAddress: string;
      counterpartyName?: string | null;
      counterpartyWalletAddress?: string | null;
      confirmedAt: Date;
    };

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

      const result = await applyBridgeTransferWebhookUpdate({
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

      for (const userId of result.affectedUserIds) {
        await broadcastLatestTransactionSnapshot(userId);
      }

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

      const payload = JSON.parse(rawBody.toString("utf8")) as unknown;
      const event = extractAlchemyAddressActivityEvent(payload);

      if (!event || event.signatures.length === 0) {
        return response.status(200).json({ ignored: true });
      }

      const effectGroups = await mapWithConcurrency(
        event.signatures,
        config.alchemyWebhookConcurrency,
        signature =>
          buildAlchemyEffectsForSignature({
            requestId: request.requestId,
            signature,
            webhookEventId: event.eventId,
          }),
      );
      const effects = effectGroups.flat();

      const result = await applyAlchemyWebhookEffects({
        effects,
        eventCreatedAt: event.createdAt ? new Date(event.createdAt) : null,
        eventId: event.eventId,
        webhookId: event.webhookId,
      });

      for (const userId of result.affectedUserIds) {
        await broadcastLatestTransactionSnapshot(userId);
      }

      return response.status(200).json({
        applied: result.applied,
        affectedUsers: result.affectedUserIds.length,
      });
    } catch (error) {
      logError("webhooks.alchemy_processing_failed", error, {
        requestId: request.requestId,
      });

      if (error instanceof SyntaxError) {
        return sendError(response, 400, "Webhook payload must be valid JSON.");
      }

      if (isAlchemyApiError(error)) {
        return sendError(response, 502, "Unable to enrich Alchemy webhook transaction.");
      }

      return sendError(response, 500, "Unable to process Alchemy webhook.");
    }
  },
);

async function buildAlchemyEffectsForSignature(input: {
  requestId?: string;
  signature: string;
  webhookEventId: string;
}) {
  const parsedTransaction = await fetchSolanaParsedTransaction(input.signature);
  if (!isSolanaTransactionSuccessful(parsedTransaction)) {
    logWarn("webhooks.alchemy_skipped_failed_transaction", {
      error: parsedTransaction.meta?.err ?? "missing transaction metadata",
      requestId: input.requestId,
      signature: input.signature,
      webhookEventId: input.webhookEventId,
    });
    return [] as AlchemyWebhookEffect[];
  }

  const candidateAddresses = extractCandidateWalletAddresses(parsedTransaction);
  const [users, swapUserIds, pendingOnramp] = await Promise.all([
    getUsersBySolanaAddresses(candidateAddresses),
    getSwapTransactionUserIdsBySignature(input.signature),
    getPendingOnrampByDestinationTxHash(input.signature),
  ]);

  if (users.length === 0) {
    return [] as AlchemyWebhookEffect[];
  }

  const usersByAddress = new Map(
    users
      .filter(user => typeof user.solanaAddress === "string" && user.solanaAddress.length > 0)
      .map(user => [user.solanaAddress!, user]),
  );

  const normalizedEntries = normalizeAlchemyTransaction({
    parsedTransaction,
    signature: input.signature,
    usersByAddress,
  });
  const swapUserIdSet = new Set(swapUserIds);
  const effects: AlchemyWebhookEffect[] = [];

  for (const entry of normalizedEntries) {
    if (entry.entryType === "transfer" && swapUserIdSet.has(entry.userId)) {
      continue;
    }

    const matchesPendingOnramp =
      pendingOnramp &&
      entry.asset === pendingOnramp.asset &&
      entry.direction === "inbound" &&
      entry.entryType === "transfer" &&
      entry.userId === pendingOnramp.userId &&
      entry.trackedWalletAddress === pendingOnramp.trackedWalletAddress;

    if (matchesPendingOnramp) {
      effects.push({
        amountDecimal: entry.amountDecimal,
        amountRaw: entry.amountRaw,
        confirmedAt: entry.confirmedAt,
        counterpartyName: entry.counterpartyName ?? null,
        counterpartyWalletAddress: entry.counterpartyWalletAddress ?? null,
        fromWalletAddress: entry.fromWalletAddress,
        txHash: input.signature,
        type: "onramp_completion",
      });
      continue;
    }

    if (
      entry.entryType === "transfer" &&
      entry.direction === "outbound" &&
      isOfframpSourceAsset(entry.asset)
    ) {
      const pendingOfframp = await getOfframpByBroadcastDetails({
        amountRaw: entry.amountRaw,
        asset: entry.asset,
        trackedWalletAddress: entry.trackedWalletAddress,
        userId: entry.userId,
        walletAddress: entry.counterpartyWalletAddress ?? null,
      });

      if (pendingOfframp) {
        effects.push({
          amountDecimal: entry.amountDecimal,
          amountRaw: entry.amountRaw,
          confirmedAt: entry.confirmedAt,
          fromWalletAddress: entry.fromWalletAddress,
          toWalletAddress: entry.counterpartyWalletAddress ?? null,
          transactionId: pendingOfframp.id,
          txHash: input.signature,
          type: "offramp_broadcast",
        });
        continue;
      }
    }

    const recipient =
      entry.direction === "outbound" && entry.entryType === "transfer"
        ? await getRecipientByWalletAddressForUser(
            entry.userId,
            entry.counterpartyWalletAddress ?? null,
          )
        : null;

    effects.push({
      entry: {
        ...entry,
        counterpartyName:
          recipient?.displayName ??
          entry.counterpartyName ??
          null,
        recipientId: recipient?.id ?? null,
        webhookEventId: input.webhookEventId,
      },
      type: "ledger",
    });
  }

  return effects;
}
