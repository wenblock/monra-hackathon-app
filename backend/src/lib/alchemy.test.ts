import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();

process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/monra";
process.env.ALCHEMY_API_KEY = "alchemy-api-key";
process.env.ALCHEMY_WEBHOOK_ID = "alchemy-webhook-id";
process.env.ALCHEMY_WEBHOOK_AUTH_TOKEN = "alchemy-webhook-auth-token";
process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = "alchemy-webhook-signing-key";
process.env.CDP_API_KEY_ID = "cdp-api-key-id";
process.env.CDP_API_KEY_SECRET = "cdp-api-key-secret";
process.env.BRIDGE_API_KEY = "bridge-api-key";
process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = publicKeyPem;
process.env.BRIDGE_WEBHOOK_MAX_AGE_MS = "600000";

const {
  buildTreasuryValuation,
  getTreasuryPrices,
  isSolanaTransactionSuccessful,
  resetTreasuryPriceCacheForTests,
} = await import("./alchemy.js");

test("isSolanaTransactionSuccessful accepts successful transactions", () => {
  assert.equal(
    isSolanaTransactionSuccessful({
      meta: {
        err: null,
      },
    }),
    true,
  );
});

test("isSolanaTransactionSuccessful rejects finalized but failed transactions", () => {
  assert.equal(
    isSolanaTransactionSuccessful({
      meta: {
        err: {
          InstructionError: [1, "Custom"],
        },
      },
    }),
    false,
  );
});

test("isSolanaTransactionSuccessful rejects transactions without metadata", () => {
  assert.equal(
    isSolanaTransactionSuccessful({
      meta: null,
    }),
    false,
  );
});

test("buildTreasuryValuation calculates treasury USD totals from cached token prices", () => {
  const valuation = buildTreasuryValuation(
    {
      sol: { formatted: "2", raw: "2000000000" },
      usdc: { formatted: "25", raw: "25000000" },
      eurc: { formatted: "10", raw: "10000000" },
    },
    {
      pricesUsd: {
        sol: "150",
        usdc: "1",
        eurc: "1.08",
      },
      lastUpdatedAt: "2026-03-20T09:00:02.000Z",
      fetchedAt: 0,
      expiresAt: 15000,
    },
    1000,
  );

  assert.equal(valuation.assetValuesUsd.sol, "300.00");
  assert.equal(valuation.assetValuesUsd.usdc, "25.00");
  assert.equal(valuation.assetValuesUsd.eurc, "10.80");
  assert.equal(valuation.liquidTreasuryValueUsd, "335.80");
  assert.equal(valuation.yieldInvestedValueUsd, "0.00");
  assert.equal(valuation.treasuryValueUsd, "335.80");
  assert.equal(valuation.lastUpdatedAt, "2026-03-20T09:00:02.000Z");
  assert.equal(valuation.isStale, false);
  assert.deepEqual(valuation.unavailableAssets, []);
});

test("buildTreasuryValuation marks delayed pricing when the cached snapshot is stale", () => {
  const valuation = buildTreasuryValuation(
    {
      sol: { formatted: "2", raw: "2000000000" },
      usdc: { formatted: "25", raw: "25000000" },
      eurc: { formatted: "10", raw: "10000000" },
    },
    {
      pricesUsd: {
        sol: "150",
        usdc: "1",
        eurc: "1.08",
      },
      lastUpdatedAt: "2026-03-20T09:00:02.000Z",
      fetchedAt: 0,
      expiresAt: 15000,
    },
    16000,
  );

  assert.equal(valuation.liquidTreasuryValueUsd, "335.80");
  assert.equal(valuation.treasuryValueUsd, "335.80");
  assert.equal(valuation.isStale, true);
});

test("buildTreasuryValuation omits treasury total when any cached price is unavailable", () => {
  const valuation = buildTreasuryValuation(
    {
      sol: { formatted: "2", raw: "2000000000" },
      usdc: { formatted: "25", raw: "25000000" },
      eurc: { formatted: "10", raw: "10000000" },
    },
    {
      pricesUsd: {
        sol: "150",
        usdc: "1",
      },
      lastUpdatedAt: "2026-03-20T09:00:01.000Z",
      fetchedAt: 0,
      expiresAt: 15000,
    },
    1000,
  );

  assert.equal(valuation.assetValuesUsd.sol, "300.00");
  assert.equal(valuation.assetValuesUsd.usdc, "25.00");
  assert.equal(valuation.assetValuesUsd.eurc, null);
  assert.equal(valuation.liquidTreasuryValueUsd, null);
  assert.equal(valuation.yieldInvestedValueUsd, "0.00");
  assert.equal(valuation.treasuryValueUsd, null);
  assert.deepEqual(valuation.unavailableAssets, ["eurc"]);
});

test("buildTreasuryValuation adds invested yield value to the treasury total without changing liquid rows", () => {
  const valuation = buildTreasuryValuation(
    {
      sol: { formatted: "2", raw: "2000000000" },
      usdc: { formatted: "25", raw: "25000000" },
      eurc: { formatted: "10", raw: "10000000" },
    },
    {
      pricesUsd: {
        sol: "150",
        usdc: "1",
        eurc: "1.08",
      },
      lastUpdatedAt: "2026-03-20T09:00:02.000Z",
      fetchedAt: 0,
      expiresAt: 15000,
    },
    {
      yieldInvestedValueUsd: "12.34",
    },
    1000,
  );

  assert.equal(valuation.assetValuesUsd.usdc, "25.00");
  assert.equal(valuation.liquidTreasuryValueUsd, "335.80");
  assert.equal(valuation.yieldInvestedValueUsd, "12.34");
  assert.equal(valuation.treasuryValueUsd, "348.14");
});

