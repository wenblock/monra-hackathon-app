import assert from "node:assert/strict";
import test from "node:test";

const { normalizeMinimumCurrencyAmount, normalizeSwapAmount } = await import("./amounts.js");

test("normalizeMinimumCurrencyAmount trims insignificant zeros and enforces the minimum", () => {
  assert.equal(
    normalizeMinimumCurrencyAmount({
      currencyCode: "EUR",
      decimals: 2,
      minimum: 3,
      minimumMessage: "Minimum on-ramp amount is 3 EUR.",
      value: "003.50",
    }),
    "3.5",
  );

  assert.throws(
    () =>
      normalizeMinimumCurrencyAmount({
        currencyCode: "EUR",
        decimals: 2,
        minimum: 3,
        minimumMessage: "Minimum on-ramp amount is 3 EUR.",
        value: "2.99",
      }),
    /minimum on-ramp amount is 3 eur/i,
  );
});

test("normalizeSwapAmount converts decimals into raw asset units", () => {
  assert.deepEqual(normalizeSwapAmount("10.5", "usdc"), {
    decimal: "10.5",
    raw: "10500000",
  });

  assert.throws(
    () => normalizeSwapAmount("1.0000001", "usdc"),
    /up to 6 decimal places/i,
  );
});
