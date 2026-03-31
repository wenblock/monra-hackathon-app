import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OfframpDrawer from "@/OfframpDrawer";
import { getMaxAmountForAsset } from "@/OfframpDrawer.helpers";
import type { AppTransaction, Recipient, SolanaBalancesResponse } from "@/types";

const sendTransactionMock = vi.hoisted(() => vi.fn());
const createOfframpMock = vi.hoisted(() => vi.fn());
const fetchTransactionContextMock = vi.hoisted(() => vi.fn());
const getAssetDecimalsMock = vi.hoisted(() => vi.fn(() => 6));
const getRecipientTokenAccountAddressMock = vi.hoisted(() => vi.fn(() => "11111111111111111111111111111111"));
const normalizeWalletTransactionErrorMock = vi.hoisted(() => vi.fn(() => "Normalized wallet error."));
const parseAssetAmountMock = vi.hoisted(() => vi.fn(() => ({
  decimal: "25",
  raw: 25_000_000n,
})));
const prepareTransferTransactionMock = vi.hoisted(() => vi.fn(() => ({
  needsRecipientTokenAccountCreation: false,
  serializedTransaction: "serialized-transaction",
})));

vi.mock("@coinbase/cdp-hooks", () => ({
  useSendSolanaTransaction: () => ({
    sendSolanaTransaction: sendTransactionMock,
  }),
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");

  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
    value?: string;
  } | null>(null);

  function Select({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) {
    return (
      <SelectContext.Provider value={{ onValueChange, value }}>
        {children}
      </SelectContext.Provider>
    );
  }

  function SelectTrigger({ children }: { children: React.ReactNode }) {
    return (
      <button data-slot="select-trigger" type="button">
        {children}
      </button>
    );
  }

  function SelectValue({ placeholder }: { placeholder?: string }) {
    const context = React.useContext(SelectContext);

    return <span>{context?.value || placeholder || ""}</span>;
  }

  function SelectContent({ children }: { children: React.ReactNode }) {
    return <div data-slot="select-content">{children}</div>;
  }

  function SelectItem({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) {
    const context = React.useContext(SelectContext);

    return (
      <button role="option" type="button" onClick={() => context?.onValueChange?.(value)}>
        {children}
      </button>
    );
  }

  return {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  };
});

vi.mock("@/features/wallet/runtime", () => ({
  getAssetDecimals: getAssetDecimalsMock,
  getRecipientTokenAccountAddress: getRecipientTokenAccountAddressMock,
  normalizeWalletTransactionError: normalizeWalletTransactionErrorMock,
  parseAssetAmount: parseAssetAmountMock,
  prepareTransferTransaction: prepareTransferTransactionMock,
}));

describe("OfframpDrawer", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    createOfframpMock.mockReset();
    fetchTransactionContextMock.mockReset();
    getAssetDecimalsMock.mockClear();
    getRecipientTokenAccountAddressMock.mockReset();
    normalizeWalletTransactionErrorMock.mockClear();
    parseAssetAmountMock.mockClear();
    prepareTransferTransactionMock.mockReset();
    sendTransactionMock.mockReset();

    createOfframpMock.mockResolvedValue(buildOfframpTransaction());
    getRecipientTokenAccountAddressMock.mockReturnValue("11111111111111111111111111111111");
    fetchTransactionContextMock.mockResolvedValue({
      recentBlockhash: "blockhash-1",
      recipientTokenAccountExists: true,
    });
    prepareTransferTransactionMock.mockReturnValue({
      needsRecipientTokenAccountCreation: false,
      serializedTransaction: "serialized-transaction",
    });
    sendTransactionMock.mockResolvedValue({
      transactionSignature: "broadcast-signature-1",
    });
  });

  it("shows an MFA reminder before broadcasting the source transfer", async () => {
    render(
      <Harness />,
    );

    expect(
      screen.getByText(
        "If MFA is enabled, Verification code is needed before broadcasting this source transfer.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a max action next to the amount field", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "MAX" })).toBeInTheDocument();
  });

  it("computes the full available balance and disables max for empty balances", () => {
    expect(
      getMaxAmountForAsset({
        asset: "eurc",
        availableRawBalance: "50000000",
      }),
    ).toBe("50");

    expect(
      getMaxAmountForAsset({
        asset: "usdc",
        availableRawBalance: "75250000",
      }),
    ).toBe("75.25");

    expect(
      getMaxAmountForAsset({
        asset: "eurc",
        availableRawBalance: "0",
      }),
    ).toBeNull();
  });

  it("disables max when the selected asset has no available balance", () => {
    render(
      <Harness
        balances={{
          eurc: { formatted: "0.00", raw: "0" },
          sol: { formatted: "1.00", raw: "1000000000" },
          usdc: { formatted: "0.00", raw: "0" },
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "MAX" })).toBeDisabled();
  });

  it("uses the direct bridge token account when it already exists", async () => {
    render(<Harness />);

    await selectTriggerOption(1, "Monra Treasury");
    expect(await screen.findByText("DE89370400440532013000")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("EUR amount"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(prepareTransferTransactionMock).toHaveBeenCalledWith(expect.objectContaining({
        asset: "eurc",
        recentBlockhash: "blockhash-1",
        recipientAddress: "11111111111111111111111111111111",
        recipientTokenAccountExists: true,
        senderAddress: "11111111111111111111111111111111",
        tokenDestination: {
          mode: "explicit-token-account",
          tokenAccountAddress: "11111111111111111111111111111111",
        },
      })),
    );
  });

  it("falls back to the derived ATA when bridge only returns a wallet owner", async () => {
    fetchTransactionContextMock
      .mockResolvedValueOnce({
        recentBlockhash: "blockhash-direct",
        recipientTokenAccountExists: false,
      })
      .mockResolvedValueOnce({
        recentBlockhash: "blockhash-derived",
        recipientTokenAccountExists: false,
      });
    getRecipientTokenAccountAddressMock.mockReturnValue("derived-associated-token-account");
    prepareTransferTransactionMock.mockReturnValue({
      needsRecipientTokenAccountCreation: true,
      serializedTransaction: "serialized-transaction",
    });

    render(<Harness />);

    await selectTriggerOption(1, "Monra Treasury");
    expect(await screen.findByText("DE89370400440532013000")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("EUR amount"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(fetchTransactionContextMock).toHaveBeenCalledTimes(2));

    expect(fetchTransactionContextMock).toHaveBeenNthCalledWith(1, {
      asset: "eurc",
      recipientAddress: "11111111111111111111111111111111",
      recipientTokenAccountAddress: "11111111111111111111111111111111",
      senderAddress: "11111111111111111111111111111111",
    });
    expect(fetchTransactionContextMock).toHaveBeenNthCalledWith(2, {
      asset: "eurc",
      recipientAddress: "11111111111111111111111111111111",
      recipientTokenAccountAddress: "derived-associated-token-account",
      senderAddress: "11111111111111111111111111111111",
    });
    expect(prepareTransferTransactionMock).toHaveBeenCalledWith(expect.objectContaining({
      asset: "eurc",
      recentBlockhash: "blockhash-derived",
      recipientAddress: "11111111111111111111111111111111",
      recipientTokenAccountExists: false,
      senderAddress: "11111111111111111111111111111111",
      tokenDestination: { mode: "derived-associated-account" },
    }));
  });
});

