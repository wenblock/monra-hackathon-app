import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isRecoverableLazyImportError,
  loadLazyModuleWithChunkRetry,
} from "@/lib/lazy-with-chunk-retry";

describe("lazy-with-chunk-retry", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("reloads once for a recoverable lazy chunk error", async () => {
    const reloadMock = vi.fn();

    await expect(
      loadLazyModuleWithChunkRetry(
        async () => {
          throw new TypeError("Failed to fetch dynamically imported module");
        },
        "test-chunk",
        reloadMock,
      ),
    ).rejects.toThrow("Failed to fetch dynamically imported module");

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("does not reload forever after the first recoverable failure", async () => {
    const reloadMock = vi.fn();

    window.sessionStorage.setItem("monra:chunk-retry:test-chunk", "1");

    await expect(
      loadLazyModuleWithChunkRetry(
        async () => {
          throw new Error("ChunkLoadError");
        },
        "test-chunk",
        reloadMock,
      ),
    ).rejects.toThrow("ChunkLoadError");

    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("clears the retry marker after a successful lazy import", async () => {
    window.sessionStorage.setItem("monra:chunk-retry:test-chunk", "1");

    await expect(
      loadLazyModuleWithChunkRetry(
        async () => ({
          default: () => null,
        }),
        "test-chunk",
      ),
    ).resolves.toEqual({
      default: expect.any(Function),
    });

    expect(window.sessionStorage.getItem("monra:chunk-retry:test-chunk")).toBeNull();
  });

  it("rethrows unrelated import errors without reloading", async () => {
    const reloadMock = vi.fn();

    await expect(
      loadLazyModuleWithChunkRetry(
        async () => {
          throw new Error("permission denied");
        },
        "test-chunk",
        reloadMock,
      ),
    ).rejects.toThrow("permission denied");

    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("detects MIME mismatch module script failures as recoverable", () => {
    expect(
      isRecoverableLazyImportError(
        new Error(
          'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
        ),
      ),
    ).toBe(true);
  });
});
