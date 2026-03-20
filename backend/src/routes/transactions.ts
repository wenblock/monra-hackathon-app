import { Router, type Request } from "express";

import {
  getUserBalancesByUserId,
  getUserByCdpUserId,
  listTransactionsByUserIdPaginated,
} from "../db.js";
import { validateAccessToken } from "../auth/validateAccessToken.js";
import { createStreamToken, verifyStreamToken } from "../lib/streamToken.js";
import {
  registerTransactionStream,
  sendTransactionSnapshot,
} from "../lib/transactionStream.js";
import { buildTreasuryValuation, getTreasuryPrices } from "../lib/alchemy.js";
import { sendError } from "../lib/http.js";

export const transactionsRouter = Router();

transactionsRouter.get("/", async (request, response) => {
  try {
    const accessToken = extractAccessToken(request);
    if (!accessToken) {
      return sendError(response, 400, "Missing access token.");
    }

    const identity = await validateAccessToken(accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    const limit = readLimitFromQuery(request.query.limit);
    const cursor = readCursorFromQuery(request.query.cursor);
    const result = await listTransactionsByUserIdPaginated(user.id, { cursor, limit });
    return response.json(result);
  } catch (error) {
    console.error(error);

    if (isUnauthorizedTokenError(error)) {
      return sendError(response, 401, "Invalid or expired CDP access token.");
    }

    return sendError(response, 500, "Unable to load transactions.");
  }
});

transactionsRouter.post("/stream-token", async (request, response) => {
  try {
    const accessToken = extractAccessToken(request);
    if (!accessToken) {
      return sendError(response, 400, "Missing access token.");
    }

    const identity = await validateAccessToken(accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    const streamToken = createStreamToken(identity.cdpUserId);

    return response.json({
      token: streamToken.token,
      expiresAt: streamToken.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error(error);

    if (isUnauthorizedTokenError(error)) {
      return sendError(response, 401, "Invalid or expired CDP access token.");
    }

    return sendError(response, 500, "Unable to create transaction stream token.");
  }
});

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

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    const [balances, transactionPage, treasuryPrices] = await Promise.all([
      getUserBalancesByUserId(user.id),
      listTransactionsByUserIdPaginated(user.id, { limit: 5 }),
      getTreasuryPrices(),
    ]);

    sendTransactionSnapshot(response, {
      balances,
      valuation: buildTreasuryValuation(balances, treasuryPrices),
      transactions: transactionPage.transactions,
    });
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
    console.error(error);

    if (isUnauthorizedTokenError(error) || isInvalidStreamTokenError(error)) {
      return sendError(response, 401, "Invalid or expired transaction stream token.");
    }

    return sendError(response, 500, "Unable to open transaction stream.");
  }
});

function extractAccessToken(request: Request) {
  const authorizationHeader =
    typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

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

function isUnauthorizedTokenError(error: unknown) {
  return error instanceof Error && /access token/i.test(error.message);
}

function isInvalidStreamTokenError(error: unknown) {
  return error instanceof Error && /stream token/i.test(error.message);
}
