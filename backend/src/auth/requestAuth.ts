import type { NextFunction, Request, Response } from "express";

import { getUserByCdpUserId } from "../db.js";
import { sendError } from "../lib/http.js";
import { InvalidAccessTokenError, isInvalidAccessTokenError } from "./errors.js";
import { validateAccessToken } from "./validateAccessToken.js";

export function extractAccessToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

export async function requireAuthIdentity(request: Request, response: Response, next: NextFunction) {
  try {
    const accessToken = extractAccessToken(
      typeof request.headers.authorization === "string" ? request.headers.authorization : undefined,
    );

    if (!accessToken) {
      return sendError(response, 401, "Missing access token.");
    }

    request.authIdentity = await validateAccessToken(accessToken);
    return next();
  } catch (error) {
    return sendError(
      response,
      isInvalidAccessTokenError(error) ? 401 : 500,
      isInvalidAccessTokenError(error)
        ? "Invalid or expired CDP access token."
        : "Unable to authenticate request.",
    );
  }
}

export async function requireAppUser(request: Request, response: Response, next: NextFunction) {
  try {
    const accessToken = extractAccessToken(
      typeof request.headers.authorization === "string" ? request.headers.authorization : undefined,
    );

    if (!accessToken) {
      return sendError(response, 401, "Missing access token.");
    }

    const identity = await validateAccessToken(accessToken);
    const user = await getUserByCdpUserId(identity.cdpUserId);

    request.authIdentity = identity;
    if (!user) {
      return sendError(response, 404, "Monra user not found.");
    }

    request.appUser = user;
    return next();
  } catch (error) {
    return sendError(
      response,
      isInvalidAccessTokenError(error) ? 401 : 500,
      isInvalidAccessTokenError(error)
        ? "Invalid or expired CDP access token."
        : "Unable to authenticate request.",
    );
  }
}

export function readAuthIdentity(request: Request) {
  if (!request.authIdentity) {
    throw new Error("Authenticated identity is missing from request context.");
  }

  return request.authIdentity;
}

export function readAppUser(request: Request) {
  if (!request.appUser) {
    throw new Error("Authenticated user is missing from request context.");
  }

  return request.appUser;
}

export function isUnauthorizedTokenError(error: unknown): error is InvalidAccessTokenError {
  return isInvalidAccessTokenError(error);
}
