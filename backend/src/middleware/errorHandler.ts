import type { ErrorRequestHandler } from "express";

import { sendError } from "../lib/http.js";
import { logError } from "../lib/logger.js";

const CORS_ORIGIN_ERROR_NAME = "CorsOriginError";

function readErrorType(error: unknown) {
  return !!error && typeof error === "object" && "type" in error ? error.type : null;
}

function readErrorStatus(error: unknown) {
  return !!error && typeof error === "object" && "status" in error ? error.status : null;
}

export function createCorsOriginError() {
  const error = new Error("Origin is not allowed by CORS.");
  error.name = CORS_ORIGIN_ERROR_NAME;
  return error;
}

export function classifyHttpError(error: unknown) {
  if (error instanceof Error && error.name === CORS_ORIGIN_ERROR_NAME) {
    return {
      message: "Origin is not allowed by CORS.",
      status: 403,
    };
  }

  if (
    readErrorType(error) === "entity.parse.failed" ||
    (error instanceof SyntaxError && readErrorStatus(error) === 400)
  ) {
    return {
      message: "Request body must be valid JSON.",
      status: 400,
    };
  }

  return {
    message: "Internal server error.",
    status: 500,
  };
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    return next(error);
  }

  const classifiedError = classifyHttpError(error);
  logError("request.unhandled_error", error, {
    method: request.method,
    path: request.originalUrl,
    requestId: request.requestId,
    statusCode: classifiedError.status,
  });

  return sendError(response, classifiedError.status, classifiedError.message);
};
