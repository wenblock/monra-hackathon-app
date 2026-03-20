import { describe, expect, it } from "vitest";

import { assertValidSolanaAddress, parseTransferAmount } from "@/solana-transfer";

describe("solana-transfer", () => {
  it("parses transfer amounts using the provided precision", () => {
    expect(parseTransferAmount("1.2500", 6)).toEqual({
      decimal: "1.25",
      raw: 1250000n,
    });
  });

  it("validates a solana address", () => {
    expect(() => assertValidSolanaAddress("11111111111111111111111111111111")).not.toThrow();
    expect(() => assertValidSolanaAddress("bad-address")).toThrow(
      "Solana wallet address is invalid.",
    );
  });
});
