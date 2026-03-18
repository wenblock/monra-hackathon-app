import { CdpClient } from "@coinbase/cdp-sdk";

import { config } from "../config.js";
import type { AuthIdentity } from "../types.js";

const cdpClient = new CdpClient({
  apiKeyId: config.cdpApiKeyId,
  apiKeySecret: config.cdpApiKeySecret,
});

function readPath(value: unknown, path: string[]) {
  let current = value;

  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function readEmailFromAuthenticationMethods(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const method of value) {
    if (!method || typeof method !== "object") {
      continue;
    }

    const type = "type" in method ? method.type : null;
    const email = "email" in method ? method.email : null;

    if (type === "email" && typeof email === "string" && email.trim().length > 0) {
      return email;
    }
  }

  return null;
}

export async function validateAccessToken(accessToken: string): Promise<AuthIdentity> {
  const endUser = await cdpClient.endUser.validateAccessToken({
    accessToken,
  });

  const cdpUserId = readPath(endUser, ["userId"]);
  const email =
    readEmailFromAuthenticationMethods(readPath(endUser, ["authenticationMethods"])) ??
    readEmailFromAuthenticationMethods(readPath(endUser, ["authentication_methods"]));

  if (typeof cdpUserId !== "string" || cdpUserId.trim().length === 0) {
    throw new Error("Validated CDP end user is missing userId.");
  }

  return {
    cdpUserId,
    email,
  };
}
