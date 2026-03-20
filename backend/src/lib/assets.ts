import type { StablecoinAsset, TransferAsset } from "../types.js";

export const SOLANA_NATIVE_MINT_ADDRESS = "So11111111111111111111111111111111111111112";

export interface TransferAssetMetadata {
  decimals: number;
  label: string;
  mintAddress: string | null;
}

export const TRANSFER_ASSET_METADATA = {
  sol: {
    decimals: 9,
    label: "SOL",
    mintAddress: SOLANA_NATIVE_MINT_ADDRESS,
  },
  usdc: {
    decimals: 6,
    label: "USDC",
    mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  eurc: {
    decimals: 6,
    label: "EURC",
    mintAddress: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
  },
} satisfies Record<TransferAsset, TransferAssetMetadata>;

export const TRANSFER_ASSETS = Object.keys(TRANSFER_ASSET_METADATA) as TransferAsset[];
export const SPL_TRANSFER_ASSETS = TRANSFER_ASSETS.filter(
  asset => asset !== "sol",
) as StablecoinAsset[];
export const ONRAMP_DESTINATION_ASSETS = SPL_TRANSFER_ASSETS;
export const OFFRAMP_SOURCE_ASSETS = SPL_TRANSFER_ASSETS;

const splAssetMintToAsset = new Map(
  SPL_TRANSFER_ASSETS.map(asset => [TRANSFER_ASSET_METADATA[asset].mintAddress!, asset]),
);

const assetMintToAsset = new Map(
  TRANSFER_ASSETS.map(asset => [TRANSFER_ASSET_METADATA[asset].mintAddress!, asset]),
);

export function getTransferAssetDecimals(asset: TransferAsset) {
  return TRANSFER_ASSET_METADATA[asset].decimals;
}

export function getTransferAssetLabel(asset: TransferAsset) {
  return TRANSFER_ASSET_METADATA[asset].label;
}

export function getTransferAssetMintAddress(asset: TransferAsset) {
  return TRANSFER_ASSET_METADATA[asset].mintAddress!;
}

export function getSplTokenAssetByMintAddress(
  value: string | null | undefined,
): StablecoinAsset | null {
  return value ? splAssetMintToAsset.get(value) ?? null : null;
}

export function getTransferAssetByMintAddress(value: string | null | undefined): TransferAsset | null {
  return value ? assetMintToAsset.get(value) ?? null : null;
}

export function isOnrampDestinationAsset(asset: TransferAsset): asset is StablecoinAsset {
  return asset !== "sol";
}

export function isOfframpSourceAsset(asset: TransferAsset): asset is StablecoinAsset {
  return asset !== "sol";
}
