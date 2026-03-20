import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const shouldAnalyze = env.BUNDLE_ANALYZE?.trim() === "true";

  if (mode !== "development" && !env.VITE_API_BASE_URL?.trim()) {
    throw new Error("Missing required VITE_API_BASE_URL for non-development builds.");
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(shouldAnalyze
        ? [
            visualizer({
              filename: path.resolve(__dirname, "reports/bundle-analysis.html"),
              gzipSize: true,
              open: false,
              template: "treemap",
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.split(path.sep).join("/");

            if (
              normalizedId.includes("/src/features/wallet/runtime.ts") ||
              normalizedId.includes("/src/solana-send.ts") ||
              normalizedId.includes("/src/solana-transfer.ts") ||
              normalizedId.includes("/node_modules/@solana/web3.js/") ||
              normalizedId.includes("/node_modules/buffer/")
            ) {
              return "wallet-runtime";
            }

            if (
              normalizedId.includes("/src/CoinbaseAppRoot.tsx") ||
              normalizedId.includes("/src/features/session/api-client-context.tsx") ||
              normalizedId.includes("/src/App.tsx") ||
              normalizedId.includes("/src/config.ts") ||
              normalizedId.includes("/src/theme.ts") ||
              normalizedId.includes("/node_modules/@coinbase/cdp-react/dist/components/CDPReactProvider/") ||
              normalizedId.includes("/node_modules/@coinbase/cdp-react/dist/components/ThemeProvider/") ||
              normalizedId.includes("/node_modules/@coinbase/cdp-react/dist/chunks/CDPReactProvider.") ||
              normalizedId.includes("/node_modules/@coinbase/cdp-react/dist/theme/")
            ) {
              return "coinbase-auth-runtime";
            }

            if (
              normalizedId.includes("/src/features/session/CoinbaseAuthButton.tsx") ||
              normalizedId.includes("/node_modules/@coinbase/cdp-react/dist/components/AuthButton/")
            ) {
              return "coinbase-auth-ui";
            }

            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/scheduler/") ||
              normalizedId.includes("/node_modules/@tanstack/") ||
              normalizedId.includes("/node_modules/@radix-ui/") ||
              normalizedId.includes("/node_modules/lucide-react/") ||
              normalizedId.includes("/node_modules/class-variance-authority/") ||
              normalizedId.includes("/node_modules/clsx/") ||
              normalizedId.includes("/node_modules/tailwind-merge/")
            ) {
              return "framework-vendor";
            }

            if (normalizedId.includes("/node_modules/qrcode/")) {
              return "qr-utils";
            }

            return undefined;
          },
        },
      },
    },
    server: {
      port: 3000,
    },
  };
});
