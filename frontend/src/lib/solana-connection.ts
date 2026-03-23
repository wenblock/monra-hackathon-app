import { Connection } from "@solana/web3.js";

const PUBLIC_MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";

export function resolveSolanaRpcUrl(input: {
  configuredSolanaRpcUrl?: string | null;
  isDev: boolean;
}) {
  const configuredSolanaRpcUrl = input.configuredSolanaRpcUrl?.trim();

  if (configuredSolanaRpcUrl) {
    return {
      usedFallback: false,
      url: configuredSolanaRpcUrl,
    };
  }

  if (input.isDev) {
    return {
      usedFallback: true,
      url: PUBLIC_MAINNET_RPC_URL,
    };
  }

  throw new Error("Missing required VITE_SOLANA_RPC_URL for non-development builds.");
}

const resolvedSolanaRpc = resolveSolanaRpcUrl({
  configuredSolanaRpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,
  isDev: import.meta.env.DEV,
});

if (resolvedSolanaRpc.usedFallback && import.meta.env.DEV) {
  console.warn(
    `VITE_SOLANA_RPC_URL is not configured. Falling back to ${resolvedSolanaRpc.url} in development.`,
  );
}

export const SOLANA_RPC_URL = resolvedSolanaRpc.url;
export const solanaConnection = new Connection(SOLANA_RPC_URL, "confirmed");
