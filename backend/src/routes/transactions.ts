import { Router } from "express";

import { readAppUser, requireAppUser } from "../auth/requestAuth.js";
import { getUserByCdpUserId } from "../db/repositories/usersRepo.js";
import {
  createStreamToken,
  isInvalidStreamTokenError,
  verifyStreamToken,
} from "../lib/streamToken.js";
import {
  buildLatestTransactionSnapshot,
  registerTransactionStream,
  sendTransactionSnapshot,
} from "../lib/transactionStream.js";
import { sendError } from "../lib/http.js";
import { logError, logInfo } from "../lib/logger.js";
import { highCostUserActionRateLimit } from "../middleware/rateLimits.js";
import { listTransactionsPage } from "../services/transactionsService.js";

export const transactionsRouter = Router();

transactionsRouter.get("/", requireAppUser, async (request, response) => {
  try {
    const user = readAppUser(request);

    const limit = readLimitFromQuery(request.query.limit);
    const cursor = readCursorFromQuery(request.query.cursor);
    const result = await listTransactionsPage(user.id, { cursor, limit });
    return response.json(result);
  } catch (error) {
    logError("transactions.list_failed", error, {
      requestId: request.requestId,
    });

    return sendError(response, 500, "Unable to load transactions.");
  }
});

transactionsRouter.post(
  "/stream-token",
  requireAppUser,
  highCostUserActionRateLimit,
  async (request, response) => {
    try {
      const user = readAppUser(request);

      const streamToken = createStreamToken(user.cdpUserId);

      return response.json({
        token: streamToken.token,
        expiresAt: streamToken.expiresAt.toISOString(),
      });
    } catch (error) {
      logError("transactions.stream_token_failed", error, {
        requestId: request.requestId,
      });

      return sendError(response, 500, "Unable to create transaction stream token.");
    }
  },
);

transactionsRouter.get("/stream", async (request, response) => {
  try {
    const streamToken = readTokenFromQuery(request.query.streamToken);
    if (!streamToken) {
      return sendError(response, 400, "Missing stream token.");
    }

    const tokenPayload = verifyStreamToken(streamToken);
    const user = await getUserByCdpUserId(tokenPayload.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    const snapshotStartedAt = Date.now();
    const initialSnapshot = await buildLatestTransactionSnapshot(user.id);
    logInfo("transactions.stream_initial_snapshot_built", {
      durationMs: Date.now() - snapshotStartedAt,
      userId: user.id,
    });

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    sendTransactionSnapshot(response, initialSnapshot);
    const unregister = registerTransactionStream(user.id, response);
    const heartbeat = setInterval(() => {
      response.write(": ping\n\n");
    }, 25000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unregister();
      response.end();
    });
  } catch (error) {
    logError("transactions.stream_open_failed", error, {
      requestId: request.requestId,
    });

    if (isInvalidStreamTokenError(error)) {
      return sendError(response, 401, "Invalid or expired transaction stream token.");
    }

    return sendError(response, 500, "Unable to open transaction stream.");
  }
});

function readTokenFromQuery(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readCursorFromQuery(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readLimitFromQuery(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
