import type { AppUser, TransactionDirection, TransactionEntryType, TransferAsset } from "../types.js";
import { formatTokenAmount, type AlchemyParsedTransactionResult } from "./alchemy.js";
import { getSplTokenAssetByMintAddress, getTransferAssetDecimals, isYieldAsset } from "./assets.js";
import {
  getYieldAssetByJlTokenMintAddress,
  getYieldJlTokenMintAddress,
  getYieldVaultCounterpartyName,
  includesJupiterLendEarnInstruction,
} from "./yield.js";

interface AlchemyWebhookTransactionItem {
  signature?: string;
}

interface AlchemyWebhookPayload {
  webhookId?: string;
  id?: string;
  createdAt?: string;
  type?: string;
  event?: {
    network?: string;
    transaction?: AlchemyWebhookTransactionItem[];
  };
}

interface ParsedInstruction {
  key: string;
  program?: string;
  parsedType?: string;
  info: Record<string, unknown>;
}

interface NormalizedLedgerEntryCandidate {
  userId: number;
  direction: TransactionDirection;
  entryType: TransactionEntryType;
  asset: TransferAsset;
  amountDecimal: string;
  amountRaw: string;
  trackedWalletAddress: string;
  fromWalletAddress: string;
  counterpartyName?: string | null;
  counterpartyWalletAddress?: string | null;
  transactionSignature: string;
  normalizationKey: string;
  confirmedAt: Date;
}

export function extractAlchemyAddressActivityEvent(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as AlchemyWebhookPayload;
  if (record.type !== "ADDRESS_ACTIVITY") {
    return null;
  }

  if (record.event?.network !== "SOLANA_MAINNET") {
    return null;
  }

  if (typeof record.id !== "string" || typeof record.webhookId !== "string") {
    return null;
  }

  const signatures = Array.isArray(record.event?.transaction)
    ? record.event.transaction
        .map(item => (typeof item.signature === "string" ? item.signature.trim() : ""))
        .filter(Boolean)
    : [];

  return {
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    eventId: record.id,
    signatures: Array.from(new Set(signatures)),
    webhookId: record.webhookId,
  };
}

