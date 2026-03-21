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

const { createRateLimit, resetRateLimitStoreForTests } = await import("./rateLimit.js");

function createMockRequest() {
  return {
    appUser: { id: 42 },
    ip: "127.0.0.1",
    originalUrl: "/api/swaps/order",
    requestId: "req-rate-limit",
    socket: {
      remoteAddress: "127.0.0.1",
    },
  };
}

function createMockResponse(request: ReturnType<typeof createMockRequest>) {
  const headers = new Map<string, string>();
  const response = {
    body: null as unknown,
    headers,
    headersSent: false,
    req: request,
    statusCode: 200,
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
  };

  return response;
}

test("createRateLimit allows requests until the limit is exceeded", () => {
  resetRateLimitStoreForTests();

  const middleware = createRateLimit({
    keyGenerator: request => `user:${request.appUser?.id}`,
    max: 1,
    name: "test.limit",
    windowMs: 60_000,
  });

  const request = createMockRequest();
  const firstResponse = createMockResponse(request);
  let nextCalls = 0;

  middleware(request as never, firstResponse as never, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(firstResponse.statusCode, 200);

  const secondResponse = createMockResponse(request);
  middleware(request as never, secondResponse as never, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(secondResponse.statusCode, 429);
  assert.deepEqual(secondResponse.body, {
    error: "Too many requests. Please try again later.",
    requestId: "req-rate-limit",
  });
  assert.equal(secondResponse.headers.get("Retry-After"), "60");
});
