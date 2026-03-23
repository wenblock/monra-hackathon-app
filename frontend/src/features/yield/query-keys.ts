export const yieldKeys = {
  all: ["yield"] as const,
  ledgerSummary: (userId: string) => [...yieldKeys.all, userId, "ledger-summary"] as const,
  onchain: (walletAddress: string) => [...yieldKeys.all, walletAddress, "onchain"] as const,
  preview: (asset: string, action: string, amountRaw: string) =>
    [...yieldKeys.all, asset, action, amountRaw, "preview"] as const,
};
