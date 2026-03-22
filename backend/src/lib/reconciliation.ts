import {
  listStalePendingBridgeTransactions,
} from "../db/repositories/transactionsReadRepo.js";
import {
  getUserBalancesByUserId,
  listUsersWithSolanaAddresses,
} from "../db/repositories/usersRepo.js";
import { cleanupRuntimeState } from "../db/runtime.js";
import { config } from "../config.js";
import { fetchSolanaBalances } from "./alchemy.js";
import { logError, logInfo, logWarn } from "./logger.js";

let reconciliationTimer: NodeJS.Timeout | null = null;
let reconciliationInFlight = false;

export function startReconciliationJob() {
  if (config.reconciliationIntervalMs <= 0 || reconciliationTimer) {
    return;
  }

  const run = async () => {
    if (reconciliationInFlight) {
      return;
    }

    reconciliationInFlight = true;

    try {
      const users = await listUsersWithSolanaAddresses();

      for (const user of users) {
        if (!user.solanaAddress) {
          continue;
        }

        const [localBalances, remoteBalances] = await Promise.all([
          getUserBalancesByUserId(user.id),
          fetchSolanaBalances(user.solanaAddress),
        ]);
        const assets = Object.keys(localBalances) as (keyof typeof localBalances)[];
        const mismatchedAssets = assets.filter(
          asset => localBalances[asset].raw !== remoteBalances.balances[asset].raw,
        );

        if (mismatchedAssets.length > 0) {
          logWarn("reconciliation.balance_mismatch", {
            cdpUserId: user.cdpUserId,
            mismatchedAssets,
            solanaAddress: user.solanaAddress,
            userId: user.id,
          });
        }
      }

      const stalePendingTransactions = await listStalePendingBridgeTransactions();
      for (const transaction of stalePendingTransactions) {
        logWarn("reconciliation.stale_pending_transfer", {
          bridgeTransferId: transaction.bridgeTransferId,
          createdAt: transaction.createdAt,
          entryType: transaction.entryType,
          transactionId: transaction.id,
          updatedAt: transaction.updatedAt,
          userId: transaction.userId,
        });
      }

      await cleanupRuntimeState();

      logInfo("reconciliation.completed", {
        checkedUsers: users.length,
        stalePendingTransactions: stalePendingTransactions.length,
      });
    } catch (error) {
      logError("reconciliation.failed", error);
    } finally {
      reconciliationInFlight = false;
    }
  };

  reconciliationTimer = setInterval(() => {
    void run();
  }, config.reconciliationIntervalMs);

  void run();
}

export function stopReconciliationJob() {
  if (!reconciliationTimer) {
    return;
  }

  clearInterval(reconciliationTimer);
  reconciliationTimer = null;
}
