import express, { Router } from "express";

import {
  applyWebhookLedgerEntries,
  getUserBalancesByUserId,
  getUsersBySolanaAddresses,
  listTransactionsByUserIdPaginated,
  resolveRecipientIdByWalletAddressForUser,
  type WebhookLedgerEntryInput,
} from "../db.js";
import {
  fetchSolanaParsedTransaction,
  isAlchemyApiError,
  validateAlchemyWebhookSignature,
} from "../lib/alchemy.js";
import {
  extractAlchemyAddressActivityEvent,
  extractCandidateWalletAddresses,
  normalizeAlchemyTransaction,
} from "../lib/alchemyWebhook.js";
import { broadcastTransactionSnapshot } from "../lib/transactionStream.js";
import { sendError } from "../lib/http.js";

export const alchemyWebhookRouter = Router();

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

      const ledgerEntries: WebhookLedgerEntryInput[] = [];

      for (const signature of event.signatures) {
        const parsedTransaction = await fetchSolanaParsedTransaction(signature);
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

        for (const entry of normalizedEntries) {
          const recipientId =
            entry.direction === "outbound" && entry.entryType === "transfer"
              ? await resolveRecipientIdByWalletAddressForUser(
                  entry.userId,
                  entry.counterpartyWalletAddress ?? null,
                )
              : null;

          ledgerEntries.push({
            ...entry,
            recipientId,
            webhookEventId: event.eventId,
          });
        }
      }

      const result = await applyWebhookLedgerEntries({
        entries: ledgerEntries,
        eventCreatedAt: event.createdAt ? new Date(event.createdAt) : null,
        eventId: event.eventId,
        webhookId: event.webhookId,
      });

      for (const userId of result.affectedUserIds) {
        const [balances, transactionPage] = await Promise.all([
          getUserBalancesByUserId(userId),
          listTransactionsByUserIdPaginated(userId, { limit: 5 }),
        ]);

        broadcastTransactionSnapshot(userId, { balances, transactions: transactionPage.transactions });
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
