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

const { createOnrampForUser } = await import("./onrampService.js");
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

test("createOnrampForUser rejects users without a linked Bridge customer", async () => {
  await assert.rejects(
    createOnrampForUser(
      {
        amount: "25",
        destinationAsset: "usdc",
        user: createUserFixture({ bridgeCustomerId: null }),
      },
      {} as never,
    ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 409 &&
      /before using on-ramp/i.test(error.message),
  );
});

test("createOnrampForUser creates and stores a pending Bridge transfer", async () => {
  let storedBridgeTransferId: string | null = null;
  const transaction = { id: 1, publicId: "tx-public-id" };

  const result = await createOnrampForUser(
    {
      amount: "25",
      destinationAsset: "eurc",
      user: createUserFixture(),
    },
    {
      async createBridgeOnrampTransfer(input) {
        assert.equal(input.destinationAsset, "eurc");
        assert.equal(input.destinationAddress, "wallet-address");
        return {
          bridgeTransferId: "bridge-transfer-id",
          bridgeTransferStatus: "pending",
          depositInstructions: null,
          destinationAmount: "24.75",
          receiptUrl: "https://bridge.example/receipt",
          sourceAmount: "25",
          sourceCurrency: "eur",
        };
      },
      async createPendingOnrampTransaction(input) {
        storedBridgeTransferId = input.bridgeTransferId;
        assert.equal(input.expectedDestinationAmount, "24.75");
        return transaction as any;
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

  assert.equal(storedBridgeTransferId, "bridge-transfer-id");
  assert.equal(result, transaction);
});
