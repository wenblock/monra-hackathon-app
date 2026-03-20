import { type ApiClient } from "@/lib/api-client";
import type {
  AppUser,
  BridgeComplianceState,
  SolanaBalancesResponse,
  AppTransaction,
} from "@/types";

export interface DashboardSnapshot {
  balances: SolanaBalancesResponse["balances"];
  transactions: AppTransaction[];
}

export async function fetchDashboardSnapshot(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<DashboardSnapshot> {
  const [balancesResponse, transactionsResponse] = await Promise.all([
    client.fetchSolanaBalances(signal),
    client.fetchTransactions({ limit: 5 }, signal),
  ]);

  return {
    balances: balancesResponse.balances,
    transactions: transactionsResponse.transactions,
  };
}

export function buildBridgeStateFromUser(user: AppUser): BridgeComplianceState {
  const hasAcceptedTermsOfService = user.bridgeTosStatus === "approved";

  return {
    customerStatus: user.bridgeKycStatus,
    hasAcceptedTermsOfService,
    showKycAlert: Boolean(user.bridgeKycLink && user.bridgeKycStatus !== "active"),
    showTosAlert: Boolean(user.bridgeTosLink && !hasAcceptedTermsOfService),
  };
}