test("getTreasuryPrices returns cached prices without refetching while fresh", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCount += 1;
    const url = String(input);
    assert.match(url, /prices\/v1\/alchemy-api-key\/tokens\/by-symbol/);
    assert.match(url, /symbols=SOL/);
    assert.match(url, /symbols=USDC/);
    assert.match(url, /symbols=EURC/);

    return new Response(
      JSON.stringify({
        data: [
          {
            symbol: "SOL",
            prices: [{ currency: "usd", lastUpdatedAt: "2026-03-20T09:00:00.000Z", value: "150" }],
          },
          {
            symbol: "USDC",
            prices: [{ currency: "usd", lastUpdatedAt: "2026-03-20T09:00:01.000Z", value: "1" }],
          },
          {
            symbol: "EURC",
            prices: [{ currency: "usd", lastUpdatedAt: "2026-03-20T09:00:02.000Z", value: "1.08" }],
          },
        ],
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
    resetTreasuryPriceCacheForTests();

    const first = await getTreasuryPrices(0);
    const second = await getTreasuryPrices(14999);

    assert.equal(first?.pricesUsd.sol, "150");
    assert.equal(second?.pricesUsd.sol, "150");
    assert.equal(fetchCount, 1);
  } finally {
    resetTreasuryPriceCacheForTests();
    globalThis.fetch = originalFetch;
  }
});

test("getTreasuryPrices serves stale cache immediately and refreshes once in background", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let resolveRefresh: ((value: Response) => void) | null = null;

  globalThis.fetch = (async () => {
    fetchCount += 1;

    if (fetchCount === 1) {
      return createPriceResponse({
        eurc: "1.08",
        sol: "150",
        usdc: "1",
      });
    }

    return new Promise<Response>(resolve => {
      resolveRefresh = resolve;
    });
  }) as typeof fetch;

  try {
    resetTreasuryPriceCacheForTests();

    const first = await getTreasuryPrices(0);
    const staleFirst = await getTreasuryPrices(15001);
    const staleSecond = await getTreasuryPrices(15002);

    assert.equal(first?.pricesUsd.sol, "150");
    assert.equal(staleFirst?.pricesUsd.sol, "150");
    assert.equal(staleSecond?.pricesUsd.sol, "150");
    assert.equal(fetchCount, 2);

    resolveRefresh?.(
      createPriceResponse({
        eurc: "1.09",
        sol: "155",
        usdc: "1",
      }),
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    const refreshed = await getTreasuryPrices(15003);
    assert.equal(refreshed?.pricesUsd.sol, "155");
    assert.equal(refreshed?.pricesUsd.eurc, "1.09");
    assert.equal(fetchCount, 2);
  } finally {
    resetTreasuryPriceCacheForTests();
    globalThis.fetch = originalFetch;
  }
});

test("getTreasuryPrices dedupes concurrent refreshes", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let resolveFetch: ((value: Response) => void) | null = null;

  globalThis.fetch = (async () => {
    fetchCount += 1;

    return new Promise<Response>(resolve => {
      resolveFetch = resolve;
    });
  }) as typeof fetch;

  try {
    resetTreasuryPriceCacheForTests();

    const firstPromise = getTreasuryPrices(0);
    const secondPromise = getTreasuryPrices(0);
    const thirdPromise = getTreasuryPrices(0);

    assert.equal(fetchCount, 1);

    resolveFetch?.(
      createPriceResponse({
        eurc: "1.08",
        sol: "150",
        usdc: "1",
      }),
    );

    const [first, second, third] = await Promise.all([firstPromise, secondPromise, thirdPromise]);

    assert.equal(first?.pricesUsd.sol, "150");
    assert.equal(second?.pricesUsd.sol, "150");
    assert.equal(third?.pricesUsd.sol, "150");
    assert.equal(fetchCount, 1);
  } finally {
    resetTreasuryPriceCacheForTests();
    globalThis.fetch = originalFetch;
  }
});

test("getTreasuryPrices returns null when cache is expired and refresh fails", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async () => {
    fetchCount += 1;

    if (fetchCount === 1) {
      return createPriceResponse({
        eurc: "1.08",
        sol: "150",
        usdc: "1",
      });
    }

    return new Response("upstream error", { status: 503 });
  }) as typeof fetch;

  try {
    resetTreasuryPriceCacheForTests();

    const seeded = await getTreasuryPrices(0);
    const expired = await getTreasuryPrices(120001);

    assert.equal(seeded?.pricesUsd.sol, "150");
    assert.equal(expired, null);
    assert.equal(fetchCount, 3);
  } finally {
    resetTreasuryPriceCacheForTests();
    globalThis.fetch = originalFetch;
  }
});

function createPriceResponse(prices: Partial<Record<"sol" | "usdc" | "eurc", string>>) {
  return new Response(
    JSON.stringify({
      data: [
        ...(prices.sol
          ? [
              {
                symbol: "SOL",
                prices: [
                  { currency: "usd", lastUpdatedAt: "2026-03-20T09:00:00.000Z", value: prices.sol },
                ],
              },
            ]
          : []),
        ...(prices.usdc
          ? [
              {
                symbol: "USDC",
                prices: [
                  { currency: "usd", lastUpdatedAt: "2026-03-20T09:00:01.000Z", value: prices.usdc },
                ],
              },
            ]
          : []),
        ...(prices.eurc
          ? [
              {
                symbol: "EURC",
                prices: [
                  { currency: "usd", lastUpdatedAt: "2026-03-20T09:00:02.000Z", value: prices.eurc },
                ],
              },
            ]
          : []),
      ],
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    },
  );
}
