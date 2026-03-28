import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SendDrawer from "@/SendDrawer";
import type { Recipient, SolanaBalancesResponse } from "@/types";

const sendTransactionMock = vi.hoisted(() => vi.fn());
const createRecipientMock = vi.hoisted(() => vi.fn());
const fetchTransactionContextMock = vi.hoisted(() => vi.fn());

vi.mock("@coinbase/cdp-hooks", () => ({
  useSendSolanaTransaction: () => ({
    sendSolanaTransaction: sendTransactionMock,
  }),
}));

vi.mock("@/features/recipients/recipient-payloads", async importOriginal => {
  const actual = await importOriginal<typeof import("@/features/recipients/recipient-payloads")>();

  return {
    ...actual,
    buildWalletRecipientPayload: vi.fn(async (walletForm: { fullName: string; walletAddress: string }) => ({
      kind: "wallet",
      fullName: walletForm.fullName.trim(),
      walletAddress: walletForm.walletAddress.trim(),
    })),
  };
});

vi.mock("@/features/wallet/runtime", () => {
  throw new Error("Unable to load the wallet transaction runtime.");
});

describe("SendDrawer", () => {
  beforeEach(() => {
    sendTransactionMock.mockReset();
    createRecipientMock.mockReset();
    fetchTransactionContextMock.mockReset();
    createRecipientMock.mockResolvedValue(buildRecipient());
  });

  it("shows an MFA reminder for the protected send action", () => {
    render(<Harness />);

    expect(
      screen.getByText(
        "If MFA is enabled, Verification code is needed before sending this transfer.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a user-visible error when the deferred wallet runtime fails to load", async () => {
    render(
      <Harness />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add new recipient/i }));
    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Monra Recipient" },
    });
    fireEvent.change(screen.getByLabelText("Solana Wallet Address"), {
      target: { value: "11111111111111111111111111111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save recipient" }));

    expect(await screen.findAllByText("Monra Recipient")).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "0.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Unable to load the wallet transaction runtime."),
    ).toBeInTheDocument();
    expect(fetchTransactionContextMock).not.toHaveBeenCalled();
    expect(sendTransactionMock).not.toHaveBeenCalled();
  });
});

function buildBalances(): SolanaBalancesResponse["balances"] {
  return {
    sol: { formatted: "1.00", raw: "1000000000" },
    usdc: { formatted: "10.00", raw: "10000000" },
    eurc: { formatted: "10.00", raw: "10000000" },
  };
}

function Harness() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  return (
    <SendDrawer
      balances={buildBalances()}
      onCreateWalletRecipient={async payload => {
        const recipient = await createRecipientMock(payload);
        setRecipients(current => [recipient, ...current]);
        return recipient;
      }}
      onFetchTransactionContext={fetchTransactionContextMock}
      onOpenChange={() => undefined}
      open
      recipients={recipients}
      senderAddress="11111111111111111111111111111111"
    />
  );
}

function buildRecipient(): Recipient {
  return {
    id: 1,
    publicId: "00000000-0000-4000-8000-000000000001",
    userId: 1,
    kind: "wallet",
    displayName: "Monra Recipient",
    bankRecipientType: null,
    walletAddress: "11111111111111111111111111111111",
    bankCountryCode: null,
    bankName: null,
    iban: null,
    bic: null,
    firstName: null,
    lastName: null,
    businessName: null,
    bridgeExternalAccountId: null,
    lastPaymentAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
