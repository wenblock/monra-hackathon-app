import { describe, expect, it } from "vitest";

import { readErrorMessage } from "@/lib/read-error-message";

describe("readErrorMessage", () => {
  it("returns a plain string message", () => {
    expect(readErrorMessage("Something went wrong", "Fallback")).toBe("Something went wrong");
  });

  it("extracts JSON-RPC error messages from string payloads", () => {
    expect(
      readErrorMessage(
        '403 : {"jsonrpc":"2.0","error":{"code":403,"message":"Access forbidden"},"id":"abc"}',
        "Fallback",
      ),
    ).toBe("Access forbidden (403)");
  });

  it("extracts JSON-RPC error messages from object messages", () => {
    expect(
      readErrorMessage(
        {
          message:
            '{"jsonrpc":"2.0","error":{"code":403,"message":"Access forbidden"},"id":"abc"}',
        },
        "Fallback",
      ),
    ).toBe("Access forbidden (403)");
  });

  it("falls back when the error is not readable", () => {
    expect(readErrorMessage({ reason: "hidden" }, "Fallback")).toBe("Fallback");
  });
});
