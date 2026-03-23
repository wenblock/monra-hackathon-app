import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

import {
  getTransferAssetDecimals,
  getTransferAssetLabel,
  getTransferAssetMintAddress,
} from "@/assets";
import { getInstalledBuffer, installBrowserPolyfills } from "@/lib/browser-polyfills";
import { solanaConnection } from "@/lib/solana-connection";
import type { YieldAction, YieldAsset } from "@/types";

const YIELD_ASSETS = ["usdc", "eurc"] as const satisfies YieldAsset[];

interface YieldOnchainVaultSnapshot {
  asset: YieldAsset;
  conversionRateToSharesRaw: string;
  decimals: number;
  jlTokenMintAddress: string;
  rewardsRateRaw: string;
  supplyRateRaw: string;
  totalAssetsRaw: string;
  totalSupplyRaw: string;
  underlyingAddress: string;
  userJlTokenSharesRaw: string;
  userPositionRaw: string;
  walletBalanceRaw: string;
}

interface YieldOnchainSnapshot {
  vaults: Record<YieldAsset, YieldOnchainVaultSnapshot>;
}

export async function fetchYieldOnchainSnapshot(walletAddress: string): Promise<YieldOnchainSnapshot> {
  installBrowserPolyfills();
  const { Client } = await import("@jup-ag/lend-read");
  const client = new Client(solanaConnection);
  const user = new PublicKey(walletAddress);
  const [details, positions] = await Promise.all([
    Promise.all(
      YIELD_ASSETS.map(async asset => {
        const mint = new PublicKey(getTransferAssetMintAddress(asset));

        return [asset, await client.lending.getJlTokenDetails(mint)] as const;
      }),
    ),
    Promise.all(
      YIELD_ASSETS.map(async asset => {
        const mint = new PublicKey(getTransferAssetMintAddress(asset));

        return [asset, await client.lending.getUserPosition(mint, user)] as const;
      }),
    ),
  ]);
  const detailsByAsset = new Map(details);
  const positionsByAsset = new Map(positions);

  return {
    vaults: Object.fromEntries(
      YIELD_ASSETS.map(asset => {
        const detail = detailsByAsset.get(asset);
        const position = positionsByAsset.get(asset);

        if (!detail) {
          throw new Error(`Yield vault data is unavailable for ${getTransferAssetLabel(asset)}.`);
        }

        return [
          asset,
          {
            asset,
            conversionRateToSharesRaw: detail.conversionRateToShares.toString(),
            decimals: detail.decimals,
            jlTokenMintAddress: detail.tokenAddress.toBase58(),
            rewardsRateRaw: detail.rewardsRate.toString(),
            supplyRateRaw: detail.supplyRate.toString(),
            totalAssetsRaw: detail.totalAssets.toString(),
            totalSupplyRaw: detail.totalSupply.toString(),
            underlyingAddress: detail.underlyingAddress.toBase58(),
            userJlTokenSharesRaw: position?.jlTokenShares.toString() ?? "0",
            userPositionRaw: position?.underlyingAssets.toString() ?? "0",
            walletBalanceRaw: position?.underlyingBalance.toString() ?? "0",
          } satisfies YieldOnchainVaultSnapshot,
        ];
      }),
    ) as Record<YieldAsset, YieldOnchainVaultSnapshot>,
  };
}

export async function buildYieldTransaction(input: {
  action: YieldAction;
  amountRaw: string;
  asset: YieldAsset;
  walletAddress: string;
}) {
  installBrowserPolyfills();
  const [lendModule, bnModule] = await Promise.all([import("@jup-ag/lend/earn"), import("bn.js")]);
  const BN = (bnModule.default ?? bnModule) as typeof import("bn.js");
  const Buffer = getInstalledBuffer();
  const assetPublicKey = new PublicKey(getTransferAssetMintAddress(input.asset));
  const signerPublicKey = new PublicKey(input.walletAddress);
  const amount = new BN(input.amountRaw);
  const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash("confirmed");
  const instructionResult =
    input.action === "deposit"
      ? await lendModule.getDepositIxs({
          amount,
          asset: assetPublicKey,
          connection: solanaConnection,
          signer: signerPublicKey,
        })
      : await lendModule.getWithdrawIxs({
          amount,
          asset: assetPublicKey,
          connection: solanaConnection,
          signer: signerPublicKey,
        });
  const message = new TransactionMessage({
    instructions: instructionResult.ixs,
    payerKey: signerPublicKey,
    recentBlockhash: blockhash,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);

  return {
    blockhash,
    lastValidBlockHeight,
    serializedTransaction: Buffer.from(transaction.serialize()).toString("base64"),
  };
}

export async function confirmYieldSignature(input: {
  blockhash: string;
  lastValidBlockHeight: number;
  signature: string;
}) {
  const confirmation = await solanaConnection.confirmTransaction(
    {
      blockhash: input.blockhash,
      lastValidBlockHeight: input.lastValidBlockHeight,
      signature: input.signature,
    },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error("Yield transaction failed on-chain.");
  }
}

export function formatYieldRawAmount(rawAmount: string, asset: YieldAsset) {
  return formatRawAmount(rawAmount, getTransferAssetDecimals(asset));
}

export function parseYieldAmount(value: string, asset: YieldAsset) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      error: null,
      normalizedDecimal: null,
      rawAmount: null,
    };
  }

  const decimals = getTransferAssetDecimals(asset);
  const amountPattern = new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`);

  if (!amountPattern.test(trimmed)) {
    return {
      error: `Enter a valid ${getTransferAssetLabel(asset)} amount with up to ${decimals} decimal places.`,
      normalizedDecimal: null,
      rawAmount: null,
    };
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const normalizedDecimal = normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
  const rawAmount = BigInt(`${normalizedWhole}${fractionPart.padEnd(decimals, "0")}` || "0").toString();

  if (BigInt(rawAmount) <= 0n) {
    return {
      error: "Amount must be greater than zero.",
      normalizedDecimal: null,
      rawAmount: null,
    };
  }

  return {
    error: null,
    normalizedDecimal,
    rawAmount,
  };
}

export function derivePresetYieldAmount(rawAmount: string, asset: YieldAsset, divisor: bigint) {
  const nextRawAmount = (BigInt(rawAmount) / divisor).toString();

  if (BigInt(nextRawAmount) <= 0n) {
    return "";
  }

  return formatYieldRawAmount(nextRawAmount, asset);
}

export function estimateYieldPreviewSharesRaw(input: {
  amountRaw: string;
  asset: YieldAsset;
  conversionRateToSharesRaw: string;
}) {
  const amountRaw = BigInt(input.amountRaw);

  if (amountRaw <= 0n) {
    return "0";
  }

  const scale = 10n ** BigInt(getTransferAssetDecimals(input.asset));

  return ((amountRaw * BigInt(input.conversionRateToSharesRaw)) / scale).toString();
}

function formatRawAmount(rawAmount: string, decimals: number) {
  const isNegative = rawAmount.startsWith("-");
  const unsignedAmount = isNegative ? rawAmount.slice(1) : rawAmount;
  const normalizedAmount = unsignedAmount.replace(/^0+/, "") || "0";
  const paddedAmount = normalizedAmount.padStart(decimals + 1, "0");
  const whole = paddedAmount.slice(0, -decimals);
  const fraction = paddedAmount.slice(-decimals).replace(/0+$/, "");

  return `${isNegative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export type { YieldOnchainSnapshot, YieldOnchainVaultSnapshot };
