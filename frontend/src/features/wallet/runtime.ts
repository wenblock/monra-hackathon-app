import { PublicKey } from "@solana/web3.js";

import { getTransferAssetDecimals, getTransferAssetMintAddress } from "@/assets";
import { ensureSufficientSolForTransfer, normalizeSolanaSendError } from "@/solana-send";
import {
  assertValidSolanaAddress as assertRuntimeSolanaAddress,
  buildSerializedTransferTransaction,
  findAssociatedTokenAddress,
  parseTransferAmount,
  type TokenTransferDestination as RuntimeTokenTransferDestination,
} from "@/solana-transfer";
import type { SolanaBalancesResponse, TransferAsset } from "@/types";

export type TokenTransferDestination = RuntimeTokenTransferDestination;

export function assertValidSolanaAddress(value: string) {
  assertRuntimeSolanaAddress(value);
}

export function getAssetDecimals(asset: TransferAsset) {
  return getTransferAssetDecimals(asset);
}

export function parseAssetAmount(amount: string, asset: TransferAsset) {
  return parseTransferAmount(amount, getTransferAssetDecimals(asset));
}

export function getRecipientTokenAccountAddress(asset: TransferAsset, recipientAddress: string) {
  if (asset === "sol") {
    return undefined;
  }

  const mint = new PublicKey(getTransferAssetMintAddress(asset));
  const recipientPublicKey = new PublicKey(recipientAddress);

  return findAssociatedTokenAddress(recipientPublicKey, mint).toBase58();
}

export function prepareTransferTransaction(input: {
  amountRaw: bigint;
  asset: TransferAsset;
  balances?: SolanaBalancesResponse["balances"];
  recentBlockhash: string;
  recipientAddress: string;
  recipientTokenAccountExists: boolean;
  senderAddress: string;
  tokenDestination?: RuntimeTokenTransferDestination;
}) {
  const needsRecipientTokenAccountCreation =
    input.asset !== "sol" && !input.recipientTokenAccountExists;
  const tokenDestination = input.asset === "sol"
    ? undefined
    : input.tokenDestination ?? { mode: "derived-associated-account" as const };

  ensureSufficientSolForTransfer({
    amountRaw: input.amountRaw,
    asset: input.asset,
    needsRecipientTokenAccountCreation,
    solBalanceRaw: input.balances?.sol.raw,
  });

  return {
    needsRecipientTokenAccountCreation,
    serializedTransaction: buildSerializedTransferTransaction({
      amountRaw: input.amountRaw,
      asset: input.asset,
      recentBlockhash: input.recentBlockhash,
      recipientAddress: input.recipientAddress,
      recipientTokenAccountExists: input.recipientTokenAccountExists,
      senderAddress: input.senderAddress,
      tokenDestination,
    }),
  };
}

export function normalizeWalletTransactionError(
  error: unknown,
  context: {
    asset: TransferAsset;
    needsRecipientTokenAccountCreation?: boolean;
  },
) {
  return normalizeSolanaSendError(error, context);
}
