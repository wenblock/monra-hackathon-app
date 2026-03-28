import React from "react";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("@/features/session/CoinbaseAuthButton", () => ({
  default: () => React.createElement("button", { type: "button" }, "Continue"),
}));

vi.mock("@coinbase/cdp-react/components/AuthButton", () => ({
  AuthButton: ({
    className,
  }: {
    className?: string;
  }) => React.createElement("button", { className, type: "button" }, "Continue"),
}));

vi.mock("@coinbase/cdp-react/components/SignInModal", () => ({
  SignInModal: ({
    children,
  }: {
    children?: React.ReactNode;
  }) => React.createElement(React.Fragment, null, children),
  SignInModalTrigger: ({
    className,
    label,
  }: {
    className?: string;
    label?: string;
  }) => React.createElement("button", { className, type: "button" }, label ?? "Continue"),
}));

vi.mock("@coinbase/cdp-react/components/CDPReactProvider", () => ({
  CDPReactProvider: ({
    children,
  }: {
    children?: React.ReactNode;
  }) => React.createElement(React.Fragment, null, children),
}));
