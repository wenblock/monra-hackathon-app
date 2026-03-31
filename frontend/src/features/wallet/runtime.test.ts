import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureSufficientSolForTransfer } from "@/solana-send";
import { buildSerializedTransferTransaction } from "@/solana-transfer";

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
  beforeEach(() => {
    vi.mocked(ensureSufficientSolForTransfer).mockClear();
    vi.mocked(buildSerializedTransferTransaction).mockClear();
  });

  it("prepares a derived ATA transfer after dynamic import", async () => {
    const runtime = await import("@/features/wallet/runtime");
    const parsedAmount = runtime.parseAssetAmount("0.25", "usdc");
    const prepared = runtime.prepareTransferTransaction({
      amountRaw: parsedAmount.raw,
      asset: "usdc",
      balances: {
        sol: { formatted: "1.00", raw: "1000000000" },
        usdc: { formatted: "10.00", raw: "10000000" },
        eurc: { formatted: "10.00", raw: "10000000" },
      },
      recentBlockhash: "11111111111111111111111111111111",
      recipientAddress: "11111111111111111111111111111111",
      recipientTokenAccountExists: false,
      senderAddress: "11111111111111111111111111111111",
      tokenDestination: { mode: "derived-associated-account" },
    });

    expect(parsedAmount.decimal).toBe("0.25");
    expect(prepared.needsRecipientTokenAccountCreation).toBe(true);
    expect(prepared.serializedTransaction).toBe("serialized-transaction");
    expect(vi.mocked(ensureSufficientSolForTransfer)).toHaveBeenCalledWith({
      amountRaw: 250000000n,
      asset: "usdc",
      needsRecipientTokenAccountCreation: true,
      solBalanceRaw: "1000000000",
    });
    expect(vi.mocked(buildSerializedTransferTransaction)).toHaveBeenCalledWith({
      amountRaw: 250000000n,
      asset: "usdc",
      recentBlockhash: "11111111111111111111111111111111",
      recipientAddress: "11111111111111111111111111111111",
      recipientTokenAccountExists: false,
      senderAddress: "11111111111111111111111111111111",
      tokenDestination: { mode: "derived-associated-account" },
    });
  });
});
