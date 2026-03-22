import { listTransactionsByUserIdPaginated, type ListTransactionsOptions } from "../db/repositories/transactionsReadRepo.js";
import { getUserBalancesByUserId } from "../db/repositories/usersRepo.js";
import { buildTreasuryValuation, getTreasuryPrices } from "../lib/alchemy.js";
import type { SolanaBalancesResponse, TransactionStreamResponse } from "../types.js";

interface TransactionsServiceDependencies {
  buildTreasuryValuation: typeof buildTreasuryValuation;
  getTreasuryPrices: typeof getTreasuryPrices;
  getUserBalancesByUserId: typeof getUserBalancesByUserId;
  listTransactionsByUserIdPaginated: typeof listTransactionsByUserIdPaginated;
}

const defaultDependencies: TransactionsServiceDependencies = {
  buildTreasuryValuation,
  getTreasuryPrices,
  getUserBalancesByUserId,
  listTransactionsByUserIdPaginated,
};

export async function listTransactionsPage(userId: number, options: ListTransactionsOptions = {}) {
  return listTransactionsByUserIdPaginated(userId, options);
}

export async function buildLatestTransactionSnapshot(
  userId: number,
  balancesOverride?: SolanaBalancesResponse["balances"],
  dependencies: TransactionsServiceDependencies = defaultDependencies,
): Promise<TransactionStreamResponse> {
  const [balances, transactionPage, treasuryPrices] = await Promise.all([
    balancesOverride ? Promise.resolve(balancesOverride) : dependencies.getUserBalancesByUserId(userId),
    dependencies.listTransactionsByUserIdPaginated(userId, { limit: 5 }),
    dependencies.getTreasuryPrices(),
  ]);

  return {
    balances,
    valuation: dependencies.buildTreasuryValuation(balances, treasuryPrices),
    transactions: transactionPage.transactions,
  };
}
