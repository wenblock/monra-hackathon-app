import { createHmac, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";

const STREAM_TOKEN_TTL_SECONDS = 60;

interface StreamTokenPayload {
  cdpUserId: string;
  exp: number;
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", config.streamTokenSecret).update(encodedPayload).digest("base64url");
}

export function createStreamToken(cdpUserId: string) {
  const expiresAt = new Date(Date.now() + STREAM_TOKEN_TTL_SECONDS * 1000);
  const payload: StreamTokenPayload = {
    cdpUserId,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function verifyStreamToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid stream token.");
  }

  const expectedSignature = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error("Invalid stream token signature.");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<
    StreamTokenPayload
  >;

  if (typeof payload.cdpUserId !== "string" || payload.cdpUserId.trim().length === 0) {
    throw new Error("Invalid stream token payload.");
  }

  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    throw new Error("Expired stream token.");
  }

  return payload as StreamTokenPayload;
}
