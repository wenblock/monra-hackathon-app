import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "@/features/session/use-api-client";
import type { OnboardingPayload, SessionBootstrapResponse } from "@/types";

import { sessionKeys } from "./query-keys";

function useSubmitOnboardingMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<SessionBootstrapResponse, Error, OnboardingPayload>({
    mutationFn: payload => client.submitOnboarding(payload),
    onSuccess: response => {
      queryClient.setQueryData(sessionKeys.bootstrap(userId), response);
    },
  });
}

function useSyncBridgeStatusMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.syncBridgeStatus(),
    onSuccess: response => {
      queryClient.setQueryData<SessionBootstrapResponse | undefined>(
        sessionKeys.bootstrap(userId),
        current =>
          current
            ? {
                ...current,
                status: "active",
                bridge: response.bridge,
                user: response.user,
              }
            : current,
      );
    },
  });
}

function useSaveSolanaAddressMutation(userId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (solanaAddress: string) => client.saveSolanaAddress(solanaAddress),
    onSuccess: response => {
      queryClient.setQueryData<SessionBootstrapResponse | undefined>(
        sessionKeys.bootstrap(userId),
        current =>
          current
            ? {
                ...current,
                status: "active",
                user: response.user,
              }
            : current,
      );
    },
  });
}

export {
  useSaveSolanaAddressMutation,
  useSubmitOnboardingMutation,
  useSyncBridgeStatusMutation,
};
