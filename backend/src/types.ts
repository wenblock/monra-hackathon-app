export type AccountType = "individual" | "business";

export type RecipientKind = "wallet" | "bank";
export type BankRecipientType = "individual" | "business";
export type TransferAsset = "sol" | "usdc" | "eurc";
export type OnrampDestinationAsset = Exclude<TransferAsset, "sol">;
export type TransactionStatus = "pending" | "confirmed" | "failed";
export type TransactionDirection = "inbound" | "outbound";
export type TransactionEntryType = "transfer" | "network_fee" | "onramp";
export type BridgeTransferState =
  | "pending"
  | "awaiting_funds"
  | "in_review"
  | "funds_received"
  | "payment_submitted"
  | "payment_processed"
  | "undeliverable"
  | "returned"
  | "missing_return_policy"
  | "refunded"
  | "canceled"
  | "error";

export type BridgeKycStatus =
  | "active"
  | "approved"
  | "awaiting_questionnaire"
  | "awaiting_ubo"
  | "incomplete"
  | "not_started"
  | "offboarded"
  | "paused"
  | "rejected"
  | "under_review";

export type BridgeTosStatus = "approved" | "pending";

export interface AppUser {
  id: number;
  cdpUserId: string;
  email: string;
  accountType: AccountType;
  fullName: string;
  countryCode: string;
  countryName: string;
  businessName: string | null;
  solanaAddress: string | null;
  bridgeKycLinkId: string | null;
  bridgeKycLink: string | null;
  bridgeTosLink: string | null;
  bridgeKycStatus: BridgeKycStatus | null;
  bridgeTosStatus: BridgeTosStatus | null;
  bridgeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthIdentity {
  cdpUserId: string;
  email: string | null;
}

export interface BridgeComplianceState {
  customerStatus: BridgeKycStatus | null;
  hasAcceptedTermsOfService: boolean;
  showTosAlert: boolean;
  showKycAlert: boolean;
}

export interface TokenBalanceAmount {
  raw: string;
  formatted: string;
}

export interface SolanaBalancesResponse {
  network: "solana-mainnet";
  balances: {
    sol: TokenBalanceAmount;
    usdc: TokenBalanceAmount;
    eurc: TokenBalanceAmount;
  };
}

export interface SolanaTransactionContextResponse {
  recentBlockhash: string;
  recipientTokenAccountExists?: boolean;
}

export interface Recipient {
  id: number;
  userId: number;
  kind: RecipientKind;
  displayName: string;
  bankRecipientType: BankRecipientType | null;
  walletAddress: string | null;
  bankCountryCode: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  bridgeExternalAccountId: string | null;
  lastPaymentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BridgeSourceDepositInstructions {
  paymentRail: string | null;
  amount: string | null;
  currency: string | null;
  depositMessage: string | null;
  bankName: string | null;
  bankAddress: string | null;
  iban: string | null;
  bic: string | null;
  accountHolderName: string | null;
  bankRoutingNumber: string | null;
  bankAccountNumber: string | null;
  bankBeneficiaryName: string | null;
  bankBeneficiaryAddress: string | null;
}

export interface AppTransaction {
  id: number;
  userId: number;
  recipientId: number | null;
  direction: TransactionDirection;
  entryType: TransactionEntryType;
  asset: TransferAsset;
  amountDecimal: string;
  amountRaw: string;
  amountDisplay: string;
  network: "solana-mainnet";
  trackedWalletAddress: string;
  fromWalletAddress: string;
  counterpartyName: string | null;
  counterpartyWalletAddress: string | null;
  bridgeTransferId: string | null;
  bridgeTransferStatus: BridgeTransferState | null;
  bridgeSourceAmount: string | null;
  bridgeSourceCurrency: string | null;
  bridgeSourceDepositInstructions: BridgeSourceDepositInstructions | null;
  bridgeDestinationTxHash: string | null;
  bridgeReceiptUrl: string | null;
  networkFeeRaw: string | null;
  networkFeeDisplay: string | null;
  transactionSignature: string;
  status: TransactionStatus;
  confirmedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionStreamResponse {
  balances: SolanaBalancesResponse["balances"];
  transactions: AppTransaction[];
}