export function normalizeAlchemyTransaction(input: {
  parsedTransaction: AlchemyParsedTransactionResult;
  signature: string;
  usersByAddress: Map<string, AppUser>;
}) {
  const accountKeys = getAccountKeys(input.parsedTransaction);
  const flattenedInstructions = flattenInstructions(input.parsedTransaction);
  const tokenOwnersByAccount = createTokenOwnersByAccount(input.parsedTransaction, accountKeys);
  const normalizedEntries: NormalizedLedgerEntryCandidate[] = [];
  const confirmedAt =
    typeof input.parsedTransaction.blockTime === "number"
      ? new Date(input.parsedTransaction.blockTime * 1000)
      : new Date();

  for (const instruction of flattenedInstructions) {
    if (instruction.program === "system" && instruction.parsedType === "transfer") {
      const source = readString(instruction.info.source);
      const destination = readString(instruction.info.destination);
      const lamports = readBigInt(instruction.info.lamports);

      if (!source || !destination || lamports === null || lamports <= 0n) {
        continue;
      }

      const amountRaw = lamports.toString();
      const amountDecimal = formatTokenAmount(amountRaw, 9);

      const sourceUser = input.usersByAddress.get(source);
      if (sourceUser) {
        normalizedEntries.push({
          amountDecimal,
          amountRaw,
          asset: "sol",
          confirmedAt,
          counterpartyWalletAddress: destination,
          direction: "outbound",
          entryType: "transfer",
          fromWalletAddress: source,
          normalizationKey: buildNormalizationKey(
            input.signature,
            instruction.key,
            source,
            "transfer",
            "outbound",
          ),
          trackedWalletAddress: source,
          transactionSignature: input.signature,
          userId: sourceUser.id,
        });
      }

      const destinationUser = input.usersByAddress.get(destination);
      if (destinationUser) {
        normalizedEntries.push({
          amountDecimal,
          amountRaw,
          asset: "sol",
          confirmedAt,
          counterpartyWalletAddress: source,
          direction: "inbound",
          entryType: "transfer",
          fromWalletAddress: source,
          normalizationKey: buildNormalizationKey(
            input.signature,
            instruction.key,
            destination,
            "transfer",
            "inbound",
          ),
          trackedWalletAddress: destination,
          transactionSignature: input.signature,
          userId: destinationUser.id,
        });
      }
    }

    if (instruction.program !== "spl-token" && instruction.program !== "spl-token-2022") {
      continue;
    }

    if (instruction.parsedType !== "transfer" && instruction.parsedType !== "transferChecked") {
      continue;
    }

    const sourceTokenAddress = readString(instruction.info.source);
    const destinationTokenAddress = readString(instruction.info.destination);
    const rawAmount =
      readBigInt(instruction.info.amount) ?? readBigInt(readNestedAmount(instruction.info.tokenAmount));

    if (!sourceTokenAddress || !destinationTokenAddress || rawAmount === null || rawAmount <= 0n) {
      continue;
    }

    const sourceTokenInfo = tokenOwnersByAccount.get(sourceTokenAddress);
    const destinationTokenInfo = tokenOwnersByAccount.get(destinationTokenAddress);

    const tokenAsset =
      getSplTokenAssetByMintAddress(sourceTokenInfo?.mint) ??
      getSplTokenAssetByMintAddress(destinationTokenInfo?.mint);

    if (!tokenAsset) {
      continue;
    }

    const sourceOwner = sourceTokenInfo?.owner ?? null;
    const destinationOwner = destinationTokenInfo?.owner ?? null;
    const amountRaw = rawAmount.toString();
    const amountDecimal = formatTokenAmount(amountRaw, getTransferAssetDecimals(tokenAsset));

    if (sourceOwner) {
      const sourceUser = input.usersByAddress.get(sourceOwner);
      if (sourceUser) {
        normalizedEntries.push({
          amountDecimal,
          amountRaw,
          asset: tokenAsset,
          confirmedAt,
          counterpartyWalletAddress: destinationOwner ?? destinationTokenAddress,
          direction: "outbound",
          entryType: "transfer",
          fromWalletAddress: sourceOwner,
          normalizationKey: buildNormalizationKey(
            input.signature,
            instruction.key,
            sourceOwner,
            "transfer",
            "outbound",
          ),
          trackedWalletAddress: sourceOwner,
          transactionSignature: input.signature,
          userId: sourceUser.id,
        });
      }
    }

    if (destinationOwner) {
      const destinationUser = input.usersByAddress.get(destinationOwner);
      if (destinationUser) {
        normalizedEntries.push({
          amountDecimal,
          amountRaw,
          asset: tokenAsset,
          confirmedAt,
          counterpartyWalletAddress: sourceOwner ?? sourceTokenAddress,
          direction: "inbound",
          entryType: "transfer",
          fromWalletAddress: sourceOwner ?? destinationOwner,
          normalizationKey: buildNormalizationKey(
            input.signature,
            instruction.key,
            destinationOwner,
            "transfer",
            "inbound",
          ),
          trackedWalletAddress: destinationOwner,
          transactionSignature: input.signature,
          userId: destinationUser.id,
        });
      }
    }
  }

  reclassifyYieldEntries({
    normalizedEntries,
    parsedTransaction: input.parsedTransaction,
    signature: input.signature,
  });

  const payer = getFeePayerAddress(input.parsedTransaction, accountKeys);
  const fee = Number.isFinite(input.parsedTransaction.meta?.fee)
    ? BigInt(input.parsedTransaction.meta?.fee ?? 0)
    : 0n;
  const feeUser = payer ? input.usersByAddress.get(payer) : undefined;

  if (feeUser && payer && fee > 0n) {
    normalizedEntries.push({
      amountDecimal: formatTokenAmount(fee.toString(), 9),
      amountRaw: fee.toString(),
      asset: "sol",
      confirmedAt,
      counterpartyName: "Solana Network Fee",
      counterpartyWalletAddress: null,
      direction: "outbound",
      entryType: "network_fee",
      fromWalletAddress: payer,
      normalizationKey: buildNormalizationKey(input.signature, "fee", payer, "network_fee", "outbound"),
      trackedWalletAddress: payer,
      transactionSignature: input.signature,
      userId: feeUser.id,
    });
  }

  return normalizedEntries;
}

