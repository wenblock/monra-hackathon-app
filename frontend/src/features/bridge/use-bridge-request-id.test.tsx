import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBridgeRequestId } from "@/features/bridge/use-bridge-request-id";

const randomUuidMock = vi.hoisted(() => vi.fn());

describe("useBridgeRequestId", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    randomUuidMock.mockReset();
    randomUuidMock
      .mockReturnValueOnce("request-id-1")
      .mockReturnValueOnce("request-id-2")
      .mockReturnValue("request-id-3");
    vi.stubGlobal("crypto", {
      randomUUID: randomUuidMock,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reuses the same request id for the same unchanged payload", () => {
    render(<BridgeRequestIdHarness payload={{ amount: "10", asset: "usdc" }} storageKey="test-key" />);

    fireEvent.click(screen.getByRole("button", { name: "Ensure request id" }));
    expect(screen.getByTestId("request-id")).toHaveTextContent("request-id-1");

    fireEvent.click(screen.getByRole("button", { name: "Ensure request id" }));
    expect(screen.getByTestId("request-id")).toHaveTextContent("request-id-1");
    expect(randomUuidMock).toHaveBeenCalledTimes(1);
  });

  it("clears the stored request id when the payload changes and generates a new one", () => {
    const rendered = render(
      <BridgeRequestIdHarness payload={{ amount: "10", asset: "usdc" }} storageKey="test-key" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ensure request id" }));
    expect(screen.getByTestId("request-id")).toHaveTextContent("request-id-1");

    rendered.rerender(
      <BridgeRequestIdHarness payload={{ amount: "11", asset: "usdc" }} storageKey="test-key" />,
    );

    expect(screen.getByTestId("request-id")).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("button", { name: "Ensure request id" }));
    expect(screen.getByTestId("request-id")).toHaveTextContent("request-id-2");
  });

  it("restores the stored request id after a refresh for the same unchanged payload", () => {
    const rendered = render(
      <BridgeRequestIdHarness payload={{ amount: "10", asset: "usdc" }} storageKey="test-key" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ensure request id" }));
    expect(screen.getByTestId("request-id")).toHaveTextContent("request-id-1");

    rendered.unmount();

    render(<BridgeRequestIdHarness payload={{ amount: "10", asset: "usdc" }} storageKey="test-key" />);

    expect(screen.getByTestId("request-id")).toHaveTextContent("request-id-1");
    expect(randomUuidMock).toHaveBeenCalledTimes(1);
  });
});

function BridgeRequestIdHarness({
  payload,
  storageKey,
}: {
  payload: unknown;
  storageKey: string;
}) {
  const { ensureRequestId, requestId } = useBridgeRequestId({
    payload,
    storageKey,
  });

  return (
    <div>
      <button type="button" onClick={() => ensureRequestId()}>
        Ensure request id
      </button>
      <div data-testid="request-id">{requestId ?? "none"}</div>
    </div>
  );
}
