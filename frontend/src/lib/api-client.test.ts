import { describe, expect, it, vi } from "vitest";

import { ApiClientError, createApiClient } from "@/lib/api-client";

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

  it("sends swap order requests with body auth", async () => {
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
            accessToken: "token",
            amount: "10",
            inputAsset: "usdc",
            outputAsset: "eurc",
          }),
          method: "POST",
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
