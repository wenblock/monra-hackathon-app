import { createRequire } from "node:module";

import cors from "cors";
import express, { type RequestHandler } from "express";

import { closeDatabase, initializeDatabase } from "./db.js";
import { config } from "./config.js";
import { sendError } from "./lib/http.js";
import { logError, logInfo } from "./lib/logger.js";
import { getReadinessStatus } from "./lib/readiness.js";
import { startReconciliationJob, stopReconciliationJob } from "./lib/reconciliation.js";
import { closeTransactionStream, initializeTransactionStream } from "./lib/transactionStream.js";
import { errorHandler, createCorsOriginError } from "./middleware/errorHandler.js";
import { requestContextMiddleware } from "./middleware/requestContext.js";
import { authRouter } from "./routes/auth.js";
import { bridgeRouter } from "./routes/bridge.js";
import { offrampRouter } from "./routes/offramp.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { onrampRouter } from "./routes/onramp.js";
import { recipientsRouter } from "./routes/recipients.js";
import { swapsRouter } from "./routes/swaps.js";
import { transactionsRouter } from "./routes/transactions.js";
import { usersRouter } from "./routes/users.js";
import { alchemyWebhookRouter, bridgeWebhookRouter } from "./routes/webhooks.js";
import { yieldRouter } from "./routes/yield.js";

const require = createRequire(import.meta.url);
const helmet = require("helmet") as () => RequestHandler;

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(requestContextMiddleware);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(createCorsOriginError());
    },
    optionsSuccessStatus: 204,
  }),
);
app.use("/api/webhooks/alchemy", alchemyWebhookRouter);
app.use("/api/webhooks/bridge", bridgeWebhookRouter);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/ready", async (_request, response) => {
  try {
    const readiness = await getReadinessStatus();
    response.status(readiness.ok ? 200 : 503).json(readiness);
  } catch (error) {
    logError("server.readiness_failed", error);
    response.status(503).json({
      error: "Unable to evaluate readiness.",
      ok: false,
    });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/bridge", bridgeRouter);
app.use("/api/offramp", offrampRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/onramp", onrampRouter);
app.use("/api/recipients", recipientsRouter);
app.use("/api/swaps", swapsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/users", usersRouter);
app.use("/api/yield", yieldRouter);

app.use((_request, response) => {
  sendError(response, 404, "Route not found.");
});
app.use(errorHandler);

await initializeDatabase();
await initializeTransactionStream();
startReconciliationJob();

const server = app.listen(config.port, () => {
  logInfo("server.started", {
    port: config.port,
  });
});

async function shutdown(signal: string) {
  logInfo("server.shutdown_requested", { signal });
  server.close(async () => {
    await closeTransactionStream().catch(error => {
      logError("server.transaction_stream_close_failed", error);
    });
    stopReconciliationJob();
    await closeDatabase().catch(error => {
      logError("server.database_close_failed", error);
    });
    process.exit(0);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
