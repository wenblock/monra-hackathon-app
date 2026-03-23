import { afterEach, describe, expect, it } from "vitest";

import { installBrowserPolyfills } from "@/lib/browser-polyfills";

describe("browser polyfills", () => {
  const originalBuffer = globalThis.Buffer;

  afterEach(() => {
    if (originalBuffer) {
      globalThis.Buffer = originalBuffer;
      return;
    }

    delete (globalThis as { Buffer?: unknown }).Buffer;
  });

  it("installs Buffer on the browser global before SDK code runs", () => {
    delete (globalThis as { Buffer?: unknown }).Buffer;

    installBrowserPolyfills();

    expect(globalThis.Buffer).toBeDefined();
  });
});