function buildBalances(): SolanaBalancesResponse["balances"] {
  return {
    eurc: { formatted: "50.00", raw: "50000000" },
    sol: { formatted: "1.00", raw: "1000000000" },
    usdc: { formatted: "75.25", raw: "75250000" },
  };
}

function Harness({
  balances = buildBalances(),
}: {
  balances?: SolanaBalancesResponse["balances"];
}) {
  return (
    <OfframpDrawer
      balances={balances}
      onCreateBankRecipient={vi.fn()}
      onCreateOfframp={createOfframpMock}
      onFetchTransactionContext={fetchTransactionContextMock}
      onOpenChange={() => undefined}
      open
      recipients={[buildRecipient()]}
      requestScope="cdp-user-1"
      senderAddress="11111111111111111111111111111111"
    />
  );
}

function buildRecipient(): Recipient {
  return {
    bankCountryCode: "DE",
    bankName: "Monra Bank",
    bankRecipientType: "business",
    bic: "MONRADEFF",
    bridgeExternalAccountId: "bridge-account-1",
    businessName: "Monra Treasury",
    createdAt: "2026-03-27T10:00:00.000Z",
    displayName: "Monra Treasury",
    firstName: null,
    iban: "DE89370400440532013000",
    id: 1,
    kind: "bank",
    lastName: null,
    lastPaymentAt: null,
    publicId: "00000000-0000-4000-8000-000000000001",
    updatedAt: "2026-03-27T10:00:00.000Z",
    userId: 1,
    walletAddress: null,
  };
}

function buildOfframpTransaction(): AppTransaction {
  return {
    amountDecimal: "25",
    amountDisplay: "25",
    amountRaw: "25000000",
    asset: "eurc",
    bridgeDestinationTxHash: null,
    bridgeReceiptUrl: null,
    bridgeSourceAmount: "25",
    bridgeSourceCurrency: "EUR",
    bridgeSourceDepositInstructions: {
      accountHolderName: null,
      amount: "25",
      bankAccountNumber: null,
      bankAddress: null,
      bankBeneficiaryAddress: null,
      bankBeneficiaryName: null,
      bankName: null,
      bankRoutingNumber: null,
      bic: null,
      blockchainMemo: null,
      currency: "EUR",
      depositMessage: null,
      fromAddress: null,
      iban: null,
      paymentRail: "sepa",
      toAddress: "11111111111111111111111111111111",
    },
    bridgeTransferId: "bridge-transfer-1",
    bridgeTransferStatus: "pending",
    confirmedAt: null,
    counterpartyName: "Monra Treasury",
    counterpartyWalletAddress: null,
    createdAt: "2026-03-27T10:00:00.000Z",
    direction: "outbound",
    entryType: "offramp",
    failedAt: null,
    failureReason: null,
    fromWalletAddress: "11111111111111111111111111111111",
    id: 1,
    network: "solana-mainnet",
    networkFeeDisplay: null,
    networkFeeRaw: null,
    outputAmountDecimal: null,
    outputAmountDisplay: null,
    outputAmountRaw: null,
    outputAsset: null,
    publicId: "00000000-0000-4000-8000-000000000042",
    recipientId: 1,
    status: "pending",
    trackedWalletAddress: "11111111111111111111111111111111",
    transactionSignature: "pending-signature",
    updatedAt: "2026-03-27T10:00:00.000Z",
    userId: 1,
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
