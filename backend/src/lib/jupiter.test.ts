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
process.env.JUPITER_API_KEY = "jupiter-api-key";
process.env.JUPITER_API_BASE_URL = "https://api.jup.ag/swap/v2";

const {
  JupiterApiError,
  clearCachedSwapOrdersForTests,
  executeJupiterSwap,
  getCachedSwapOrder,
  getJupiterSwapOrder,
  rememberSwapOrder,
} = await import("./jupiter.js");

test("getJupiterSwapOrder parses the Jupiter order response", async () => {
  const originalFetch = globalThis.fetch;
  let receivedHeaders: Headers | undefined;
  let requestedUrl = "";

  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    receivedHeaders = new Headers(init?.headers);

    return new Response(
      JSON.stringify({
        feeBps: 12,
        feeMint: "fee-mint",
        mode: "ExactIn",
        outAmount: "864570",
        requestId: "request-1",
        router: "iris",
        transaction: "base64-transaction",
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    const order = await getJupiterSwapOrder({
      amount: "1000000",
      inputMint: "input-mint",
      outputMint: "output-mint",
      taker: "wallet-address",
    });

    assert.match(requestedUrl, /\/order\?/);
    assert.match(requestedUrl, /amount=1000000/);
    assert.match(requestedUrl, /inputMint=input-mint/);
    assert.match(requestedUrl, /outputMint=output-mint/);
    assert.match(requestedUrl, /taker=wallet-address/);
    assert.equal(receivedHeaders?.get("x-api-key"), "jupiter-api-key");
    assert.deepEqual(order, {
      feeBps: 12,
      feeMint: "fee-mint",
      mode: "ExactIn",
      outAmount: "864570",
      requestId: "request-1",
      router: "iris",
      transaction: "base64-transaction",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("executeJupiterSwap normalizes execution responses", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input, init) => {
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "jupiter-api-key");
    assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
    assert.equal(
      init?.body,
      JSON.stringify({
        requestId: "request-1",
        signedTransaction: "signed-transaction",
      }),
    );

    return new Response(
      JSON.stringify({
        code: 0,
        inputAmountResult: "1000000",
        outputAmountResult: "864570",
        signature: "swap-signature",
        status: "Success",
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    const execution = await executeJupiterSwap({
      requestId: "request-1",
      signedTransaction: "signed-transaction",
    });

    assert.deepEqual(execution, {
      code: 0,
      error: null,
      inputAmountResult: "1000000",
      outputAmountResult: "864570",
      signature: "swap-signature",
      status: "Success",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getJupiterSwapOrder surfaces upstream errors", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Quote unavailable" }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 409,
      statusText: "Conflict",
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        getJupiterSwapOrder({
          amount: "1000000",
          inputMint: "input-mint",
          outputMint: "output-mint",
          taker: "wallet-address",
        }),
      (error: unknown) =>
        error instanceof JupiterApiError &&
        error.status === 409 &&
        error.message === "Quote unavailable",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cached swap orders expire after the ttl window", () => {
  clearCachedSwapOrdersForTests();

  rememberSwapOrder("request-1", {
    inputAmountRaw: "1000000",
    inputAsset: "usdc",
    outputAmountRaw: "864570",
    outputAsset: "eurc",
    userId: 1,
    walletAddress: "wallet-address",
  });

  assert.ok(getCachedSwapOrder("request-1", Date.now()));
  assert.equal(getCachedSwapOrder("request-1", Date.now() + 600_001), null);
});
