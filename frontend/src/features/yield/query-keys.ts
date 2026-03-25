export const yieldKeys = {
  all: ["yield"] as const,
  positions: (userId: string) => [...yieldKeys.all, userId, "positions"] as const,
  onchain: (walletAddress: string) => [...yieldKeys.all, walletAddress, "onchain"] as const,
};
