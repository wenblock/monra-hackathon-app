import RecipientsPage from "@/RecipientsPage";
import {
  useCreateRecipientMutation,
  useDeleteRecipientMutation,
} from "@/features/recipients/use-recipient-mutations";
import { useRecipientsQuery } from "@/features/recipients/use-recipients-query";
import { useSession } from "@/features/session/use-session";

function RecipientsRouteComponent() {
  const { user } = useSession();
  const userId = user.cdpUserId;
  const recipientsQuery = useRecipientsQuery(userId);
  const createRecipientMutation = useCreateRecipientMutation(userId);
  const deleteRecipientMutation = useDeleteRecipientMutation(userId);

  return (
    <RecipientsPage
      isLoading={recipientsQuery.isPending}
      loadError={recipientsQuery.error instanceof Error ? recipientsQuery.error.message : null}
      onCreateRecipient={async payload => (await createRecipientMutation.mutateAsync(payload)).recipient}
      onDeleteRecipient={deleteRecipientMutation.mutateAsync}
      recipients={recipientsQuery.data?.recipients ?? []}
      requestScope={userId}
    />
  );
}

export default RecipientsRouteComponent;
