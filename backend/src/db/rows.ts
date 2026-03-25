import type {
  AccountType,
  BankRecipientType,
  BridgeKycStatus,
  BridgeSourceDepositInstructions,
  BridgeTosStatus,
  BridgeTransferState,
  OfframpSourceAsset,
  OnrampDestinationAsset,
  RecipientKind,
  TransactionDirection,
  TransactionEntryType,
  TransactionStatus,
  TransferAsset,
} from "../types.js";

export interface UserRow {
  id: string;
  public_id: string;
  cdp_user_id: string;
  email: string;
  account_type: AccountType;
  full_name: string;
  country_code: string;
  country_name: string;
  business_name: string | null;
  solana_address: string | null;
  bridge_kyc_link_id: string | null;
  bridge_kyc_link: string | null;
  bridge_tos_link: string | null;
  bridge_kyc_status: BridgeKycStatus | null;
  bridge_tos_status: BridgeTosStatus | null;
  bridge_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface YieldPositionRow {
  user_id: string;
  asset: "usdc";
  principal_raw: string;
  total_deposited_raw: string;
  gross_withdrawn_raw: string;
  last_confirmed_signature: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PendingBridgeTransactionRow {
  bridge_transfer_id: string;
  created_at: Date;
  entry_type: TransactionEntryType;
  id: string;
  updated_at: Date;
  user_id: string;
}

export interface UserBalanceRow {
  user_id: string;
  sol_raw: string;
  usdc_raw: string;
  eurc_raw: string;
  created_at: Date;
  updated_at: Date;
}

export interface RecipientRow {
  id: string;
  public_id: string;
  user_id: string;
  kind: RecipientKind;
  display_name: string;
  bank_recipient_type: BankRecipientType | null;
  wallet_address: string | null;
  bank_country_code: string | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  bridge_external_account_id: string | null;
  last_payment_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRow {
  id: string;
  public_id: string;
  user_id: string;
  recipient_id: string | null;
  direction: TransactionDirection;
  entry_type: TransactionEntryType;
  asset: TransferAsset;
  amount_decimal: string;
  amount_raw: string;
  network: "solana-mainnet";
  tracked_wallet_address: string;
  from_wallet_address: string;
  counterparty_name: string | null;
  counterparty_wallet_address: string | null;
  bridge_transfer_id: string | null;
  bridge_transfer_status: BridgeTransferState | null;
  bridge_source_amount: string | null;
  bridge_source_currency: string | null;
  bridge_source_deposit_instructions: BridgeSourceDepositInstructions | null;
  bridge_destination_tx_hash: string | null;
  bridge_receipt_url: string | null;
  output_asset: TransferAsset | null;
  output_amount_decimal: string | null;
  output_amount_raw: string | null;
  transaction_signature: string;
  webhook_event_id: string | null;
  normalization_key: string;
  status: TransactionStatus;
  confirmed_at: Date | null;
  failed_at: Date | null;
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LedgerTransaction {
  id: number;
  publicId: string;
  userId: number;
  recipientId: number | null;
  direction: TransactionDirection;
  entryType: TransactionEntryType;
  asset: TransferAsset;
  amountDecimal: string;
  amountRaw: string;
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
  transactionSignature: string;
  status: TransactionStatus;
  confirmedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTransactionRow extends TransactionRow {
  fee_rank: string;
  fee_raw: string | null;
  sort_at: Date;
}

export interface PendingOnrampMatchRow {
  id: string;
  user_id: string;
  asset: OnrampDestinationAsset;
  tracked_wallet_address: string;
  bridge_transfer_id: string;
  status: TransactionStatus;
}

export interface ConfirmedTransferReconciliationRow {
  id: string;
  user_id: string;
  tracked_wallet_address: string;
  amount_decimal: string;
  amount_raw: string;
  confirmed_at: Date | null;
  from_wallet_address: string;
  counterparty_name: string | null;
  counterparty_wallet_address: string | null;
  transaction_signature: string;
}

export interface PendingOfframpMatchRow {
  id: string;
  user_id: string;
  asset: OfframpSourceAsset;
  tracked_wallet_address: string;
  recipient_id: string | null;
  transaction_signature: string;
  status: TransactionStatus;
}

export const userSelection = `
  id, public_id, cdp_user_id, email, account_type, full_name, country_code, country_name,
  business_name, solana_address, bridge_kyc_link_id, bridge_kyc_link, bridge_tos_link,
  bridge_kyc_status, bridge_tos_status, bridge_customer_id, created_at, updated_at
`;

export const userBalanceSelection = `
  user_id, sol_raw, usdc_raw, eurc_raw, created_at, updated_at
`;

export const yieldPositionSelection = `
  user_id, asset, principal_raw, total_deposited_raw, gross_withdrawn_raw,
  last_confirmed_signature, created_at, updated_at
`;

export const recipientSelection = `
  id, public_id, user_id, kind, display_name, bank_recipient_type, wallet_address,
  bank_country_code, bank_name, iban, bic, first_name, last_name, business_name,
  bridge_external_account_id, last_payment_at, created_at, updated_at
`;

export const transactionSelection = `
  id, public_id, user_id, recipient_id, direction, entry_type, asset, amount_decimal, amount_raw, network,
  tracked_wallet_address, from_wallet_address, counterparty_name, counterparty_wallet_address,
  bridge_transfer_id, bridge_transfer_status, bridge_source_amount, bridge_source_currency,
  bridge_source_deposit_instructions, bridge_destination_tx_hash, bridge_receipt_url,
  output_asset, output_amount_decimal, output_amount_raw,
  transaction_signature, webhook_event_id, normalization_key, status, confirmed_at,
  failed_at, failure_reason, created_at, updated_at
`;

export const userBalanceColumns = {
  sol: "sol_raw",
  usdc: "usdc_raw",
  eurc: "eurc_raw",
} satisfies Record<TransferAsset, keyof UserBalanceRow>;
