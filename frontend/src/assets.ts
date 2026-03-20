import type { StablecoinAsset, TransferAsset } from "./types";

export interface TransferAssetMetadata {
  decimals: number;
  iconPath: string;
  label: string;
  mintAddress: string | null;
}

export const TRANSFER_ASSET_METADATA = {
  sol: {
    decimals: 9,
    iconPath: "/SOL.png",
    label: "SOL",
    mintAddress: null,
  },
  usdc: {
    decimals: 6,
    iconPath: "/USDC.png",
    label: "USDC",
    mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  eurc: {
    decimals: 6,
    iconPath: "/EURC.png",
    label: "EURC",
    mintAddress: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
  },
} satisfies Record<TransferAsset, TransferAssetMetadata>;

export const TRANSFER_ASSETS = Object.keys(TRANSFER_ASSET_METADATA) as TransferAsset[];
export const SPL_TRANSFER_ASSETS = TRANSFER_ASSETS.filter(
  asset => TRANSFER_ASSET_METADATA[asset].mintAddress !== null,
) as StablecoinAsset[];
export const ONRAMP_DESTINATION_ASSETS = SPL_TRANSFER_ASSETS;
export const OFFRAMP_SOURCE_ASSETS = SPL_TRANSFER_ASSETS;

export function getTransferAssetDecimals(asset: TransferAsset) {
  return TRANSFER_ASSET_METADATA[asset].decimals;
}

export function getTransferAssetLabel(asset: TransferAsset) {
  return TRANSFER_ASSET_METADATA[asset].label;
}

export function getTransferAssetIconPath(asset: TransferAsset) {
  return TRANSFER_ASSET_METADATA[asset].iconPath;
}

export function getTransferAssetMintAddress(asset: StablecoinAsset) {
  return TRANSFER_ASSET_METADATA[asset].mintAddress!;
}
