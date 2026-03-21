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

const { OnboardingFlowError, executeOnboardingFlow, requiresOnboarding } = await import(
  "./onboardingFlow.js"
);

function createUserFixture(overrides: Partial<AppUser> = {}): AppUser {
  return {
    accountType: "individual",
    bridgeCustomerId: null,
    bridgeKycLink: null,
    bridgeKycLinkId: null,
    bridgeKycStatus: null,
    bridgeTosLink: null,
    bridgeTosStatus: null,
    businessName: null,
    cdpUserId: "cdp-user-1",
    countryCode: "DE",
    countryName: "Germany",
    createdAt: "2026-03-19T00:00:00.000Z",
    email: "jane@example.com",
    fullName: "Jane A.-Doe",
    id: 7,
    publicId: "00000000-0000-4000-8000-000000000007",
    solanaAddress: null,
    updatedAt: "2026-03-19T00:00:00.000Z",
    ...overrides,
  };
}

const identity = {
  cdpUserId: "cdp-user-1",
  email: "jane@example.com",
};

test("requiresOnboarding returns true when the Bridge customer has not been linked yet", () => {
  assert.equal(requiresOnboarding(null), true);
  assert.equal(requiresOnboarding(createUserFixture()), true);
  assert.equal(
    requiresOnboarding(
      createUserFixture({
        bridgeCustomerId: "customer-123",
      }),
    ),
    false,
  );
});

test("executeOnboardingFlow creates the local user before calling Bridge and persists the link", async () => {
  const callOrder: string[] = [];
  const createdUser = createUserFixture();
  const completedUser = createUserFixture({
    bridgeCustomerId: "customer-123",
    bridgeKycLink: "https://bridge.example/kyc",
    bridgeKycLinkId: "kyc-link-123",
    bridgeKycStatus: "under_review",
    bridgeTosLink: "https://bridge.example/tos",
    bridgeTosStatus: "pending",
  });

  const result = await executeOnboardingFlow(
    identity,
    {
      accountType: "individual",
      countryCode: "DE",
      countryName: "Germany",
      fullName: "Jane A.-Doe",
    },
    {
      async createBridgeKycLink(input) {
        callOrder.push("createBridgeKycLink");
        assert.equal(input.fullName, "Jane A.-Doe");

        return {
          customerId: "customer-123",
          id: "kyc-link-123",
          kycLink: "https://bridge.example/kyc",
          kycStatus: "under_review",
          tosLink: "https://bridge.example/tos",
          tosStatus: "pending",
        };
      },
      async createUser(input) {
        callOrder.push("createUser");
        assert.equal(input.fullName, "Jane A.-Doe");
        return createdUser;
      },
      async getUserByCdpUserId() {
        callOrder.push("getUserByCdpUserId");
        return null;
      },
      async updateUserBridgeStatuses(input) {
        callOrder.push("updateUserBridgeStatuses");
        assert.equal(input.bridgeCustomerId, "customer-123");
        assert.equal(input.bridgeKycLinkId, "kyc-link-123");
        assert.equal(input.userId, createdUser.id);
        return completedUser;
      },
    },
  );

  assert.deepEqual(callOrder, [
    "getUserByCdpUserId",
    "createUser",
    "createBridgeKycLink",
    "updateUserBridgeStatuses",
  ]);
  assert.equal(result.createdLocalUser, true);
  assert.equal(result.user.bridgeCustomerId, "customer-123");
  assert.equal(result.bridge.customerStatus, "under_review");
  assert.equal(result.bridge.showKycAlert, true);
});

test("executeOnboardingFlow does not call Bridge when local user creation fails", async () => {
  let bridgeCalled = false;
  const sequenceError = {
    code: "23505",
    constraint: "users_pkey",
  };

  await assert.rejects(
    executeOnboardingFlow(
      identity,
      {
        accountType: "individual",
        countryCode: "DE",
        countryName: "Germany",
        fullName: "Jane A.-Doe",
      },
      {
        async createBridgeKycLink() {
          bridgeCalled = true;
          throw new Error("Bridge should not have been called.");
        },
        async createUser() {
          throw sequenceError;
        },
        async getUserByCdpUserId() {
          return null;
        },
        async updateUserBridgeStatuses() {
          throw new Error("updateUserBridgeStatuses should not have been called.");
        },
      },
    ),
    (error: unknown) => {
      assert.equal(bridgeCalled, false);
      assert.equal(error instanceof OnboardingFlowError, true);

      if (!(error instanceof OnboardingFlowError)) {
        return false;
      }

      assert.equal(error.stage, "create_local_user");
      assert.equal(error.bridgeRequestAttempted, false);
      assert.equal(error.originalError, sequenceError);
      return true;
    },
  );
});

test("executeOnboardingFlow resumes an incomplete signup with the stored local profile", async () => {
  const existingUser = createUserFixture({
    accountType: "business",
    businessName: "Monra Labs - EU Ltd.",
    fullName: "Original Contact",
  });
  let createUserCalled = false;
  let bridgeFullName: string | null = null;

  const result = await executeOnboardingFlow(
    identity,
    {
      accountType: "business",
      businessName: "Changed Name Inc.",
      countryCode: "FR",
      countryName: "France",
      fullName: "Changed Contact",
    },
    {
      async createBridgeKycLink(input) {
        bridgeFullName = input.fullName;
        return {
          customerId: "customer-456",
          id: "kyc-link-456",
          kycLink: "https://bridge.example/kyc-456",
          kycStatus: "under_review",
          tosLink: "https://bridge.example/tos-456",
          tosStatus: "pending",
        };
      },
      async createUser() {
        createUserCalled = true;
        throw new Error("createUser should not be called for incomplete local users.");
      },
      async getUserByCdpUserId() {
        return existingUser;
      },
      async updateUserBridgeStatuses() {
        return createUserFixture({
          ...existingUser,
          bridgeCustomerId: "customer-456",
          bridgeKycLink: "https://bridge.example/kyc-456",
          bridgeKycLinkId: "kyc-link-456",
          bridgeKycStatus: "under_review",
          bridgeTosLink: "https://bridge.example/tos-456",
          bridgeTosStatus: "pending",
        });
      },
    },
  );

  assert.equal(createUserCalled, false);
  assert.equal(bridgeFullName, "Monra Labs - EU Ltd.");
  assert.equal(result.createdLocalUser, false);
  assert.equal(result.user.bridgeCustomerId, "customer-456");
});
