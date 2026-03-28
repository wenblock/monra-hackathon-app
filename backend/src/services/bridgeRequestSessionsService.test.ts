import assert from "node:assert/strict";
import test from "node:test";

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

const { getOrCreateBridgeRequestSession } = await import("./bridgeRequestSessionsService.js");
const { ServiceError } = await import("./errors.js");

function createDependencies() {
  const sessions = new Map<string, Awaited<ReturnType<typeof getOrCreateBridgeRequestSession>>>();

  return {
    async createBridgeRequestSession(input: {
      operationType: "kyc_link" | "external_account" | "onramp_transfer" | "offramp_transfer";
      requestId: string;
      idempotencyKey: string;
      payloadHash: string;
      userId?: number | null;
      cdpUserId?: string | null;
    }) {
      const key = `${input.operationType}:${input.requestId}`;
      if (sessions.has(key)) {
        const conflictError = new Error("unique_violation") as Error & { code: string };
        conflictError.code = "23505";
        throw conflictError;
      }

      const session = {
        operationType: input.operationType,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
        bridgeObjectId: null,
        userId: input.userId ?? null,
        cdpUserId: input.cdpUserId ?? null,
        createdAt: "2026-03-28T00:00:00.000Z",
        updatedAt: "2026-03-28T00:00:00.000Z",
      };
      sessions.set(key, session);
      return session;
    },
    async getBridgeRequestSession(
      operationType: "kyc_link" | "external_account" | "onramp_transfer" | "offramp_transfer",
      requestId: string,
    ) {
      return sessions.get(`${operationType}:${requestId}`) ?? null;
    },
    async updateBridgeRequestSessionBridgeObjectId() {
      return null;
    },
  };
}

test("getOrCreateBridgeRequestSession reuses the stored key for the same request id and payload", async () => {
  const dependencies = createDependencies();

  const first = await getOrCreateBridgeRequestSession(
    {
      operationType: "onramp_transfer",
      requestId: "00000000-0000-4000-8000-000000000301",
      payload: {
        amount: "25",
        destinationAsset: "usdc",
      },
      userId: 7,
      cdpUserId: "cdp-user-1",
    },
    dependencies,
  );
  const second = await getOrCreateBridgeRequestSession(
    {
      operationType: "onramp_transfer",
      requestId: "00000000-0000-4000-8000-000000000301",
      payload: {
        amount: "25",
        destinationAsset: "usdc",
      },
      userId: 7,
      cdpUserId: "cdp-user-1",
    },
    dependencies,
  );

  assert.equal(first.idempotencyKey, second.idempotencyKey);
});

test("getOrCreateBridgeRequestSession rejects a reused request id with a different payload", async () => {
  const dependencies = createDependencies();

  await getOrCreateBridgeRequestSession(
    {
      operationType: "external_account",
      requestId: "00000000-0000-4000-8000-000000000302",
      payload: {
        bankName: "Monra Bank",
        iban: "DE89370400440532013000",
      },
      userId: 7,
      cdpUserId: "cdp-user-1",
    },
    dependencies,
  );

  await assert.rejects(
    getOrCreateBridgeRequestSession(
      {
        operationType: "external_account",
        requestId: "00000000-0000-4000-8000-000000000302",
        payload: {
          bankName: "Other Bank",
          iban: "DE89370400440532013000",
        },
        userId: 7,
        cdpUserId: "cdp-user-1",
      },
      dependencies,
    ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 409 &&
      /stale/i.test(error.message),
  );
});

test("getOrCreateBridgeRequestSession generates a new key for a new request id", async () => {
  const dependencies = createDependencies();

  const first = await getOrCreateBridgeRequestSession(
    {
      operationType: "offramp_transfer",
      requestId: "00000000-0000-4000-8000-000000000303",
      payload: {
        amount: "10",
        sourceAsset: "eurc",
      },
      userId: 7,
      cdpUserId: "cdp-user-1",
    },
    dependencies,
  );
  const second = await getOrCreateBridgeRequestSession(
    {
      operationType: "offramp_transfer",
      requestId: "00000000-0000-4000-8000-000000000304",
      payload: {
        amount: "10",
        sourceAsset: "eurc",
      },
      userId: 7,
      cdpUserId: "cdp-user-1",
    },
    dependencies,
  );

  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
});
