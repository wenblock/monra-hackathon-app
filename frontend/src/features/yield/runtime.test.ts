import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTransferAssetMintAddress } from "@/assets";

import { estimateYieldPreviewSharesRaw, fetchYieldOnchainSnapshot } from "./runtime";

const lendReadMock = vi.hoisted(() => ({
  getAllJlTokenDetails: vi.fn(),
  getJlTokenDetails: vi.fn(),
  getPreviews: vi.fn(),
  getUserPosition: vi.fn(),
  getUserPositions: vi.fn(),
}));

vi.mock("@jup-ag/lend-read", () => ({
  Client: class {
    lending = lendReadMock;
  },
}));

vi.mock("@/lib/browser-polyfills", () => ({
  getInstalledBuffer: () => Buffer,
  installBrowserPolyfills: vi.fn(),
}));

vi.mock("@/lib/solana-connection", () => ({
  solanaConnection: {},
}));

describe("yield runtime", () => {
  beforeEach(() => {
    lendReadMock.getAllJlTokenDetails.mockReset();
    lendReadMock.getJlTokenDetails.mockReset();
    lendReadMock.getPreviews.mockReset();
    lendReadMock.getUserPosition.mockReset();
    lendReadMock.getUserPositions.mockReset();

    lendReadMock.getJlTokenDetails.mockImplementation(async (mint: PublicKey) => ({
      conversionRateToShares: new BN("990000"),
      decimals: 6,
      rewardsRate: new BN("0"),
      supplyRate: new BN("223"),
      tokenAddress: new PublicKey("7XS7mX4MHDLecxB2S98RMyCV2wAPYp4nH3UX77YPD4PE"),
      totalAssets: new BN("517700000000000"),
      totalSupply: new BN("515000000000000"),
      underlyingAddress: mint,
    }));

    lendReadMock.getUserPosition.mockImplementation(async (mint: PublicKey) => {
      expect(mint.toBase58()).toBe(getTransferAssetMintAddress("usdc"));

      return {
        jlTokenShares: new BN("4467099"),
        underlyingAssets: new BN("4467099"),
        underlyingBalance: new BN("4467116"),
      };
    });
  });

  it("fetches only the usdc vault without sweeping all jlTokens", async () => {
    const snapshot = await fetchYieldOnchainSnapshot("11111111111111111111111111111111");

    expect(Object.keys(snapshot.vaults)).toEqual(["usdc"]);
    expect(snapshot.vaults.usdc.conversionRateToSharesRaw).toBe("990000");

    expect(lendReadMock.getJlTokenDetails).toHaveBeenCalledTimes(1);
    expect(lendReadMock.getUserPosition).toHaveBeenCalledTimes(1);
    expect(lendReadMock.getAllJlTokenDetails).not.toHaveBeenCalled();
    expect(lendReadMock.getUserPositions).not.toHaveBeenCalled();
    expect(lendReadMock.getPreviews).not.toHaveBeenCalled();
  });

  it("computes estimated shares locally from the cached conversion rate", () => {
    expect(
      estimateYieldPreviewSharesRaw({
        amountRaw: "1500000",
        asset: "usdc",
        conversionRateToSharesRaw: "990000",
      }),
    ).toBe("1485000");
  });
});
