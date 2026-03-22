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

const { createOfframpForUser } = await import("./offrampService.js");
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

test("createOfframpForUser rejects missing recipients", async () => {
  await assert.rejects(
    createOfframpForUser(
      {
        amount: "20",
        recipientId: 9,
        sourceAsset: "eurc",
        user: createUserFixture(),
      },
      {
        async createBridgeOfframpTransfer() {
          throw new Error("should not be called");
        },
        async createPendingOfframpTransaction() {
          throw new Error("should not be called");
        },
        async getRecipientByIdForUser() {
          return null;
        },
        async getRecipientByPublicIdForUser() {
          return null;
        },
        async syncBridgeStatus() {
          throw new Error("should not be called");
        },
      },
    ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 404 &&
      /recipient not found/i.test(error.message),
  );
});

test("createOfframpForUser creates a pending off-ramp for a bank recipient", async () => {
  let persistedRecipientId: number | null = null;
  const transaction = { id: 11, publicId: "tx-public-id" };

  const result = await createOfframpForUser(
    {
      amount: "20",
      recipientPublicId: "00000000-0000-4000-8000-000000000009",
      sourceAsset: "usdc",
      user: createUserFixture(),
    },
    {
      async createBridgeOfframpTransfer(input) {
        assert.equal(input.externalAccountId, "bridge-external-account-id");
        return {
          bridgeTransferId: "bridge-transfer-id",
          bridgeTransferStatus: "pending",
          depositInstructions: {
            accountHolderName: null,
            amount: null,
            bankAccountNumber: null,
            bankAddress: null,
            bankBeneficiaryAddress: null,
            bankBeneficiaryName: null,
            bankName: null,
            bankRoutingNumber: null,
            bic: null,
            blockchainMemo: null,
            currency: null,
            depositMessage: null,
            fromAddress: null,
            iban: null,
            paymentRail: null,
            toAddress: "bridge-deposit-wallet",
          },
          receiptUrl: null,
          sourceAmount: "20",
          sourceCurrency: "usd",
        };
      },
      async createPendingOfframpTransaction(input) {
        persistedRecipientId = input.recipientId;
        return transaction as any;
      },
      async getRecipientByIdForUser() {
        return null;
      },
      async getRecipientByPublicIdForUser() {
        return {
          bridgeExternalAccountId: "bridge-external-account-id",
          displayName: "Jane Recipient",
          id: 9,
          kind: "bank",
        } as any;
      },
      async syncBridgeStatus() {
        return {
          bridge: {
            customerStatus: "active",
            hasAcceptedTermsOfService: true,
            showKycAlert: false,
            showTosAlert: false,
          },
          user: createUserFixture(),
        };
      },
    },
  );

  assert.equal(persistedRecipientId, 9);
  assert.equal(result, transaction);
});
