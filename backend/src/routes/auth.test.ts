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

const { getSessionStatus } = await import("./auth.js");

function createUserFixture(bridgeCustomerId: string | null): AppUser {
  return {
    accountType: "individual",
    bridgeCustomerId,
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
    fullName: "Jane Doe",
    id: 1,
    solanaAddress: null,
    updatedAt: "2026-03-19T00:00:00.000Z",
  };
}

test("getSessionStatus keeps users without a Bridge customer in onboarding", () => {
  assert.equal(getSessionStatus(null), "needs_onboarding");
  assert.equal(getSessionStatus(createUserFixture(null)), "needs_onboarding");
});

test("getSessionStatus marks users with a Bridge customer as active", () => {
  assert.equal(getSessionStatus(createUserFixture("bridge-customer-1")), "active");
});
