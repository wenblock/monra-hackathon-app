function writeLog(level: "error" | "info" | "warn", message: string, context: Record<string, unknown> = {}) {
  const payload = {
    ...context,
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function logInfo(message: string, context?: Record<string, unknown>) {
  writeLog("info", message, context);
}

export function logWarn(message: string, context?: Record<string, unknown>) {
  writeLog("warn", message, context);
}

export function logError(
  message: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  writeLog("error", message, {
    ...context,
    error: serializeError(error),
  });
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
}
