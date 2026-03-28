import { describe, expect, it, vi } from "vitest";

import { ApiClientError, createApiClient } from "@/lib/api-client";

function readFirstRequestOptions(fetchMock: ReturnType<typeof vi.fn>) {
  const firstCall = fetchMock.mock.calls[0];
  if (!firstCall) {
    throw new Error("Expected fetch to be called at least once.");
  }

  const options = firstCall[1];
  if (!options || typeof options !== "object") {
    throw new Error("Expected fetch to be called with RequestInit options.");
  }

  return options as RequestInit;
}

describe("api-client", () => {
  it("normalizes API errors", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      statusText: "Bad Request",
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = createApiClient(async () => "token");

    await expect(client.bootstrapSession()).rejects.toEqual(
      expect.objectContaining<ApiClientError>({
        message: "Bad request",
        name: "ApiClientError",
        status: 400,
      }),
    );

    globalThis.fetch = originalFetch;
  });

  it("sends swap order requests with bearer auth", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          quote: {
            feeBps: null,
            feeMint: null,
            inputAmountDecimal: "10",
            inputAmountRaw: "10000000",
            inputAsset: "usdc",
            mode: "ExactIn",
            outputAmountDecimal: "8.6457",
            outputAmountRaw: "8645700",
            outputAsset: "eurc",
            router: "iris",
          },
          quotedAt: "2026-03-20T10:00:00.000Z",
          requestId: "request-1",
          transaction: "base64-order-transaction",
        }),
        {
          status: 200,
        },
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const client = createApiClient(async () => "token");
      await client.fetchSwapOrder({
        amount: "10",
        inputAsset: "usdc",
        outputAsset: "eurc",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/api/swaps/order",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "10",
            inputAsset: "usdc",
            outputAsset: "eurc",
          }),
          headers: expect.any(Headers),
          method: "POST",
        }),
      );

      const options = readFirstRequestOptions(fetchMock);
      expect(new Headers(options.headers).get("Authorization")).toBe("Bearer token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses GET with bearer auth for bridge status sync", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      bridge: {
        customerStatus: "active",
        hasAcceptedTermsOfService: true,
        showKycAlert: false,
        showTosAlert: false,
      },
      user: null,
    }), {
      status: 200,
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const client = createApiClient(async () => "token");
      await client.syncBridgeStatus();

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/api/bridge/status",
        expect.objectContaining({
          body: undefined,
          headers: expect.any(Headers),
          method: "GET",
        }),
      );

      const options = readFirstRequestOptions(fetchMock);
      expect(new Headers(options.headers).get("Authorization")).toBe("Bearer token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends on-ramp requests with the request id in the JSON body", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          transaction: {
            id: 1,
          },
        }),
        {
          status: 200,
        },
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const client = createApiClient(async () => "token");
      await client.createOnramp({
        amount: "25",
        destinationAsset: "usdc",
        requestId: "00000000-0000-4000-8000-000000000401",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/api/onramp",
        expect.objectContaining({
          body: JSON.stringify({
            amount: "25",
            destinationAsset: "usdc",
            requestId: "00000000-0000-4000-8000-000000000401",
          }),
          headers: expect.any(Headers),
          method: "POST",
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
