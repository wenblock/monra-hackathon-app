import { useCallback, useEffect, useMemo, useState } from "react";

interface StoredBridgeRequestState {
  fingerprint: string;
  requestId: string;
}

export function useBridgeRequestId(input: {
  payload: unknown;
  storageKey: string;
}) {
  const fingerprint = useMemo(() => stableStringify(input.payload), [input.payload]);
  const [requestId, setRequestId] = useState<string | null>(() =>
    readStoredBridgeRequestId(input.storageKey, fingerprint),
  );

  useEffect(() => {
    const storedRequestId = readStoredBridgeRequestId(input.storageKey, fingerprint);
    setRequestId(storedRequestId);
  }, [fingerprint, input.storageKey]);

  const ensureRequestId = useCallback(() => {
    const existing = readStoredBridgeRequestId(input.storageKey, fingerprint) ?? requestId;
    if (existing) {
      return existing;
    }

    const nextRequestId = crypto.randomUUID();
    writeStoredBridgeRequestId(input.storageKey, {
      fingerprint,
      requestId: nextRequestId,
    });
    setRequestId(nextRequestId);
    return nextRequestId;
  }, [fingerprint, input.storageKey, requestId]);

  const clearRequestId = useCallback(() => {
    clearStoredBridgeRequestId(input.storageKey);
    setRequestId(null);
  }, [input.storageKey]);

  return {
    clearRequestId,
    ensureRequestId,
    requestId,
  };
}

export function readStoredBridgeRequestId(storageKey: string, fingerprint: string) {
  const stored = readBridgeRequestState(storageKey);
  if (!stored) {
    return null;
  }

  if (stored.fingerprint !== fingerprint) {
    clearStoredBridgeRequestId(storageKey);
    return null;
  }

  return stored.requestId;
}

export function clearStoredBridgeRequestId(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(storageKey);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );

  return `{${entries
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
    .join(",")}}`;
}

function readBridgeRequestState(storageKey: string): StoredBridgeRequestState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredBridgeRequestState>;
    return typeof parsed.fingerprint === "string" && typeof parsed.requestId === "string"
      ? {
          fingerprint: parsed.fingerprint,
          requestId: parsed.requestId,
        }
      : null;
  } catch {
    return null;
  }
}

function writeStoredBridgeRequestId(storageKey: string, value: StoredBridgeRequestState) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(storageKey, JSON.stringify(value));
}
