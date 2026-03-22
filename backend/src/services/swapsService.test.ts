import assert from "node:assert/strict";
import test from "node:test";
import type { AppUser } from "../types.js";

process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/monra";
process.env.ALCHEMY_API_KEY = "alchemy-api-key";
process.env.ALCHEMY_WEBHOOK_ID = "alchemy-webhook-id";
process.env.ALCHEMY_WEBHOOK_AUTH_TOKEN = "alchemy-webhook-auth-token";
process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = "alchemy-webhook-signing-key";
process.env.CDP_API_KEY_ID = "cdp-api-key-id";
process.env.CDP_API_KEY_SECRET = "cdp-api-key-secret";
process.env.BRIDGE_API_KEY = "bridge-api-key";
process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = "test-public-key";
process.env.BRIDGE_WEBHOOK_MAX_AGE_MS = "600000";

const { createSwapOrderForUser, executeSwapForUser } = await import("./swapsService.js");
const { ServiceError } = await import("./errors.js");

function createUserFixture(overrides: Partial<AppUser> = {}): AppUser {
  return {
    accountType: "individual",
    bridgeCustomerId: "bridge-customer",
    bridgeKycLink: null,
    bridgeKycLinkId: null,
    bridgeKycStatus: "active",
    bridgeTosLink: null,
    bridgeTosStatus: "approved",
    businessName: null,
    cdpUserId: "cdp-user-1",
    countryCode: "DE",
    countryName: "Germany",
    createdAt: "2026-03-19T00:00:00.000Z",
    email: "jane@example.com",
    fullName: "Jane Doe",
    id: 7,
    publicId: "00000000-0000-4000-8000-000000000007",
    solanaAddress: "wallet-address",
    updatedAt: "2026-03-19T00:00:00.000Z",
    ...overrides,
  };
}

test("createSwapOrderForUser stores the shared quote and formats the output amount", async () => {
  let storedRequestId: string | null = null;

  const result = await createSwapOrderForUser(
    {
      amount: "1.5",
      inputAsset: "usdc",
      outputAsset: "eurc",
      user: createUserFixture(),
    },
    {
      async broadcastLatestTransactionSnapshot() {
        return {} as any;
      },
      async createConfirmedSwapTransaction() {
        throw new Error("should not be called");
      },
      async executeJupiterSwap() {
        throw new Error("should not be called");
      },
      async getJupiterSwapOrder() {
        return {
          feeBps: 10,
          feeMint: "mint",
          mode: "ExactIn",
          outAmount: "1490000",
          requestId: "request-123",
          router: "jupiter",
          transaction: "serialized-tx",
        };
      },
      async getSharedSwapQuote() {
        return null;
      },
      async storeSharedSwapQuote(input) {
        storedRequestId = input.requestId;
      },
    },
  );

  assert.equal(storedRequestId, "request-123");
  assert.equal(result.quote.outputAmountDecimal, "1.49");
});

test("executeSwapForUser broadcasts the updated snapshot after persisting the swap", async () => {
  let broadcastedUserId: number | null = null;

  const result = await executeSwapForUser(
    {
      requestId: "request-123",
      signedTransaction: "signed-tx",
      user: createUserFixture(),
    },
    {
      async broadcastLatestTransactionSnapshot(userId) {
        broadcastedUserId = userId;
        return {} as any;
      },
      async createConfirmedSwapTransaction() {
        return {
          balances: {
            eurc: { formatted: "1", raw: "1000000" },
            sol: { formatted: "0", raw: "0" },
            usdc: { formatted: "0", raw: "0" },
          },
          transaction: { id: 1 },
        } as any;
      },
      async executeJupiterSwap() {
        return {
          code: 0,
          error: null,
          inputAmountResult: null,
          outputAmountResult: null,
          signature: "sig-123",
          status: "Success",
        };
      },
      async getJupiterSwapOrder() {
        throw new Error("should not be called");
      },
      async getSharedSwapQuote() {
        return {
          inputAmountRaw: "1500000",
          inputAsset: "usdc",
          outputAmountRaw: "1490000",
          outputAsset: "eurc",
          requestId: "request-123",
          userId: 7,
          walletAddress: "wallet-address",
        } as any;
      },
      async storeSharedSwapQuote() {
        throw new Error("should not be called");
      },
    },
  );

  assert.equal(broadcastedUserId, 7);
  assert.equal((result as any).transaction.id, 1);
});

test("executeSwapForUser rejects expired quotes", async () => {
  await assert.rejects(
    executeSwapForUser(
      {
        requestId: "missing-request",
        signedTransaction: "signed-tx",
        user: createUserFixture(),
      },
      {
        async broadcastLatestTransactionSnapshot() {
          return {} as any;
        },
        async createConfirmedSwapTransaction() {
          throw new Error("should not be called");
        },
        async executeJupiterSwap() {
          throw new Error("should not be called");
        },
        async getJupiterSwapOrder() {
          throw new Error("should not be called");
        },
        async getSharedSwapQuote() {
          return null;
        },
        async storeSharedSwapQuote() {
          throw new Error("should not be called");
        },
      },
    ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 409 &&
      /quote expired/i.test(error.message),
  );
});
