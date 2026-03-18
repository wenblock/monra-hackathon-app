import type { Response } from "express";

export function sendError(response: Response, status: number, error: string) {
  return response.status(status).json({ error });
}
