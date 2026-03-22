import { createConfirmedSwapTransaction } from "../db/repositories/transactionsWriteRepo.js";
import { getSharedSwapQuote, storeSharedSwapQuote } from "../db/runtime.js";
import { normalizeSwapAmount } from "../lib/amounts.js";
import {
  getTransferAssetMintAddress,
} from "../lib/assets.js";
import { formatAssetAmount } from "../lib/amounts.js";
import {
  executeJupiterSwap,
  getJupiterSwapOrder,
  JupiterApiError,
} from "../lib/jupiter.js";
import { broadcastLatestTransactionSnapshot } from "../lib/transactionStream.js";
import type { AppUser, TransferAsset } from "../types.js";
import { ServiceError } from "./errors.js";

interface SwapsServiceDependencies {
  broadcastLatestTransactionSnapshot: typeof broadcastLatestTransactionSnapshot;
  createConfirmedSwapTransaction: typeof createConfirmedSwapTransaction;
  executeJupiterSwap: typeof executeJupiterSwap;
  getJupiterSwapOrder: typeof getJupiterSwapOrder;
  getSharedSwapQuote: typeof getSharedSwapQuote;
  storeSharedSwapQuote: typeof storeSharedSwapQuote;
}

const defaultDependencies: SwapsServiceDependencies = {
  broadcastLatestTransactionSnapshot,
  createConfirmedSwapTransaction,
  executeJupiterSwap,
  getJupiterSwapOrder,
  getSharedSwapQuote,
  storeSharedSwapQuote,
};

export async function createSwapOrderForUser(input: {
  amount: string;
  inputAsset: TransferAsset;
  outputAsset: TransferAsset;
  user: AppUser;
}, dependencies: SwapsServiceDependencies = defaultDependencies) {
  if (input.inputAsset === input.outputAsset) {
    throw new ServiceError("Select two different assets to swap.", 400);
  }

  if (!input.user.solanaAddress) {
    throw new ServiceError("Your Solana wallet is still syncing. Try again in a moment.", 409);
  }

  try {
    const normalizedAmount = normalizeSwapAmount(input.amount, input.inputAsset);
    const order = await dependencies.getJupiterSwapOrder({
      amount: normalizedAmount.raw,
      inputMint: getTransferAssetMintAddress(input.inputAsset),
      outputMint: getTransferAssetMintAddress(input.outputAsset),
      taker: input.user.solanaAddress,
    });

    await dependencies.storeSharedSwapQuote({
      inputAmountRaw: normalizedAmount.raw,
      inputAsset: input.inputAsset,
      outputAmountRaw: order.outAmount,
      outputAsset: input.outputAsset,
      requestId: order.requestId,
      userId: input.user.id,
      walletAddress: input.user.solanaAddress,
    });

    return {
      quotedAt: new Date().toISOString(),
      quote: {
        feeBps: order.feeBps,
        feeMint: order.feeMint,
        inputAmountDecimal: normalizedAmount.decimal,
        inputAmountRaw: normalizedAmount.raw,
        inputAsset: input.inputAsset,
        mode: order.mode,
        outputAmountDecimal: formatAssetAmount(order.outAmount, input.outputAsset),
        outputAmountRaw: order.outAmount,
        outputAsset: input.outputAsset,
        router: order.router,
      },
      requestId: order.requestId,
      transaction: order.transaction,
    };
  } catch (error) {
    if (error instanceof JupiterApiError) {
      throw new ServiceError(error.message, error.status >= 400 && error.status < 500 ? 400 : 502);
    }

    if (error instanceof Error && /amount/i.test(error.message)) {
      throw new ServiceError(error.message, 400);
    }

    throw error;
  }
}

export async function executeSwapForUser(input: {
  requestId: string;
  signedTransaction: string;
  user: AppUser;
}, dependencies: SwapsServiceDependencies = defaultDependencies) {
  if (!input.user.solanaAddress) {
    throw new ServiceError("Your Solana wallet is still syncing. Try again in a moment.", 409);
  }

  try {
    const cachedOrder = await dependencies.getSharedSwapQuote(input.requestId);
    if (!cachedOrder || cachedOrder.userId !== input.user.id) {
      throw new ServiceError("Swap quote expired. Refresh the quote and try again.", 409);
    }

    if (cachedOrder.walletAddress !== input.user.solanaAddress) {
      throw new ServiceError("Stored Solana wallet does not match the swap quote.", 409);
    }

    const execution = await dependencies.executeJupiterSwap({
      requestId: input.requestId,
      signedTransaction: input.signedTransaction,
    });

    if (execution.status !== "Success") {
      throw new ServiceError(mapJupiterExecuteError(execution.code, execution.error), 409);
    }

    if (!execution.signature) {
      throw new ServiceError("Jupiter execute succeeded without a transaction signature.", 502);
    }

    const createdSwap = await dependencies.createConfirmedSwapTransaction({
      inputAmountRaw: execution.inputAmountResult ?? cachedOrder.inputAmountRaw,
      inputAsset: cachedOrder.inputAsset,
      outputAmountRaw: execution.outputAmountResult ?? cachedOrder.outputAmountRaw,
      outputAsset: cachedOrder.outputAsset,
      transactionSignature: execution.signature,
      userId: input.user.id,
      walletAddress: input.user.solanaAddress,
    });

    await dependencies.broadcastLatestTransactionSnapshot(input.user.id, createdSwap.balances);

    return createdSwap;
  } catch (error) {
    if (error instanceof JupiterApiError) {
      throw new ServiceError(error.message, error.status >= 400 && error.status < 500 ? 409 : 502);
    }

    if (error instanceof ServiceError) {
      throw error;
    }

    throw error;
  }
}

function mapJupiterExecuteError(code: number, error: string | null) {
  if (code === -1 || code === -2003) {
    return "Swap quote expired. Refresh the quote and try again.";
  }

  if (code === -1003) {
    return "Swap transaction was not fully signed.";
  }

  return error ?? "Swap execution failed.";
}
