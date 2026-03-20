import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";

import { recipientsKeys } from "./query-keys";

function useRecipientsQuery(userId: string, enabled = true) {
  const client = useApiClient();

  return useQuery({
    queryKey: recipientsKeys.list(userId),
    queryFn: ({ signal }) => client.fetchRecipients(signal),
    enabled,
  });
}

export { useRecipientsQuery };
