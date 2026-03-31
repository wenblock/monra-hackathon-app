// @vitest-environment node

import { Transaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  assertValidSolanaAddress,
  buildSerializedTransferTransaction,
  parseTransferAmount,
} from "@/solana-transfer";

const SENDER_ADDRESS = "11111111111111111111111111111111";
const RECIPIENT_ADDRESS = "8zjoiXGoW6V4G2mUPTBsAqnjxdnNxngAiKYSHwQTgfwE";
const DERIVED_USDC_ATA = "7FuLTNNPmhsjQLYWpEuqPH3Z4X9D7ChFxmXmefrxVUSB";

describe("solana-transfer", () => {
  it("parses transfer amounts using the provided precision", () => {
    expect(parseTransferAmount("1.2500", 6)).toEqual({
      decimal: "1.25",
      raw: 1250000n,
    });
  });

  it("validates a solana address", () => {
    expect(() => assertValidSolanaAddress("11111111111111111111111111111111")).not.toThrow();
    expect(() => assertValidSolanaAddress("bad-address")).toThrow(
      "Solana wallet address is invalid.",
    );
  });

  it("creates the recipient ATA before transferring SPL tokens to a fresh wallet", () => {
    const serializedTransaction = buildSerializedTransferTransaction({
      amountRaw: 1_000_000n,
      asset: "usdc",
      recentBlockhash: "11111111111111111111111111111111",
      recipientAddress: RECIPIENT_ADDRESS,
      recipientTokenAccountExists: false,
      senderAddress: SENDER_ADDRESS,
      tokenDestination: { mode: "derived-associated-account" },
    });
    const transaction = Transaction.from(Buffer.from(serializedTransaction, "base64"));

    expect(transaction.instructions).toHaveLength(2);
    expect(transaction.instructions[0]?.programId.toBase58()).toBe(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    );
    expect(transaction.instructions[1]?.programId.toBase58()).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );
    expect(transaction.instructions[0]?.keys[1]?.pubkey.toBase58()).toBe(DERIVED_USDC_ATA);
    expect(transaction.instructions[1]?.keys[2]?.pubkey.toBase58()).toBe(DERIVED_USDC_ATA);
  });

  it("rejects a missing explicit token account destination", () => {
    expect(() =>
      buildSerializedTransferTransaction({
        amountRaw: 1_000_000n,
        asset: "usdc",
        recentBlockhash: "11111111111111111111111111111111",
        recipientAddress: RECIPIENT_ADDRESS,
        recipientTokenAccountExists: false,
        senderAddress: SENDER_ADDRESS,
        tokenDestination: {
          mode: "explicit-token-account",
          tokenAccountAddress: DERIVED_USDC_ATA,
        },
      }),
    ).toThrow("Recipient token account does not exist.");
  });
});
