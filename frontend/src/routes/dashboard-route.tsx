import Dashboard from "@/Dashboard";
import {
  useCreateOfframpMutation,
  useCreateOnrampMutation,
  useFetchSolanaTransactionContext,
} from "@/features/dashboard/use-dashboard-mutations";
import { useDashboardSnapshot } from "@/features/dashboard/use-dashboard-snapshot";
import { useDashboardStream } from "@/features/dashboard/use-dashboard-stream";
import { useCreateRecipientMutation } from "@/features/recipients/use-recipient-mutations";
import { useRecipientsQuery } from "@/features/recipients/use-recipients-query";
import { useSession } from "@/features/session/use-session";
import {
  useSaveSolanaAddressMutation,
  useSyncBridgeStatusMutation,
} from "@/features/session/use-session-mutations";

function DashboardRouteComponent() {
  const { bridge, user } = useSession();
  const userId = user.cdpUserId;
  const dashboardSnapshotQuery = useDashboardSnapshot(userId);
  const recipientsQuery = useRecipientsQuery(userId);
  const { transactionsError: streamTransactionsError } = useDashboardStream(userId);
  const createRecipientMutation = useCreateRecipientMutation(userId);
  const createOnrampMutation = useCreateOnrampMutation(userId);
  const createOfframpMutation = useCreateOfframpMutation(userId);
  const syncBridgeStatusMutation = useSyncBridgeStatusMutation(userId);
  const saveSolanaAddressMutation = useSaveSolanaAddressMutation(userId);
  const fetchSolanaTransactionContext = useFetchSolanaTransactionContext();

  const snapshotError =
    dashboardSnapshotQuery.error instanceof Error ? dashboardSnapshotQuery.error.message : null;

  return (
    <Dashboard
      balances={dashboardSnapshotQuery.data?.balances}
      bridge={bridge}
      onCreateOfframp={async payload => (await createOfframpMutation.mutateAsync(payload)).transaction}
      onCreateOnramp={async payload => (await createOnrampMutation.mutateAsync(payload)).transaction}
      onCreateRecipient={async payload => (await createRecipientMutation.mutateAsync(payload)).recipient}
      onFetchSolanaTransactionContext={fetchSolanaTransactionContext}
      onPersistSolanaAddress={async solanaAddress => {
        await saveSolanaAddressMutation.mutateAsync(solanaAddress);
      }}
      onRefreshBridgeStatus={async () => {
        await syncBridgeStatusMutation.mutateAsync();
      }}
      recipients={recipientsQuery.data?.recipients ?? []}
      transactions={dashboardSnapshotQuery.data?.transactions ?? []}
      transactionsError={streamTransactionsError ?? snapshotError}
      transactionsLoading={dashboardSnapshotQuery.isPending}
      user={user}
    />
  );
}

export default DashboardRouteComponent;
