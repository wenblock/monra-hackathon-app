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
});
