import { describe, expect, it } from "vitest";

import { resolveSolanaRpcUrl } from "@/lib/solana-connection";

describe("resolveSolanaRpcUrl", () => {
  it("uses the configured RPC URL when provided", () => {
    expect(
      resolveSolanaRpcUrl({
        configuredSolanaRpcUrl: "https://solana-mainnet.g.alchemy.com/v2/test-key",
        isDev: false,
      }),
    ).toEqual({
      url: "https://solana-mainnet.g.alchemy.com/v2/test-key",
      usedFallback: false,
    });
  });

  it("falls back to the public mainnet RPC in development only", () => {
    expect(
      resolveSolanaRpcUrl({
        configuredSolanaRpcUrl: undefined,
        isDev: true,
      }),
    ).toEqual({
      url: "https://api.mainnet-beta.solana.com",
      usedFallback: true,
    });
  });

  it("throws when the RPC URL is missing outside development", () => {
    expect(() =>
      resolveSolanaRpcUrl({
        configuredSolanaRpcUrl: "",
        isDev: false,
      }),
    ).toThrow(/VITE_SOLANA_RPC_URL/i);
  });
});
