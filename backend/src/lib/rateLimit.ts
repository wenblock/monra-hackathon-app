import type { Request, RequestHandler } from "express";

import { sendError } from "./http.js";
import { logWarn } from "./logger.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  keyGenerator: (request: Request) => string | null;
  max: number;
  message?: string;
  name: string;
  windowMs: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
let lastPrunedAt = 0;

function pruneExpiredEntries(now: number) {
  if (now - lastPrunedAt < 60_000) {
    return;
  }

  for (const [key, value] of rateLimitStore) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }

  lastPrunedAt = now;
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  return (request, response, next) => {
    const key = options.keyGenerator(request);
    if (!key) {
      return next();
    }

    const now = Date.now();
    pruneExpiredEntries(now);

    const entryKey = `${options.name}:${key}`;
    const existingEntry = rateLimitStore.get(entryKey);
    const entry =
      existingEntry && existingEntry.resetAt > now
        ? existingEntry
        : { count: 0, resetAt: now + options.windowMs };

    entry.count += 1;
    rateLimitStore.set(entryKey, entry);

    const remaining = Math.max(options.max - entry.count, 0);
    response.setHeader("X-RateLimit-Limit", String(options.max));
    response.setHeader("X-RateLimit-Remaining", String(remaining));
    response.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count <= options.max) {
      return next();
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    response.setHeader("Retry-After", String(retryAfterSeconds));
    logWarn("rate_limit.exceeded", {
      key,
      limit: options.max,
      name: options.name,
      path: request.originalUrl,
      requestId: request.requestId,
      retryAfterSeconds,
    });

    return sendError(response, 429, options.message ?? "Too many requests. Please try again later.");
  };
}

export function getIpRateLimitKey(request: Request) {
  return request.ip || request.socket.remoteAddress || null;
}

export function getAuthenticatedUserRateLimitKey(request: Request) {
  return request.appUser?.id ? `user:${request.appUser.id}` : getIpRateLimitKey(request);
}

export function resetRateLimitStoreForTests() {
  rateLimitStore.clear();
  lastPrunedAt = 0;
}
