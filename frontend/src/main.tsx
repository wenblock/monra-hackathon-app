import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";

import Loading from "./Loading.tsx";
import StartupErrorBoundary from "./StartupErrorBoundary.tsx";
import "./lib/browser-polyfills.ts";
import "./index.css";

const LazyCoinbaseAppRoot = lazy(() => import("./CoinbaseAppRoot.tsx"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartupErrorBoundary>
      <Suspense fallback={<Loading label="Loading Monra..." />}>
        <LazyCoinbaseAppRoot />
      </Suspense>
    </StartupErrorBoundary>
  </StrictMode>,
);
