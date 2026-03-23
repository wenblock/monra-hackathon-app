import { Connection } from "@solana/web3.js";

const configuredSolanaRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL?.trim();

export const SOLANA_RPC_URL = configuredSolanaRpcUrl || "https://api.mainnet-beta.solana.com";
export const solanaConnection = new Connection(SOLANA_RPC_URL, "confirmed");