function reclassifyYieldEntries(input: {
  normalizedEntries: NormalizedLedgerEntryCandidate[];
  parsedTransaction: AlchemyParsedTransactionResult;
  signature: string;
}) {
  if (!includesJupiterLendEarnInstruction(input.parsedTransaction)) {
    return;
  }

  const ownerMintDeltas = createOwnerMintDeltas(input.parsedTransaction);

  for (const entry of input.normalizedEntries) {
    if (entry.entryType !== "transfer" || !isYieldAsset(entry.asset)) {
      continue;
    }

    const shareDelta =
      ownerMintDeltas.get(`${entry.trackedWalletAddress}:${getYieldJlTokenMintAddress(entry.asset)}`) ?? 0n;

    if (entry.direction === "outbound" && shareDelta > 0n) {
      entry.entryType = "yield_deposit";
      entry.counterpartyName = getYieldVaultCounterpartyName(entry.asset);
      entry.normalizationKey = buildNormalizationKey(
        input.signature,
        `yield:${entry.asset}`,
        entry.trackedWalletAddress,
        entry.entryType,
        entry.direction,
      );
      continue;
    }

    if (entry.direction === "inbound" && shareDelta < 0n) {
      entry.entryType = "yield_withdraw";
      entry.counterpartyName = getYieldVaultCounterpartyName(entry.asset);
      entry.normalizationKey = buildNormalizationKey(
        input.signature,
        `yield:${entry.asset}`,
        entry.trackedWalletAddress,
        entry.entryType,
        entry.direction,
      );
    }
  }
}

export function extractCandidateWalletAddresses(parsedTransaction: AlchemyParsedTransactionResult) {
  const accountKeys = getAccountKeys(parsedTransaction);
  const candidateAddresses = new Set<string>(accountKeys);

  const feePayer = getFeePayerAddress(parsedTransaction, accountKeys);
  if (feePayer) {
    candidateAddresses.add(feePayer);
  }

  for (const tokenBalance of [
    ...(parsedTransaction.meta?.preTokenBalances ?? []),
    ...(parsedTransaction.meta?.postTokenBalances ?? []),
  ]) {
    if (typeof tokenBalance.owner === "string" && tokenBalance.owner.trim().length > 0) {
      candidateAddresses.add(tokenBalance.owner);
    }
  }

  for (const instruction of flattenInstructions(parsedTransaction)) {
    const source = readString(instruction.info.source);
    const destination = readString(instruction.info.destination);

    if (source) {
      candidateAddresses.add(source);
    }

    if (destination) {
      candidateAddresses.add(destination);
    }
  }

  return Array.from(candidateAddresses);
}

