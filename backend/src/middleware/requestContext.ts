import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

import { logInfo } from "../lib/logger.js";

export const requestContextMiddleware: RequestHandler = (request, response, next) => {
  const requestIdHeader =
    typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : null;
  const requestId = requestIdHeader?.trim() || randomUUID();
  const startedAt = Date.now();

  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  response.on("finish", () => {
    logInfo("request.completed", {
      durationMs: Date.now() - startedAt,
      method: request.method,
      path: request.originalUrl,
      requestId,
      statusCode: response.statusCode,
    });
  });

  next();
};
