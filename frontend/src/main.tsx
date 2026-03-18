import { CDPReactProvider } from "@coinbase/cdp-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import { CDP_CONFIG } from "./config.ts";
import { theme } from "./theme.ts";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CDPReactProvider config={CDP_CONFIG} theme={theme}>
      <App />
    </CDPReactProvider>
  </StrictMode>,
);
