import { useGetAccessToken } from "@coinbase/cdp-hooks";
import { createContext, useMemo, type ReactNode } from "react";

import { createApiClient, type ApiClient } from "@/lib/api-client";

const ApiClientContext = createContext<ApiClient | null>(null);

function ApiClientProvider({ children }: { children: ReactNode }) {
  const { getAccessToken } = useGetAccessToken();
  const client = useMemo(() => createApiClient(getAccessToken), [getAccessToken]);

  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export { ApiClientContext, ApiClientProvider };
