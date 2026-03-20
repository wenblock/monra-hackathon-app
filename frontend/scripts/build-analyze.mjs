import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();

await runNodeScript(path.resolve(root, "node_modules/typescript/bin/tsc"), ["-b"]);
await runNodeScript(path.resolve(root, "node_modules/vite/bin/vite.js"), ["build"], {
  BUNDLE_ANALYZE: "true",
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? "http://localhost:4000",
});

function runNodeScript(scriptPath, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: "inherit",
    });

    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code ?? 1}.`));
    });

    child.on("error", reject);
  });
}
