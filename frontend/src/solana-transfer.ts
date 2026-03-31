import { Buffer } from "buffer";

import {
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import { getTransferAssetDecimals, getTransferAssetMintAddress } from "@/assets";
import type { TransferAsset } from "@/types";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export type TokenTransferDestination =
  | { mode: "derived-associated-account" }
  | { mode: "explicit-token-account"; tokenAccountAddress: string };

export function buildSerializedTransferTransaction(input: {
  amountRaw: bigint;
  asset: TransferAsset;
  recentBlockhash: string;
  recipientAddress: string;
  recipientTokenAccountExists: boolean;
  senderAddress: string;
  tokenDestination?: TokenTransferDestination;
}) {
  const senderPublicKey = new PublicKey(input.senderAddress);
  const recipientPublicKey = new PublicKey(input.recipientAddress);
  const transaction = new Transaction();

  if (input.asset === "sol") {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: senderPublicKey,
        toPubkey: recipientPublicKey,
        lamports: input.amountRaw,
      }),
    );
  } else {
    const mint = new PublicKey(getTransferAssetMintAddress(input.asset));
    const decimals = getTransferAssetDecimals(input.asset);
    const senderAta = findAssociatedTokenAddress(senderPublicKey, mint);
    const tokenDestination = input.tokenDestination ?? { mode: "derived-associated-account" as const };
    const recipientTokenAccount = tokenDestination.mode === "explicit-token-account"
      ? new PublicKey(tokenDestination.tokenAccountAddress)
      : findAssociatedTokenAddress(recipientPublicKey, mint);

    if (!input.recipientTokenAccountExists) {
      if (tokenDestination.mode === "explicit-token-account") {
        throw new Error("Recipient token account does not exist.");
      }

      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderPublicKey,
          recipientTokenAccount,
          recipientPublicKey,
          mint,
        ),
      );
    }

    transaction.add(
      createTransferCheckedInstruction({
        amount: input.amountRaw,
        decimals,
        destination: recipientTokenAccount,
        mint,
        owner: senderPublicKey,
        source: senderAta,
      }),
    );
  }

  transaction.recentBlockhash = input.recentBlockhash;
  transaction.feePayer = senderPublicKey;

  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return Buffer.from(serializedTransaction).toString("base64");
}

export function parseTransferAmount(amount: string, decimals: number) {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid amount.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(
      `This asset supports up to ${decimals} decimal place${decimals === 1 ? "" : "s"}.`,
    );
  }

  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.padEnd(decimals, "0");
  const raw = BigInt(`${normalizedWhole}${normalizedFraction}` || "0");

  if (raw <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return {
    decimal: formatAmount(raw, decimals),
    raw,
  };
}

export function assertValidSolanaAddress(value: string) {
  try {
    new PublicKey(value);
  } catch {
    throw new Error("Solana wallet address is invalid.");
  }
}

export function findAssociatedTokenAddress(owner: PublicKey, mint: PublicKey) {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  return address;
}

function formatAmount(amount: bigint, decimals: number) {
  const value = amount.toString().padStart(decimals + 1, "0");
  const whole = value.slice(0, -decimals) || "0";
  const fraction = value.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

function createTransferCheckedInstruction(input: {
  amount: bigint;
  decimals: number;
  destination: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  source: PublicKey;
}) {
  const data = Buffer.alloc(10);
  data.writeUInt8(12, 0);
  data.writeBigUInt64LE(input.amount, 1);
  data.writeUInt8(input.decimals, 9);

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: input.source, isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.destination, isSigner: false, isWritable: true },
      { pubkey: input.owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}
