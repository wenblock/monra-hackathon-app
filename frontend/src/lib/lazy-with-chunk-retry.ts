import { lazy, type ComponentType } from "react";

const CHUNK_RETRY_STORAGE_PREFIX = "monra:chunk-retry:";

type ModuleLoader<T extends ComponentType<any>> = () => Promise<{ default: T }>;

export function lazyWithChunkRetry<T extends ComponentType<any>>(
  loader: ModuleLoader<T>,
  chunkKey: string,
) {
  return lazy(() => loadLazyModuleWithChunkRetry(loader, chunkKey));
}

export async function loadLazyModuleWithChunkRetry<T extends ComponentType<any>>(
  loader: ModuleLoader<T>,
  chunkKey: string,
  reload = reloadPage,
) {
  try {
    const module = await loader();
    clearChunkRetryMarker(chunkKey);
    return module;
  } catch (error) {
    if (isRecoverableLazyImportError(error) && markChunkRetryForReload(chunkKey)) {
      reload();
    }

    throw error;
  }
}

export function isRecoverableLazyImportError(error: unknown) {
  const message = readErrorMessage(error);

  return [
    "failed to fetch dynamically imported module",
    "chunkloaderror",
    "loading chunk",
    "failed to load module script",
    "mime type of \"text/html\"",
  ].some(pattern => message.includes(pattern));
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  return typeof error === "string" ? error.toLowerCase() : "";
}

function buildChunkRetryStorageKey(chunkKey: string) {
  return `${CHUNK_RETRY_STORAGE_PREFIX}${chunkKey}`;
}

function markChunkRetryForReload(chunkKey: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const storageKey = buildChunkRetryStorageKey(chunkKey);
    if (window.sessionStorage.getItem(storageKey) === "1") {
      return false;
    }

    window.sessionStorage.setItem(storageKey, "1");
    return true;
  } catch {
    return true;
  }
}

function clearChunkRetryMarker(chunkKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(buildChunkRetryStorageKey(chunkKey));
  } catch {
    // Ignore storage failures and continue rendering normally.
  }
}

function reloadPage() {
  if (typeof window === "undefined") {
    return;
  }

  window.location.reload();
}
