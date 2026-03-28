import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OfframpDrawer, { getMaxAmountForAsset } from "@/OfframpDrawer";
import type { AppTransaction, Recipient, SolanaBalancesResponse } from "@/types";

const sendTransactionMock = vi.hoisted(() => vi.fn());
const createOfframpMock = vi.hoisted(() => vi.fn());
const fetchTransactionContextMock = vi.hoisted(() => vi.fn());

vi.mock("@coinbase/cdp-hooks", () => ({
  useSendSolanaTransaction: () => ({
    sendSolanaTransaction: sendTransactionMock,
  }),
}));

vi.mock("@/features/wallet/runtime", () => ({
  getAssetDecimals: vi.fn(() => 6),
  getRecipientTokenAccountAddress: vi.fn(() => "11111111111111111111111111111111"),
  normalizeWalletTransactionError: vi.fn(() => "Normalized wallet error."),
  parseAssetAmount: vi.fn(() => ({
    decimal: "25",
    raw: 25_000_000n,
  })),
  prepareTransferTransaction: vi.fn(() => ({
    needsRecipientTokenAccountCreation: false,
    serializedTransaction: "serialized-transaction",
  })),
}));

describe("OfframpDrawer", () => {
  beforeEach(() => {
    createOfframpMock.mockReset();
    fetchTransactionContextMock.mockReset();
    sendTransactionMock.mockReset();

    createOfframpMock.mockResolvedValue(buildOfframpTransaction());
    fetchTransactionContextMock.mockResolvedValue({
      recentBlockhash: "blockhash-1",
      recipientTokenAccountExists: true,
    });
    sendTransactionMock.mockReturnValue(new Promise(() => undefined));
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
