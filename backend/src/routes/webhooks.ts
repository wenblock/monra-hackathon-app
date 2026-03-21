import express, { Router } from "express";

import {
  applyAlchemyWebhookEffects,
  applyBridgeTransferWebhookUpdate,
  getOfframpByBroadcastDetails,
  getRecipientByWalletAddressForUser,
  getSwapTransactionUserIdsBySignature,
  getPendingOnrampByDestinationTxHash,
  getUserBalancesByUserId,
  getUsersBySolanaAddresses,
  listTransactionsByUserIdPaginated,
  type WebhookLedgerEntryInput,
} from "../db.js";
import {
  buildTreasuryValuation,
  fetchSolanaParsedTransaction,
  getTreasuryPrices,
  isAlchemyApiError,
  isSolanaTransactionSuccessful,
  validateAlchemyWebhookSignature,
} from "../lib/alchemy.js";
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
import { broadcastTransactionSnapshot } from "../lib/transactionStream.js";
import { sendError } from "../lib/http.js";

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

bridgeWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    try {
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
        if (process.env.NODE_ENV !== "production") {
          console.warn("Bridge webhook signature verification failed.", {
            error: verification.error ?? "Invalid Bridge webhook signature.",
            signatureHeader:
              typeof signatureHeader === "string"
                ? describeBridgeWebhookSignatureHeader(signatureHeader)
                : { missing: true },
          });
        }

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
      console.error(error);

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
      const rawBody = request.body;
      if (!Buffer.isBuffer(rawBody)) {
        return sendError(response, 400, "Webhook body must be raw JSON.");
      }

      const signatureHeader = request.header("X-Alchemy-Signature");
      if (!signatureHeader || !validateAlchemyWebhookSignature(rawBody, signatureHeader)) {
        return sendError(response, 401, "Invalid webhook signature.");
      }

      const payload = JSON.parse(rawBody.toString("utf8")) as unknown;
      const event = extractAlchemyAddressActivityEvent(payload);

      if (!event || event.signatures.length === 0) {
        return response.status(200).json({ ignored: true });
      }

      const effects: AlchemyWebhookEffect[] = [];

      for (const signature of event.signatures) {
        const parsedTransaction = await fetchSolanaParsedTransaction(signature);
        if (!isSolanaTransactionSuccessful(parsedTransaction)) {
          console.warn("Skipping failed Solana transaction from Alchemy webhook.", {
            error: parsedTransaction.meta?.err ?? "missing transaction metadata",
            signature,
          });
          continue;
        }

        const candidateAddresses = extractCandidateWalletAddresses(parsedTransaction);
        const users = await getUsersBySolanaAddresses(candidateAddresses);

        if (users.length === 0) {
          continue;
        }

        const usersByAddress = new Map(
          users
            .filter(user => typeof user.solanaAddress === "string" && user.solanaAddress.length > 0)
            .map(user => [user.solanaAddress!, user]),
        );

        const normalizedEntries = normalizeAlchemyTransaction({
          parsedTransaction,
          signature,
          usersByAddress,
        });
        const swapUserIds = new Set(await getSwapTransactionUserIdsBySignature(signature));
        const pendingOnramp = await getPendingOnrampByDestinationTxHash(signature);

        for (const entry of normalizedEntries) {
          if (entry.entryType === "transfer" && swapUserIds.has(entry.userId)) {
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
              txHash: signature,
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
                txHash: signature,
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
              webhookEventId: event.eventId,
            },
            type: "ledger",
          });
        }
      }

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
      console.error(error);

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

async function broadcastLatestTransactionSnapshot(userId: number) {
  const [balances, transactionPage, treasuryPrices] = await Promise.all([
    getUserBalancesByUserId(userId),
    listTransactionsByUserIdPaginated(userId, { limit: 5 }),
    getTreasuryPrices(),
  ]);

  await broadcastTransactionSnapshot(userId, {
    balances,
    valuation: buildTreasuryValuation(balances, treasuryPrices),
    transactions: transactionPage.transactions,
  });
}
