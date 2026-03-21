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

const {
  classifyHttpError,
  createCorsOriginError,
  errorHandler,
} = await import("./errorHandler.js");

function createMockRequest() {
  return {
    method: "POST",
    originalUrl: "/api/test",
    requestId: "req-error-handler",
  };
}

function createMockResponse(request: ReturnType<typeof createMockRequest>) {
  const response = {
    body: null as unknown,
    headersSent: false,
    req: request,
    statusCode: 200,
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
  };

  return response;
}

test("classifyHttpError identifies CORS and JSON parse failures", () => {
  assert.deepEqual(classifyHttpError(createCorsOriginError()), {
    message: "Origin is not allowed by CORS.",
    status: 403,
  });
  assert.deepEqual(classifyHttpError({ status: 400, type: "entity.parse.failed" }), {
    message: "Request body must be valid JSON.",
    status: 400,
  });
});

test("errorHandler returns JSON errors that include the request id", () => {
  const request = createMockRequest();
  const response = createMockResponse(request);

  errorHandler(
    { status: 400, type: "entity.parse.failed" },
    request as never,
    response as never,
    () => undefined,
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    error: "Request body must be valid JSON.",
    requestId: "req-error-handler",
  });
});
