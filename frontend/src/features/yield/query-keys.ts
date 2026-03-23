export const yieldKeys = {
  all: ["yield"] as const,
  ledgerSummary: (userId: string) => [...yieldKeys.all, userId, "ledger-summary"] as const,
  onchain: (walletAddress: string) => [...yieldKeys.all, walletAddress, "onchain"] as const,
};
