const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface FetchWithRetryOptions {
  retries?: number;
  retryableStatusCodes?: Set<number>;
  timeoutMs?: number;
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  options: FetchWithRetryOptions = {},
) {
  const retries = options.retries ?? 1;
  const retryableStatusCodes = options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;
  const timeoutMs = options.timeoutMs ?? 8000;
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (retryableStatusCodes.has(response.status) && attempt <= retries) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt > retries) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Request failed without a specific error.");
}

function isRetryableError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      /network/i.test(error.message) ||
      /timed out/i.test(error.message))
  );
}
