export type AccountType = "individual" | "business";
export type RecipientKind = "wallet" | "bank";
export type BankRecipientType = "individual" | "business";
export type TransferAsset = "sol" | "usdc" | "eurc";
export type StablecoinAsset = Exclude<TransferAsset, "sol">;
export type OnrampDestinationAsset = StablecoinAsset;
export type OfframpSourceAsset = StablecoinAsset;
export type YieldAsset = "usdc";
export type YieldAction = "deposit" | "withdraw";
export type YieldPositionStatus = "tracked" | "untracked" | "none";
export type TransactionStatus = "pending" | "confirmed" | "failed";
export type TransactionDirection = "inbound" | "outbound";
export type TransactionEntryType =
  | "transfer"
  | "network_fee"
  | "onramp"
  | "offramp"
  | "swap"
  | "yield_deposit"
  | "yield_withdraw";
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

export type BridgeCustomerStatus =
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

export interface AppUser {
  id: number;
  publicId: string;
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
  bridgeKycStatus: BridgeCustomerStatus | null;
  bridgeTosStatus: "approved" | "pending" | null;
  bridgeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthIdentity {
  cdpUserId: string;
  email: string | null;
}

export interface SessionBootstrapResponse {
  status: "needs_onboarding" | "active";
  identity: AuthIdentity;
  user: AppUser | null;
  bridge: BridgeComplianceState | null;
}

export interface OnboardingPayload {
  accountType: AccountType;
  fullName: string;
  countryCode: string;
  businessName?: string;
}

export interface BridgeComplianceState {
  customerStatus: BridgeCustomerStatus | null;
  hasAcceptedTermsOfService: boolean;
  showTosAlert: boolean;
  showKycAlert: boolean;
}

export interface BridgeStatusResponse {
  bridge: BridgeComplianceState;
  user: AppUser;
}

export interface TokenBalanceAmount {
  raw: string;
  formatted: string;
}

export interface TreasuryValuation {
  liquidTreasuryValueUsd: string | null;
  yieldInvestedValueUsd: string | null;
  treasuryValueUsd: string | null;
  assetValuesUsd: Record<TransferAsset, string | null>;
  isStale: boolean;
  pricesUsd: Record<TransferAsset, string | null>;
  lastUpdatedAt: string | null;
  unavailableAssets: TransferAsset[];
}

export interface YieldTrackedPosition {
  principal: TokenBalanceAmount;
  totalDeposited: TokenBalanceAmount;
  grossWithdrawn: TokenBalanceAmount;
  updatedAt: string | null;
}

export interface YieldTrackedPositionsResponse {
  positions: {
    usdc: YieldTrackedPosition;
  };
}

export interface YieldPortfolioPosition {
  currentPosition: TokenBalanceAmount;
  earnings: TokenBalanceAmount;
  valueUsd: string | null;
  status: YieldPositionStatus;
}

export interface YieldPortfolioSnapshot {
  positions: {
    usdc: YieldPortfolioPosition;
  };
}

export interface SolanaBalancesResponse {
  network: "solana-mainnet";
  balances: {
    sol: TokenBalanceAmount;
    usdc: TokenBalanceAmount;
    eurc: TokenBalanceAmount;
  };
  valuation: TreasuryValuation;
  yield: YieldPortfolioSnapshot;
}

export interface SolanaTransactionContextResponse {
  recentBlockhash: string;
  recipientTokenAccountExists?: boolean;
}

export interface FetchSolanaTransactionContextPayload {
  asset: TransferAsset;
  senderAddress: string;
  recipientAddress: string;
  recipientTokenAccountAddress?: string;
}

export interface Recipient {
  id: number;
  publicId: string;
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

export interface CreateOnrampPayload {
  amount: string;
  destinationAsset: OnrampDestinationAsset;
}

export interface CreateOfframpPayload {
  amount: string;
  sourceAsset: OfframpSourceAsset;
  recipientPublicId: string;
}

export interface CreateSwapOrderPayload {
  amount: string;
  inputAsset: TransferAsset;
  outputAsset: TransferAsset;
}

export interface ExecuteSwapPayload {
  requestId: string;
  signedTransaction: string;
}

export interface ConfirmYieldTransactionPayload {
  action: YieldAction;
  asset: YieldAsset;
  amount: string;
  transactionSignature: string;
}

export type CreateRecipientPayload =
  | {
      kind: "wallet";
      fullName: string;
      walletAddress: string;
    }
  | {
      kind: "bank";
      bankCountryCode: string;
      recipientType: "individual";
      firstName: string;
      lastName: string;
      bankName: string;
      iban: string;
      bic: string;
    }
  | {
      kind: "bank";
      bankCountryCode: string;
      recipientType: "business";
      businessName: string;
      bankName: string;
      iban: string;
      bic: string;
    };

export interface RecipientListResponse {
  recipients: Recipient[];
}

export interface BridgeSourceDepositInstructions {
  paymentRail: string | null;
  amount: string | null;
  currency: string | null;
  depositMessage: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  blockchainMemo: string | null;
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
  publicId: string;
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
  outputAsset: TransferAsset | null;
  outputAmountDecimal: string | null;
  outputAmountRaw: string | null;
  outputAmountDisplay: string | null;
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

export interface TransactionListResponse {
  transactions: AppTransaction[];
  nextCursor: string | null;
}

export interface StreamTokenResponse {
  token: string;
  expiresAt: string;
}

export interface SwapOrderResponse {
  requestId: string;
  quotedAt: string;
  quote: {
    feeBps: number | null;
    feeMint: string | null;
    inputAmountDecimal: string;
    inputAmountRaw: string;
    inputAsset: TransferAsset;
    mode: string | null;
    outputAmountDecimal: string;
    outputAmountRaw: string;
    outputAsset: TransferAsset;
    router: string | null;
  };
  transaction: string;
}

export interface SwapExecuteResponse {
  balances: SolanaBalancesResponse["balances"];
  transaction: AppTransaction;
}

export interface YieldConfirmPendingResponse {
  message: string | null;
  status: "pending";
}

export interface YieldConfirmFailedResponse {
  message: string;
  status: "failed";
}

export interface YieldConfirmConfirmedResponse {
  status: "confirmed";
  balances: SolanaBalancesResponse["balances"];
  transaction: AppTransaction;
  position: YieldTrackedPosition;
}

export type YieldConfirmResponse =
  | YieldConfirmPendingResponse
  | YieldConfirmFailedResponse
  | YieldConfirmConfirmedResponse;

export interface TransactionStreamResponse {
  balances: SolanaBalancesResponse["balances"];
  valuation: TreasuryValuation;
  yield: YieldPortfolioSnapshot;
  transactions: AppTransaction[];
}
