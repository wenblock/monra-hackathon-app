import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import type { AppUser } from "../types.js";

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

const { normalizeAlchemyTransaction } = await import("./alchemyWebhook.js");

test("normalizeAlchemyTransaction creates EURC inbound and outbound ledger entries", () => {
  const sourceWallet = "SourceWallet111111111111111111111111111111";
  const destinationWallet = "DestinationWallet111111111111111111111111";
  const sourceTokenAccount = "SourceTokenAccount11111111111111111111111";
  const destinationTokenAccount = "DestinationTokenAccount111111111111111111";

  const usersByAddress = new Map([
    [
      sourceWallet,
      {
        id: 1,
      },
    ],
    [
      destinationWallet,
      {
        id: 2,
      },
    ],
  ]) as unknown as Map<string, AppUser>;

  const normalizedEntries = normalizeAlchemyTransaction({
    parsedTransaction: {
      blockTime: 1_700_000_000,
      meta: {
        err: null,
        fee: 5000,
        postTokenBalances: [
          {
            accountIndex: 0,
            mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
            owner: sourceWallet,
          },
          {
            accountIndex: 1,
            mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
            owner: destinationWallet,
          },
        ],
        preTokenBalances: [
          {
            accountIndex: 0,
            mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
            owner: sourceWallet,
          },
          {
            accountIndex: 1,
            mint: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
            owner: destinationWallet,
          },
        ],
      },
      transaction: {
        message: {
          accountKeys: [sourceTokenAccount, destinationTokenAccount, sourceWallet, destinationWallet],
          instructions: [
            {
              parsed: {
                info: {
                  amount: "1250000",
                  destination: destinationTokenAccount,
                  source: sourceTokenAccount,
                },
                type: "transferChecked",
              },
              program: "spl-token",
            },
          ],
        },
      },
    },
    signature: "eurc-signature",
    usersByAddress,
  });

  const transferEntries = normalizedEntries.filter(entry => entry.entryType === "transfer");
  assert.equal(transferEntries.length, 2);
  assert.deepEqual(
    transferEntries.map(entry => ({
      amountDecimal: entry.amountDecimal,
      asset: entry.asset,
      direction: entry.direction,
      trackedWalletAddress: entry.trackedWalletAddress,
    })),
    [
      {
        amountDecimal: "1.25",
        asset: "eurc",
        direction: "outbound",
        trackedWalletAddress: sourceWallet,
      },
      {
        amountDecimal: "1.25",
        asset: "eurc",
        direction: "inbound",
        trackedWalletAddress: destinationWallet,
      },
    ],
  );
});
