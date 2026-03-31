import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SendDrawer from "@/SendDrawer";
import type { Recipient, SolanaBalancesResponse } from "@/types";

const sendTransactionMock = vi.hoisted(() => vi.fn());
const createRecipientMock = vi.hoisted(() => vi.fn());
const fetchTransactionContextMock = vi.hoisted(() => vi.fn());
const getRecipientTokenAccountAddressMock = vi.hoisted(() => vi.fn(() => "recipient-associated-token-account"));
const normalizeWalletTransactionErrorMock = vi.hoisted(() => vi.fn(() => "Normalized wallet error."));
const parseAssetAmountMock = vi.hoisted(() => vi.fn(() => ({
  decimal: "1",
  raw: 1_000_000n,
})));
const prepareTransferTransactionMock = vi.hoisted(() => vi.fn(() => ({
  needsRecipientTokenAccountCreation: true,
  serializedTransaction: "serialized-transaction",
})));

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

vi.mock("@/features/wallet/runtime", () => ({
  getRecipientTokenAccountAddress: getRecipientTokenAccountAddressMock,
  normalizeWalletTransactionError: normalizeWalletTransactionErrorMock,
  parseAssetAmount: parseAssetAmountMock,
  prepareTransferTransaction: prepareTransferTransactionMock,
}));

describe("SendDrawer SPL transfers", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    createRecipientMock.mockReset();
    fetchTransactionContextMock.mockReset();
    getRecipientTokenAccountAddressMock.mockReset();
    normalizeWalletTransactionErrorMock.mockClear();
    parseAssetAmountMock.mockClear();
    prepareTransferTransactionMock.mockReset();
    sendTransactionMock.mockReset();

    createRecipientMock.mockResolvedValue(buildRecipient());
    fetchTransactionContextMock.mockResolvedValue({
      recentBlockhash: "blockhash-1",
      recipientTokenAccountExists: false,
    });
    getRecipientTokenAccountAddressMock.mockReturnValue("recipient-associated-token-account");
    prepareTransferTransactionMock.mockReturnValue({
      needsRecipientTokenAccountCreation: true,
      serializedTransaction: "serialized-transaction",
    });
    sendTransactionMock.mockResolvedValue({
      transactionSignature: "send-signature-1",
    });
  });

  it("uses the derived ATA mode for fresh USDC recipients", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /add new recipient/i }));
    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Monra Recipient" },
    });
    fireEvent.change(screen.getByLabelText("Solana Wallet Address"), {
      target: { value: "11111111111111111111111111111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save recipient" }));

    expect(await screen.findAllByText("Monra Recipient")).toHaveLength(2);

    await selectTriggerOption(0, "USDC");
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(fetchTransactionContextMock).toHaveBeenCalledWith({
        asset: "usdc",
        recipientAddress: "11111111111111111111111111111111",
        recipientTokenAccountAddress: "recipient-associated-token-account",
        senderAddress: "11111111111111111111111111111111",
      }),
    );

    expect(getRecipientTokenAccountAddressMock).toHaveBeenCalledWith(
      "usdc",
      "11111111111111111111111111111111",
    );
    expect(prepareTransferTransactionMock).toHaveBeenCalledWith(expect.objectContaining({
      amountRaw: 1_000_000n,
      asset: "usdc",
      recentBlockhash: "blockhash-1",
      recipientAddress: "11111111111111111111111111111111",
      recipientTokenAccountExists: false,
      senderAddress: "11111111111111111111111111111111",
      tokenDestination: { mode: "derived-associated-account" },
    }));
    expect(sendTransactionMock).toHaveBeenCalledWith({
      network: "solana",
      solanaAccount: "11111111111111111111111111111111",
      transaction: "serialized-transaction",
    });
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

async function selectTriggerOption(triggerIndex: number, optionLabel: string) {
  const trigger = document.querySelectorAll("[data-slot='select-trigger']").item(triggerIndex);

  if (!(trigger instanceof HTMLElement)) {
    throw new Error(`Select trigger ${triggerIndex} is unavailable.`);
  }

  trigger.focus();
  fireEvent.keyDown(trigger, { code: "ArrowDown", key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: optionLabel }));
}
