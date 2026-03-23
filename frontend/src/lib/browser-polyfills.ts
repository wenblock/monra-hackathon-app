import { Buffer as BufferPolyfill } from "buffer";

type GlobalWithBuffer = typeof globalThis & {
  Buffer?: typeof BufferPolyfill;
};

export function installBrowserPolyfills() {
  const globalScope = globalThis as GlobalWithBuffer;

  if (!globalScope.Buffer) {
    globalScope.Buffer = BufferPolyfill;
  }
}

export function getInstalledBuffer() {
  installBrowserPolyfills();
  return (globalThis as GlobalWithBuffer).Buffer!;
}

installBrowserPolyfills();
