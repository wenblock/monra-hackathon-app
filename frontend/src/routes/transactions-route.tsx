import TransactionsPage from "@/TransactionsPage";
import { useSession } from "@/features/session/use-session";
import { useInfiniteTransactionsQuery } from "@/features/transactions/use-transactions-query";

function TransactionsRouteComponent() {
  const { user } = useSession();
  const transactionsQuery = useInfiniteTransactionsQuery(user.cdpUserId);
  const pages = transactionsQuery.data?.pages ?? [];
  const transactions = pages.flatMap(page => page.transactions);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  return (
    <TransactionsPage
      isLoading={transactionsQuery.isPending}
      isLoadingMore={transactionsQuery.isFetchingNextPage}
      loadError={transactionsQuery.error instanceof Error ? transactionsQuery.error.message : null}
      nextCursor={nextCursor}
      onLoadMore={async () => {
        await transactionsQuery.fetchNextPage();
      }}
      transactions={transactions}
    />
  );
}

export default TransactionsRouteComponent;
