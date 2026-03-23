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

    lendReadMock.getJlTokenDetails.mockImplementation(async (mint: PublicKey) => {
      const mintAddress = mint.toBase58();

      if (mintAddress === getTransferAssetMintAddress("usdc")) {
        return {
          conversionRateToShares: new BN("990000"),
          decimals: 6,
          rewardsRate: new BN("5000000000"),
          supplyRate: new BN("33500000000"),
          tokenAddress: new PublicKey("7XS7mX4MHDLecxB2S98RMyCV2wAPYp4nH3UX77YPD4PE"),
          totalAssets: new BN("524000000000000"),
          totalSupply: new BN("522000000000000"),
          underlyingAddress: mint,
        };
      }

      return {
        conversionRateToShares: new BN("998000"),
        decimals: 6,
        rewardsRate: new BN("8000000000"),
        supplyRate: new BN("2600000000"),
        tokenAddress: new PublicKey("6qGhCjae4M7VjKuhUvW6xojEn3BhqxEmFi7qSogn8CA9"),
        totalAssets: new BN("13300000000000"),
        totalSupply: new BN("13300000000000"),
        underlyingAddress: mint,
      };
    });

    lendReadMock.getUserPosition.mockImplementation(async (mint: PublicKey) => {
      const mintAddress = mint.toBase58();

      if (mintAddress === getTransferAssetMintAddress("usdc")) {
        return {
          jlTokenShares: new BN("1750000"),
          underlyingAssets: new BN("1750000"),
          underlyingBalance: new BN("18870000"),
        };
      }

      return {
        jlTokenShares: new BN("500000"),
        underlyingAssets: new BN("500000"),
        underlyingBalance: new BN("0"),
      };
    });
  });

  it("fetches only the supported vaults without sweeping all jlTokens", async () => {
    const snapshot = await fetchYieldOnchainSnapshot("11111111111111111111111111111111");

    expect(Object.keys(snapshot.vaults)).toEqual(["usdc", "eurc"]);
    expect(snapshot.vaults.usdc.conversionRateToSharesRaw).toBe("990000");
    expect(snapshot.vaults.eurc.conversionRateToSharesRaw).toBe("998000");

    expect(lendReadMock.getJlTokenDetails).toHaveBeenCalledTimes(2);
    expect(lendReadMock.getUserPosition).toHaveBeenCalledTimes(2);
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
