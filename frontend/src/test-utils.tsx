import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { ToastProvider } from "@/components/ui/toast-provider";
import { createQueryClient } from "@/lib/query-client";

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

export { renderWithQueryClient };
