import { createRequire } from "node:module";

import cors from "cors";
import express, { type RequestHandler } from "express";

import { closeDatabase, initializeDatabase } from "./db.js";
import { config } from "./config.js";
import { sendError } from "./lib/http.js";
import { authRouter } from "./routes/auth.js";
import { bridgeRouter } from "./routes/bridge.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { recipientsRouter } from "./routes/recipients.js";
import { transactionsRouter } from "./routes/transactions.js";
import { usersRouter } from "./routes/users.js";
import { alchemyWebhookRouter } from "./routes/webhooks.js";

const require = createRequire(import.meta.url);
const helmet = require("helmet") as () => RequestHandler;

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS."));
    },
    optionsSuccessStatus: 204,
  }),
);
app.use("/api/webhooks/alchemy", alchemyWebhookRouter);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/bridge", bridgeRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/recipients", recipientsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/users", usersRouter);

app.use((_request, response) => {
  sendError(response, 404, "Route not found.");
});

await initializeDatabase();

const server = app.listen(config.port, () => {
  console.log(`Monra backend listening on port ${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down.`);
  server.close(async () => {
    await closeDatabase().catch(error => {
      console.error("Error while closing database pool", error);
    });
    process.exit(0);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
