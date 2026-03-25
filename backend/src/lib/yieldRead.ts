import { Client } from "@jup-ag/lend-read";
import { Connection, PublicKey } from "@solana/web3.js";

import { config } from "../config.js";
import { getTransferAssetMintAddress } from "./assets.js";

const ALCHEMY_SOLANA_RPC_URL = `https://solana-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`;
const yieldReadConnection = new Connection(ALCHEMY_SOLANA_RPC_URL, "confirmed");
const yieldReadClient = new Client(yieldReadConnection);
const USDC_MINT_ADDRESS = new PublicKey(getTransferAssetMintAddress("usdc"));

export async function fetchUsdcYieldCurrentPositionRaw(walletAddress: string) {
  const userPosition = await yieldReadClient.lending.getUserPosition(
    USDC_MINT_ADDRESS,
    new PublicKey(walletAddress),
  );

  return userPosition?.underlyingAssets.toString() ?? "0";
}
