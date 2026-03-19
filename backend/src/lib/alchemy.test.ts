import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();

process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/monra";
process.env.ALCHEMY_API_KEY = "alchemy-api-key";
process.env.ALCHEMY_WEBHOOK_ID = "alchemy-webhook-id";
process.env.ALCHEMY_WEBHOOK_AUTH_TOKEN = "alchemy-webhook-auth-token";
process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = "alchemy-webhook-signing-key";
process.env.CDP_API_KEY_ID = "cdp-api-key-id";
process.env.CDP_API_KEY_SECRET = "cdp-api-key-secret";
process.env.BRIDGE_API_KEY = "bridge-api-key";
process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = publicKeyPem;
process.env.BRIDGE_WEBHOOK_MAX_AGE_MS = "600000";

const { isSolanaTransactionSuccessful } = await import("./alchemy.js");

test("isSolanaTransactionSuccessful accepts successful transactions", () => {
  assert.equal(
    isSolanaTransactionSuccessful({
      meta: {
        err: null,
      },
    }),
    true,
  );
});

test("isSolanaTransactionSuccessful rejects finalized but failed transactions", () => {
  assert.equal(
    isSolanaTransactionSuccessful({
      meta: {
        err: {
          InstructionError: [1, "Custom"],
        },
      },
    }),
    false,
  );
});

test("isSolanaTransactionSuccessful rejects transactions without metadata", () => {
  assert.equal(
    isSolanaTransactionSuccessful({
      meta: null,
    }),
    false,
  );
});
