import { useContext } from "react";

import { ApiClientContext } from "@/features/session/api-client-context";

function useApiClient() {
  const client = useContext(ApiClientContext);

  if (!client) {
    throw new Error("useApiClient must be used within an ApiClientProvider.");
  }

  return client;
}

export { useApiClient };
