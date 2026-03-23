export function readErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) {
    return normalizeErrorMessage(error, fallback);
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return normalizeErrorMessage(message, fallback);
    }
  }

  return fallback;
}

function normalizeErrorMessage(message: string, fallback: string) {
  const trimmed = message.trim();
  const jsonRpcPayload = extractJsonRpcPayload(trimmed);
  const jsonRpcMessage = readJsonRpcErrorMessage(jsonRpcPayload ?? trimmed);

  if (jsonRpcMessage) {
    return jsonRpcMessage;
  }

  return trimmed || fallback;
}

function extractJsonRpcPayload(message: string) {
  const jsonStart = message.indexOf("{");

  if (jsonStart === -1) {
    return null;
  }

  return message.slice(jsonStart);
}

function readJsonRpcErrorMessage(message: string) {
  try {
    const parsed = JSON.parse(message) as {
      error?: {
        code?: number;
        message?: string;
      };
    };

    if (typeof parsed.error?.message !== "string" || !parsed.error.message.trim()) {
      return null;
    }

    const codeSuffix =
      typeof parsed.error.code === "number" ? ` (${parsed.error.code})` : "";

    return `${parsed.error.message.trim()}${codeSuffix}`;
  } catch {
    return null;
  }
}
