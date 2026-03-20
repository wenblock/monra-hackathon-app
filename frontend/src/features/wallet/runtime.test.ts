import { describe, expect, it, vi } from "vitest";

vi.mock("@/solana-send", () => ({
  ensureSufficientSolForTransfer: vi.fn(),
  normalizeSolanaSendError: vi.fn(() => "normalized error"),
}));

vi.mock("@/solana-transfer", () => ({
  assertValidSolanaAddress: vi.fn(),
  buildSerializedTransferTransaction: vi.fn(() => "serialized-transaction"),
  findAssociatedTokenAddress: vi.fn(() => ({
    toBase58: () => "recipient-token-account",
  })),
  parseTransferAmount: vi.fn(() => ({
    decimal: "0.25",
    raw: 250000000n,
  })),
}));

describe("wallet runtime", () => {
  it("prepares a transfer transaction after dynamic import", async () => {
    const runtime = await import("@/features/wallet/runtime");
    const parsedAmount = runtime.parseAssetAmount("0.25", "sol");
    const prepared = runtime.prepareTransferTransaction({
      amountRaw: parsedAmount.raw,
      asset: "sol",
      balances: {
        sol: { formatted: "1.00", raw: "1000000000" },
        usdc: { formatted: "10.00", raw: "10000000" },
        eurc: { formatted: "10.00", raw: "10000000" },
      },
      recentBlockhash: "11111111111111111111111111111111",
      recipientAddress: "11111111111111111111111111111111",
      recipientTokenAccountExists: false,
      senderAddress: "11111111111111111111111111111111",
    });

    expect(parsedAmount.decimal).toBe("0.25");
    expect(prepared.needsRecipientTokenAccountCreation).toBe(false);
    expect(prepared.serializedTransaction).toBe("serialized-transaction");
  });
});
