import { listTransactionsByUserIdPaginated, type ListTransactionsOptions } from "../db/repositories/transactionsReadRepo.js";
import { buildTreasurySnapshotForUser } from "./treasuryService.js";
import type { SolanaBalancesResponse, TransactionStreamResponse } from "../types.js";

interface TransactionsServiceDependencies {
  buildTreasurySnapshotForUser: typeof buildTreasurySnapshotForUser;
  listTransactionsByUserIdPaginated: typeof listTransactionsByUserIdPaginated;
}

const defaultDependencies: TransactionsServiceDependencies = {
  buildTreasurySnapshotForUser,
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
  const [treasurySnapshot, transactionPage] = await Promise.all([
    dependencies.buildTreasurySnapshotForUser(userId, balancesOverride),
    dependencies.listTransactionsByUserIdPaginated(userId, { limit: 5 }),
  ]);

  return {
    balances: treasurySnapshot.balances,
    valuation: treasurySnapshot.valuation,
    yield: treasurySnapshot.yield,
    transactions: transactionPage.transactions,
  };
}