function getAccountKeys(parsedTransaction: AlchemyParsedTransactionResult) {
  const accountKeys = parsedTransaction.transaction?.message?.accountKeys ?? [];

  return accountKeys
    .map(accountKey => {
      if (typeof accountKey === "string") {
        return accountKey;
      }

      return typeof accountKey.pubkey === "string" ? accountKey.pubkey : null;
    })
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function flattenInstructions(parsedTransaction: AlchemyParsedTransactionResult): ParsedInstruction[] {
  const instructions: ParsedInstruction[] = [];
  const topLevelInstructions = parsedTransaction.transaction?.message?.instructions ?? [];

  topLevelInstructions.forEach((instruction, index) => {
    instructions.push({
      info:
        instruction.parsed && typeof instruction.parsed.info === "object" && instruction.parsed.info
          ? instruction.parsed.info
          : {},
      key: `top:${index}`,
      parsedType: instruction.parsed?.type,
      program: instruction.program,
    });
  });

  for (const innerSet of parsedTransaction.meta?.innerInstructions ?? []) {
    const innerInstructions = Array.isArray(innerSet.instructions) ? innerSet.instructions : [];

    innerInstructions.forEach((instruction, index) => {
      instructions.push({
        info:
          instruction.parsed && typeof instruction.parsed.info === "object" && instruction.parsed.info
            ? instruction.parsed.info
            : {},
        key: `inner:${innerSet.index ?? 0}:${index}`,
        parsedType: instruction.parsed?.type,
        program: instruction.program,
      });
    });
  }

  return instructions;
}

function createTokenOwnersByAccount(
  parsedTransaction: AlchemyParsedTransactionResult,
  accountKeys: string[],
) {
  const ownersByAccount = new Map<string, { mint: string | null; owner: string | null }>();
  const allTokenBalances = [
    ...(parsedTransaction.meta?.preTokenBalances ?? []),
    ...(parsedTransaction.meta?.postTokenBalances ?? []),
  ];

  for (const tokenBalance of allTokenBalances) {
    const accountIndex =
      typeof tokenBalance.accountIndex === "number" ? tokenBalance.accountIndex : null;

    if (accountIndex === null) {
      continue;
    }

    const accountAddress = accountKeys[accountIndex];
    if (!accountAddress) {
      continue;
    }

    ownersByAccount.set(accountAddress, {
      mint: typeof tokenBalance.mint === "string" ? tokenBalance.mint : null,
      owner: typeof tokenBalance.owner === "string" ? tokenBalance.owner : null,
    });
  }

  return ownersByAccount;
}

function createOwnerMintDeltas(parsedTransaction: AlchemyParsedTransactionResult) {
  const balancesByOwnerMint = new Map<string, { post: bigint; pre: bigint }>();

  for (const tokenBalance of parsedTransaction.meta?.preTokenBalances ?? []) {
    const owner = typeof tokenBalance.owner === "string" ? tokenBalance.owner : null;
    const mint = resolveYieldRelevantMint(tokenBalance.mint);
    const amount = readBigInt(tokenBalance.uiTokenAmount?.amount);

    if (!owner || !mint || amount === null) {
      continue;
    }

    const key = `${owner}:${mint}`;
    const current = balancesByOwnerMint.get(key) ?? { post: 0n, pre: 0n };
    current.pre += amount;
    balancesByOwnerMint.set(key, current);
  }

  for (const tokenBalance of parsedTransaction.meta?.postTokenBalances ?? []) {
    const owner = typeof tokenBalance.owner === "string" ? tokenBalance.owner : null;
    const mint = resolveYieldRelevantMint(tokenBalance.mint);
    const amount = readBigInt(tokenBalance.uiTokenAmount?.amount);

    if (!owner || !mint || amount === null) {
      continue;
    }

    const key = `${owner}:${mint}`;
    const current = balancesByOwnerMint.get(key) ?? { post: 0n, pre: 0n };
    current.post += amount;
    balancesByOwnerMint.set(key, current);
  }

  return new Map(
    Array.from(balancesByOwnerMint.entries()).map(([key, amounts]) => [key, amounts.post - amounts.pre]),
  );
}

function resolveYieldRelevantMint(value: string | null | undefined) {
  const shareAsset = getYieldAssetByJlTokenMintAddress(value);
  return shareAsset ? getYieldJlTokenMintAddress(shareAsset) : null;
}

function getFeePayerAddress(parsedTransaction: AlchemyParsedTransactionResult, accountKeys: string[]) {
  const rawAccountKeys = parsedTransaction.transaction?.message?.accountKeys ?? [];

  for (const accountKey of rawAccountKeys) {
    if (typeof accountKey === "object" && accountKey && accountKey.signer && typeof accountKey.pubkey === "string") {
      return accountKey.pubkey;
    }
  }

  return accountKeys[0] ?? null;
}

function buildNormalizationKey(
  signature: string,
  instructionKey: string,
  trackedWalletAddress: string,
  entryType: TransactionEntryType,
  direction: TransactionDirection,
) {
  return `${signature}:${instructionKey}:${trackedWalletAddress}:${entryType}:${direction}`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBigInt(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && value.trim().length > 0 && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  return null;
}

function readNestedAmount(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("amount" in value) {
    return value.amount;
  }

  return null;
}
