import { config } from "../config.js";
import {
  applyAlchemyWebhookEffects,
  applyBridgeTransferWebhookUpdate,
  type WebhookLedgerEntryInput,
} from "../db/repositories/webhooksRepo.js";
import {
  getOfframpByBroadcastDetails,
  getPendingOnrampByDestinationTxHash,
  getSwapTransactionUserIdsBySignature,
} from "../db/repositories/transactionsReadRepo.js";
import { getRecipientByWalletAddressForUser } from "../db/repositories/recipientsRepo.js";
import { getUsersBySolanaAddresses } from "../db/repositories/usersRepo.js";
import {
  fetchSolanaParsedTransaction,
  isAlchemyApiError,
  isSolanaTransactionSuccessful,
} from "../lib/alchemy.js";
import { mapWithConcurrency } from "../lib/async.js";
import { isOfframpSourceAsset } from "../lib/assets.js";
import {
  extractAlchemyAddressActivityEvent,
  extractCandidateWalletAddresses,
  normalizeAlchemyTransaction,
} from "../lib/alchemyWebhook.js";
import { broadcastLatestTransactionSnapshot } from "../lib/transactionStream.js";
import { logWarn } from "../lib/logger.js";
import { ServiceError } from "./errors.js";

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

export async function processBridgeTransferWebhookEvent(input: {
  bridgeDestinationTxHash?: string | null;
  bridgeTransferId: string;
  bridgeTransferStatus: Parameters<typeof applyBridgeTransferWebhookUpdate>[0]["bridgeTransferStatus"];
  destinationAmountDecimal?: string | null;
  eventCreatedAt?: Date | null;
  eventId: string;
  eventObjectId: string;
  receiptUrl?: string | null;
  webhookId: string;
}) {
  const result = await applyBridgeTransferWebhookUpdate(input);

  for (const userId of result.affectedUserIds) {
    await broadcastLatestTransactionSnapshot(userId);
  }

  return result;
}

export async function processAlchemyAddressActivityEvent(input: {
  payload: unknown;
  requestId?: string;
}) {
  try {
    const event = extractAlchemyAddressActivityEvent(input.payload);

    if (!event || event.signatures.length === 0) {
      return {
        affectedUsers: 0,
        applied: false,
        ignored: true,
      };
    }

    const effectGroups = await mapWithConcurrency(
      event.signatures,
      config.alchemyWebhookConcurrency,
      signature =>
        buildAlchemyEffectsForSignature({
          requestId: input.requestId,
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

    return {
      affectedUsers: result.affectedUserIds.length,
      applied: result.applied,
      ignored: false,
    };
  } catch (error) {
    if (isAlchemyApiError(error)) {
      throw new ServiceError("Unable to enrich Alchemy webhook transaction.", 502);
    }

    throw error;
  }
}

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
