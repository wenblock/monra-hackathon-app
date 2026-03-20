import { CDPReactProvider } from "@coinbase/cdp-react/components/CDPReactProvider";
import { QueryClientProvider } from "@tanstack/react-query";

import { CDP_CONFIG } from "@/config";
import { ApiClientProvider } from "@/features/session/api-client-context";
import { createQueryClient } from "@/lib/query-client";
import { AppRouterProvider } from "@/router";
import { theme } from "@/theme";

const queryClient = createQueryClient();

function CoinbaseAppRoot() {
  return (
    <CDPReactProvider config={CDP_CONFIG} theme={theme}>
      <ApiClientProvider>
        <QueryClientProvider client={queryClient}>
          <AppRouterProvider />
        </QueryClientProvider>
      </ApiClientProvider>
    </CDPReactProvider>
  );
}

export default CoinbaseAppRoot;
