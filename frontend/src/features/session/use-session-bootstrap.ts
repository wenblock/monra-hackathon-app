import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";

import { sessionKeys } from "./query-keys";

function useSessionBootstrap({
  enabled,
  userId,
}: {
  enabled: boolean;
  userId: string | null | undefined;
}) {
  const client = useApiClient();
  const queryUserId = userId ?? "anonymous";

  return useQuery({
    queryKey: sessionKeys.bootstrap(queryUserId),
    queryFn: ({ signal }) => client.bootstrapSession(signal),
    enabled: enabled && Boolean(userId),
  });
}

export { useSessionBootstrap };
