import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { lazyWithChunkRetry } from "./lib/lazy-with-chunk-retry.ts";
import Loading from "./Loading.tsx";
import StartupErrorBoundary from "./StartupErrorBoundary.tsx";
import "./lib/browser-polyfills.ts";
import "./index.css";

const LazyCoinbaseAppRoot = lazyWithChunkRetry(
  () => import("./CoinbaseAppRoot.tsx"),
  "coinbase-app-root",
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartupErrorBoundary>
      <Suspense fallback={<Loading label="Loading Monra..." />}>
        <LazyCoinbaseAppRoot />
      </Suspense>
    </StartupErrorBoundary>
  </StrictMode>,
);
