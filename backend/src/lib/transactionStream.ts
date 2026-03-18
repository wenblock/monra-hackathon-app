import type { Response } from "express";

import type { TransactionStreamResponse } from "../types.js";

const userStreams = new Map<number, Set<Response>>();

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

export function broadcastTransactionSnapshot(userId: number, payload: TransactionStreamResponse) {
  const streams = userStreams.get(userId);
  if (!streams || streams.size === 0) {
    return;
  }

  for (const response of streams) {
    sendTransactionSnapshot(response, payload);
  }
}
