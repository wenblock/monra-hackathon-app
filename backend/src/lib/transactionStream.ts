import { setTimeout as scheduleTimeout } from "node:timers";

import type { Response } from "express";
import { Client } from "pg";

import { config } from "../config.js";
import {
  getUserBalancesByUserId,
  listTransactionsByUserIdPaginated,
} from "../db.js";
import {
  getTransactionStreamChannelName,
  getTransactionStreamEventById,
  publishTransactionStreamEvent,
} from "../db/runtime.js";
import { buildTreasuryValuation, getTreasuryPrices } from "./alchemy.js";
import type { SolanaBalancesResponse, TransactionStreamResponse } from "../types.js";

const userStreams = new Map<number, Set<Response>>();
let listenerClient: Client | null = null;
let initializePromise: Promise<void> | null = null;
let listenerState: "connecting" | "degraded" | "idle" | "ready" = "idle";
let reconnectTimer: NodeJS.Timeout | null = null;

export function registerTransactionStream(userId: number, response: Response) {
  const currentStreams = userStreams.get(userId) ?? new Set<Response>();
  currentStreams.add(response);
  userStreams.set(userId, currentStreams);

  return () => {
    const nextStreams = userStreams.get(userId);
    if (!nextStreams) {
      return;
    }

    nextStreams.delete(response);
    if (nextStreams.size === 0) {
      userStreams.delete(userId);
    }
  };
}

export function sendTransactionSnapshot(response: Response, payload: TransactionStreamResponse) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function buildLatestTransactionSnapshot(
  userId: number,
  balancesOverride?: SolanaBalancesResponse["balances"],
): Promise<TransactionStreamResponse> {
  const [balances, transactionPage, treasuryPrices] = await Promise.all([
    balancesOverride ? Promise.resolve(balancesOverride) : getUserBalancesByUserId(userId),
    listTransactionsByUserIdPaginated(userId, { limit: 5 }),
    getTreasuryPrices(),
  ]);

  return {
    balances,
    valuation: buildTreasuryValuation(balances, treasuryPrices),
    transactions: transactionPage.transactions,
  };
}

function broadcastTransactionSnapshotLocal(userId: number, payload: TransactionStreamResponse) {
  const streams = userStreams.get(userId);
  if (!streams || streams.size === 0) {
    return;
  }

  for (const response of streams) {
    sendTransactionSnapshot(response, payload);
  }
}

export async function initializeTransactionStream() {
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = connectTransactionStreamListener().catch(error => {
    initializePromise = null;
    markTransactionStreamDegraded();
    throw error;
  });

  return initializePromise;
}

export async function closeTransactionStream() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  initializePromise = null;
  listenerState = "idle";

  if (!listenerClient) {
    return;
  }

  const client = listenerClient;
  listenerClient = null;
  client.removeAllListeners();
  await client.end().catch(() => undefined);
}

export function isTransactionStreamReady() {
  return listenerState === "ready";
}

export async function broadcastTransactionSnapshot(userId: number, payload: TransactionStreamResponse) {
  await publishTransactionStreamEvent(userId, payload);

  if (!isTransactionStreamReady()) {
    broadcastTransactionSnapshotLocal(userId, payload);
  }
}

export async function broadcastLatestTransactionSnapshot(
  userId: number,
  balancesOverride?: SolanaBalancesResponse["balances"],
) {
  const payload = await buildLatestTransactionSnapshot(userId, balancesOverride);
  await broadcastTransactionSnapshot(userId, payload);
  return payload;
}

async function connectTransactionStreamListener() {
  listenerState = "connecting";
  const client = new Client({
    connectionString: config.databaseUrl,
  });

  client.on("error", () => {
    markTransactionStreamDegraded();
  });
  client.on("end", () => {
    markTransactionStreamDegraded();
  });
  client.on("notification", notification => {
    if (notification.channel !== getTransactionStreamChannelName()) {
      return;
    }

    void handleTransactionStreamNotification(notification.payload);
  });

  await client.connect();
  await client.query(`LISTEN ${getTransactionStreamChannelName()}`);

  listenerClient = client;
  listenerState = "ready";
}

async function handleTransactionStreamNotification(payload: string | undefined) {
  const parsedId = Number.parseInt(payload ?? "", 10);
  if (!Number.isFinite(parsedId)) {
    return;
  }

  const event = await getTransactionStreamEventById(parsedId);
  if (!event) {
    return;
  }

  broadcastTransactionSnapshotLocal(event.userId, event.payload);
}

function markTransactionStreamDegraded() {
  initializePromise = null;
  listenerState = "degraded";

  if (listenerClient) {
    const client = listenerClient;
    listenerClient = null;
    client.removeAllListeners();
    void client.end().catch(() => undefined);
  }

  if (reconnectTimer) {
    return;
  }

  reconnectTimer = scheduleTimeout(() => {
    reconnectTimer = null;
    void initializeTransactionStream().catch(() => undefined);
  }, 1000);
}
