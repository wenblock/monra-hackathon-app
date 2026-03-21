import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";
import type { CreateRecipientPayload, Recipient } from "@/types";

import { recipientsKeys } from "./query-keys";

function useCreateRecipientMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<{ recipient: Recipient }, Error, CreateRecipientPayload>({
    mutationFn: payload => client.createRecipient(payload),
    onSuccess: response => {
      queryClient.setQueryData<{ recipients: Recipient[] } | undefined>(
        recipientsKeys.list(userId),
        current => ({
          recipients: [
            response.recipient,
            ...(current?.recipients.filter(
              recipient => recipient.publicId !== response.recipient.publicId,
            ) ?? []),
          ],
        }),
      );
    },
  });
}

function useDeleteRecipientMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recipientPublicId: string) => client.deleteRecipient(recipientPublicId),
    onSuccess: (_, recipientPublicId) => {
      queryClient.setQueryData<{ recipients: Recipient[] } | undefined>(
        recipientsKeys.list(userId),
        current =>
          current
            ? {
                recipients: current.recipients.filter(
                  recipient => recipient.publicId !== recipientPublicId,
                ),
              }
            : current,
      );
    },
  });
}

export { useCreateRecipientMutation, useDeleteRecipientMutation };
