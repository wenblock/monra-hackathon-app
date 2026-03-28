import Dashboard from "@/Dashboard";
import {
  useCreateOfframpMutation,
  useCreateOnrampMutation,
  useFetchSolanaTransactionContext,
} from "@/features/dashboard/use-dashboard-mutations";
import { useDashboardSnapshot } from "@/features/dashboard/use-dashboard-snapshot";
import { useCreateRecipientMutation } from "@/features/recipients/use-recipient-mutations";
import { useRecipientsQuery } from "@/features/recipients/use-recipients-query";
import { usePersistedSolanaAddress } from "@/features/session/use-persisted-solana-address";
import { useSession } from "@/features/session/use-session";
import { useSyncBridgeStatusMutation } from "@/features/session/use-session-mutations";
import { useTransactionStreamStatus } from "@/features/transactions/use-transaction-stream-status";

function DashboardRouteComponent() {
  const { bridge, user } = useSession();
  const userId = user.cdpUserId;
  const { isLive: isDashboardStreamLive, transactionsError: streamTransactionsError } =
    useTransactionStreamStatus();
  const dashboardSnapshotQuery = useDashboardSnapshot(userId, {
    liveUpdatesEnabled: isDashboardStreamLive,
  });
  const recipientsQuery = useRecipientsQuery(userId);
  const createRecipientMutation = useCreateRecipientMutation(userId);
  const createOnrampMutation = useCreateOnrampMutation(userId);
  const createOfframpMutation = useCreateOfframpMutation(userId);
  const syncBridgeStatusMutation = useSyncBridgeStatusMutation(userId);
  const fetchSolanaTransactionContext = useFetchSolanaTransactionContext();
  const { effectiveSolanaAddress, persistenceError } = usePersistedSolanaAddress(
    userId,
    user.solanaAddress,
  );

  const snapshotError =
    dashboardSnapshotQuery.error instanceof Error ? dashboardSnapshotQuery.error.message : null;

  return (
    <Dashboard
      balances={dashboardSnapshotQuery.data?.balances}
      valuation={dashboardSnapshotQuery.data?.valuation}
      yield={dashboardSnapshotQuery.data?.yield}
      bridge={bridge}
      onCreateOfframp={async payload => (await createOfframpMutation.mutateAsync(payload)).transaction}
      onCreateOnramp={async payload => (await createOnrampMutation.mutateAsync(payload)).transaction}
      onCreateRecipient={async payload => (await createRecipientMutation.mutateAsync(payload)).recipient}
      onFetchSolanaTransactionContext={fetchSolanaTransactionContext}
      onRefreshBridgeStatus={async () => {
        await syncBridgeStatusMutation.mutateAsync();
      }}
      recipients={recipientsQuery.data?.recipients ?? []}
      transactions={dashboardSnapshotQuery.data?.transactions ?? []}
      transactionsError={streamTransactionsError ?? snapshotError}
      transactionsLoading={dashboardSnapshotQuery.isPending}
      user={user}
      walletAddress={effectiveSolanaAddress}
      walletSyncError={persistenceError}
    />
  );
}

export default DashboardRouteComponent;
