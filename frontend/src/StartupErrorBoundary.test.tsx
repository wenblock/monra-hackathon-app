import { cleanup, render, screen } from "@testing-library/react";
import { Suspense, lazy } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { lazyWithChunkRetry } from "@/lib/lazy-with-chunk-retry";
import Loading from "@/Loading";
import StartupErrorBoundary from "@/StartupErrorBoundary";

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("StartupErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders a visible fallback when a lazy startup import fails", async () => {
    const LazyBrokenRoot = lazy(async () => {
      throw new Error("lazy import failed");
    });

    render(
      <StartupErrorBoundary>
        <Suspense fallback={<Loading label="Loading Monra..." />}>
          <LazyBrokenRoot />
        </Suspense>
      </StartupErrorBoundary>,
    );

    expect(await screen.findByRole("heading", { name: /unable to start monra/i })).toBeInTheDocument();
    expect(screen.getByText("lazy import failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload app/i })).toBeInTheDocument();
  });

  it("renders the fallback after a stale chunk error has already retried once", async () => {
    window.sessionStorage.setItem("monra:chunk-retry:broken-root", "1");
    const LazyBrokenRoot = lazyWithChunkRetry(
      async () => {
        throw new TypeError("Failed to fetch dynamically imported module");
      },
      "broken-root",
    );

    render(
      <StartupErrorBoundary>
        <Suspense fallback={<Loading label="Loading Monra..." />}>
          <LazyBrokenRoot />
        </Suspense>
      </StartupErrorBoundary>,
    );

    expect(await screen.findByRole("heading", { name: /unable to start monra/i })).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch dynamically imported module")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload app/i })).toBeInTheDocument();
  });
});
