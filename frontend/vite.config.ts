import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { OutputBundle, OutputChunk, OutputOptions } from "rollup";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv, type Plugin } from "vite";

function coinbaseChunkGuard(): Plugin {
  return {
    name: "coinbase-chunk-guard",
    apply: "build" as const,
    generateBundle(_options: OutputOptions, bundle: OutputBundle) {
      const coinbaseChunks = Object.entries(bundle).flatMap(([fileName, output]) => {
        if (output.type !== "chunk") {
          return [];
        }

        return Object.keys(output.modules).some(id => id.includes("/node_modules/@coinbase/cdp-react/"))
          ? [[fileName, output] as const]
          : [];
      });
      const coinbaseChunkNames = coinbaseChunks.map(([fileName]) => fileName);

      if (coinbaseChunkNames.length < 2) {
        return;
      }

      const coinbaseChunkSet = new Set(coinbaseChunkNames);
      const coinbaseChunkGraph = new Map(
        coinbaseChunkNames.map(fileName => {
          const output = bundle[fileName] as OutputChunk | undefined;

          if (!output || output.type !== "chunk") {
            return [fileName, [] as string[]] as const;
          }

          return [
            fileName,
            output.imports.filter(importedFileName => coinbaseChunkSet.has(importedFileName)),
          ] as const;
        }),
      );
      const visited = new Set<string>();
      const activeTrail = new Set<string>();

      const detectCycle = (fileName: string, trail: string[]): string[] | null => {
        if (activeTrail.has(fileName)) {
          const cycleStart = trail.indexOf(fileName);
          return [...trail.slice(cycleStart), fileName];
        }

        if (visited.has(fileName)) {
          return null;
        }

        activeTrail.add(fileName);

        for (const importedFileName of coinbaseChunkGraph.get(fileName) ?? []) {
          const cycle = detectCycle(importedFileName, [...trail, fileName]);

          if (cycle) {
            return cycle;
          }
        }

        activeTrail.delete(fileName);
        visited.add(fileName);
        return null;
      };

      for (const fileName of coinbaseChunkNames) {
        const cycle = detectCycle(fileName, []);

        if (cycle) {
          throw new Error(
            `Detected circular imports between Coinbase React chunks: ${cycle.join(" -> ")}`,
          );
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const shouldAnalyze = env.BUNDLE_ANALYZE?.trim() === "true";

  if (mode !== "development") {
    const missingEnv = ["VITE_API_BASE_URL", "VITE_SOLANA_RPC_URL"].filter(
      key => !env[key]?.trim(),
    );

    if (missingEnv.length > 0) {
      throw new Error(
        `Missing required ${missingEnv.join(", ")} for non-development builds.`,
      );
    }
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      coinbaseChunkGuard(),
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
      alias: [
        {
          find: /^@coral-xyz\/anchor$/,
          replacement: path.resolve(__dirname, "./src/shims/anchor-browser.ts"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
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
              normalizedId.includes("/src/features/session/CoinbaseAuthButton.tsx") ||
              normalizedId.includes("/src/App.tsx") ||
              normalizedId.includes("/src/config.ts") ||
              normalizedId.includes("/src/theme.ts") ||
              normalizedId.includes("/node_modules/@coinbase/cdp-react/")
            ) {
              return "coinbase-auth";
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
