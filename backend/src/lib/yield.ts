import type {
  TransactionDirection,
  TransactionEntryType,
  YieldAction,
  YieldAsset,
} from "../types.js";
import type { AlchemyParsedTransactionResult } from "./alchemy.js";

export const JUPITER_LEND_EARN_PROGRAM_ID = "jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9";

interface YieldVaultMetadata {
  jlTokenMintAddress: string;
  label: string;
  underlyingMintAddress: string;
}

export const YIELD_VAULT_METADATA = {
  usdc: {
    jlTokenMintAddress: "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D",
    label: "Jupiter USDC Earn Vault",
    underlyingMintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
} satisfies Record<YieldAsset, YieldVaultMetadata>;

const yieldAssetByJlTokenMintAddress = new Map(
  Object.entries(YIELD_VAULT_METADATA).map(([asset, metadata]) => [metadata.jlTokenMintAddress, asset as YieldAsset]),
);

export function getYieldAssetByJlTokenMintAddress(value: string | null | undefined): YieldAsset | null {
  return value ? yieldAssetByJlTokenMintAddress.get(value) ?? null : null;
}

export function getYieldJlTokenMintAddress(asset: YieldAsset) {
  return YIELD_VAULT_METADATA[asset].jlTokenMintAddress;
}

export function getYieldVaultCounterpartyName(asset: YieldAsset) {
  return YIELD_VAULT_METADATA[asset].label;
}

export type YieldLedgerEntryType = Extract<TransactionEntryType, "yield_deposit" | "yield_withdraw">;

export function getYieldLedgerEntryType(action: YieldAction): YieldLedgerEntryType {
  return action === "deposit" ? "yield_deposit" : "yield_withdraw";
}

export function getYieldLedgerDirection(action: YieldAction): TransactionDirection {
  return action === "deposit" ? "outbound" : "inbound";
}

export function getYieldLedgerDirectionForEntryType(entryType: YieldLedgerEntryType): TransactionDirection {
  return entryType === "yield_deposit" ? "outbound" : "inbound";
}

export function buildYieldNormalizationKey(input: {
  asset: YieldAsset;
  entryType: YieldLedgerEntryType;
  signature: string;
  trackedWalletAddress: string;
}) {
  return `${input.signature}:yield:${input.asset}:${input.trackedWalletAddress}:${input.entryType}:${getYieldLedgerDirectionForEntryType(input.entryType)}`;
}

export function includesJupiterLendEarnInstruction(parsedTransaction: AlchemyParsedTransactionResult) {
  const instructions = [
    ...(parsedTransaction.transaction?.message?.instructions ?? []),
    ...((parsedTransaction.meta?.innerInstructions ?? []).flatMap(inner =>
      Array.isArray(inner.instructions) ? inner.instructions : [],
    )),
  ];

  return instructions.some(
    instruction =>
      typeof instruction.programId === "string" &&
      instruction.programId.trim() === JUPITER_LEND_EARN_PROGRAM_ID,
  );
}
