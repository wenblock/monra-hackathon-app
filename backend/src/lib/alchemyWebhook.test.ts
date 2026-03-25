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
        publicId: "00000000-0000-4000-8000-000000000001",
      },
    ],
    [
      destinationWallet,
      {
        id: 2,
        publicId: "00000000-0000-4000-8000-000000000002",
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

test("normalizeAlchemyTransaction classifies Jupiter Lend deposits as yield entries and keeps the network fee", () => {
  const userWallet = "UserWallet111111111111111111111111111111111";
  const userUsdcAccount = "UserUsdc111111111111111111111111111111111";
  const vaultUsdcAccount = "VaultUsdc11111111111111111111111111111111";
  const userJlUsdcAccount = "UserJlUsdc111111111111111111111111111111";
  const vaultWallet = "VaultWallet1111111111111111111111111111111";

  const usersByAddress = new Map([
    [
      userWallet,
      {
        id: 7,
        publicId: "00000000-0000-4000-8000-000000000007",
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
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            owner: userWallet,
            uiTokenAmount: { amount: "1000000" },
          },
          {
            accountIndex: 1,
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            owner: vaultWallet,
            uiTokenAmount: { amount: "1000000" },
          },
          {
            accountIndex: 2,
            mint: "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D",
            owner: userWallet,
            uiTokenAmount: { amount: "1000000" },
          },
        ],
        preTokenBalances: [
          {
            accountIndex: 0,
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            owner: userWallet,
            uiTokenAmount: { amount: "2000000" },
          },
          {
            accountIndex: 1,
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            owner: vaultWallet,
            uiTokenAmount: { amount: "0" },
          },
        ],
      },
      transaction: {
        message: {
          accountKeys: [userUsdcAccount, vaultUsdcAccount, userJlUsdcAccount, userWallet, vaultWallet],
          instructions: [
            {
              programId: "jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9",
              parsed: {
                info: {},
                type: "deposit",
              },
            },
            {
              parsed: {
                info: {
                  amount: "1000000",
                  destination: vaultUsdcAccount,
                  source: userUsdcAccount,
                },
                type: "transferChecked",
              },
              program: "spl-token",
            },
          ],
        },
      },
    },
    signature: "yield-deposit-signature",
    usersByAddress,
  });

  assert.equal(normalizedEntries.filter(entry => entry.entryType === "transfer").length, 0);
  assert.deepEqual(
    normalizedEntries.map(entry => entry.entryType),
    ["yield_deposit"],
  );
  assert.equal(normalizedEntries[0]?.counterpartyName, "Jupiter USDC Earn Vault");
});

test("normalizeAlchemyTransaction classifies Jupiter Lend withdrawals as yield entries", () => {
  const userWallet = "UserWallet222222222222222222222222222222222";
  const vaultWallet = "VaultWallet2222222222222222222222222222222";
  const usersByAddress = new Map([
    [
      userWallet,
      {
        id: 8,
        publicId: "00000000-0000-4000-8000-000000000008",
      },
    ],
  ]) as unknown as Map<string, AppUser>;

  const normalizedEntries = normalizeAlchemyTransaction({
    parsedTransaction: {
      blockTime: 1_700_000_000,
      meta: {
        err: null,
        fee: 0,
        postTokenBalances: [
          {
            accountIndex: 0,
            mint: "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D",
            owner: userWallet,
            uiTokenAmount: { amount: "0" },
          },
          {
            accountIndex: 1,
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            owner: userWallet,
            uiTokenAmount: { amount: "1000000" },
          },
          {
            accountIndex: 2,
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            owner: vaultWallet,
            uiTokenAmount: { amount: "0" },
          },
        ],
        preTokenBalances: [
          {
            accountIndex: 0,
            mint: "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D",
            owner: userWallet,
            uiTokenAmount: { amount: "1000000" },
          },
          {
            accountIndex: 1,
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            owner: userWallet,
            uiTokenAmount: { amount: "0" },
          },
          {
            accountIndex: 2,
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            owner: vaultWallet,
            uiTokenAmount: { amount: "1000000" },
          },
        ],
      },
      transaction: {
        message: {
          accountKeys: [
            "UserJlUsdcAccount11111111111111111111111111111",
            "UserUsdcAccount111111111111111111111111111111",
            "VaultUsdcAccount1111111111111111111111111111",
            userWallet,
            vaultWallet,
          ],
          instructions: [
            {
              programId: "jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9",
              parsed: {
                info: {},
                type: "withdraw",
              },
            },
            {
              parsed: {
                info: {
                  amount: "1000000",
                  destination: "UserUsdcAccount111111111111111111111111111111",
                  source: "VaultUsdcAccount1111111111111111111111111111",
                },
                type: "transferChecked",
              },
              program: "spl-token",
            },
          ],
        },
      },
    },
    signature: "yield-withdraw-signature",
    usersByAddress,
  });

  assert.equal(normalizedEntries.length, 1);
  assert.equal(normalizedEntries[0]?.entryType, "yield_withdraw");
  assert.equal(normalizedEntries[0]?.asset, "usdc");
});
