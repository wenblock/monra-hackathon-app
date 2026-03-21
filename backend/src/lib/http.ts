import type { Response } from "express";

export function sendError(response: Response, status: number, error: string) {
  const requestId =
    response.req && typeof response.req.requestId === "string" ? response.req.requestId : undefined;

  return response.status(status).json({
    error,
    ...(requestId ? { requestId } : {}),
  });
}
