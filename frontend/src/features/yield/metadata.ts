import { getTransferAssetLabel, getTransferAssetMintAddress } from "@/assets";
import type { YieldAsset } from "@/types";

interface YieldAssetMetadata {
  iconPath: string;
  jlTokenMintAddress: string;
  label: string;
  underlyingMintAddress: string;
}

const YIELD_ASSET_METADATA = {
  usdc: {
    iconPath: "/jlusdc.webp",
    jlTokenMintAddress: "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D",
    label: getTransferAssetLabel("usdc"),
    underlyingMintAddress: getTransferAssetMintAddress("usdc"),
  },
} satisfies Record<YieldAsset, YieldAssetMetadata>;

export function getYieldAssetIconPath(asset: YieldAsset) {
  return YIELD_ASSET_METADATA[asset].iconPath;
}

export function getYieldAssetJlTokenMintAddress(asset: YieldAsset) {
  return YIELD_ASSET_METADATA[asset].jlTokenMintAddress;
}

export function getYieldAssetLabel(asset: YieldAsset) {
  return YIELD_ASSET_METADATA[asset].label;
}

export function getYieldAssetUnderlyingMintAddress(asset: YieldAsset) {
  return YIELD_ASSET_METADATA[asset].underlyingMintAddress;
}
