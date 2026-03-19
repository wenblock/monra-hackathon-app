import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { Pool, type PoolClient } from "pg";

import { config } from "./config.js";
import {
  TRANSFER_ASSETS,
  getTransferAssetDecimals,
  isOfframpSourceAsset,
  isOnrampDestinationAsset,
} from "./lib/assets.js";
import type {
  AppTransaction,
  AppUser,
  AccountType,
  BankRecipientType,
  BridgeSourceDepositInstructions,
  BridgeKycStatus,
  OnrampDestinationAsset,
  OfframpSourceAsset,
  BridgeTransferState,
  BridgeTosStatus,
  Recipient,
  RecipientKind,
  SolanaBalancesResponse,
  TransactionDirection,
  TransactionEntryType,
  TransactionStatus,
  TransferAsset,
} from "./types.js";

const pool = new Pool({
  connectionString: config.databaseUrl,
});

let databaseInitialized: Promise<void> | null = null;

const managedSerialSequences = [
  {
    columnName: "id",
    tableName: "users",
  },
  {
    columnName: "id",
    tableName: "recipients",
  },
  {
    columnName: "id",
    tableName: "transactions",
  },
] as const;

export function getSerialSequenceRepairState(maxId: number | null) {
  if (maxId === null) {
    return {
      isCalled: false,
      nextValue: 1,
      setValue: 1,
    };
  }

  return {
    isCalled: true,
    nextValue: maxId + 1,
    setValue: maxId,
  };
}

export async function repairManagedSerialSequences(client: Pool | PoolClient = pool) {
  for (const sequence of managedSerialSequences) {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('${sequence.tableName}', '${sequence.columnName}'),
        COALESCE(MAX(${sequence.columnName}), 1),
        MAX(${sequence.columnName}) IS NOT NULL
      )
      FROM ${sequence.tableName}
    `);
  }
}

interface UserRow {
  id: string;
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

interface UserBalanceRow {
  user_id: string;
  sol_raw: string;
  usdc_raw: string;
  eurc_raw: string;
  created_at: Date;
  updated_at: Date;
}

interface RecipientRow {
  id: string;
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

interface TransactionRow {
  id: string;
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

interface LedgerTransaction {
  id: number;
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
  transactionSignature: string;
  status: TransactionStatus;
  confirmedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TransactionPageCursor {
  id: number;
  sortAt: string;
}

interface ListTransactionsOptions {
  cursor?: string | null;
  limit?: number;
}

interface ListTransactionsResult {
  nextCursor: string | null;
  transactions: AppTransaction[];
}

const userSelection = `
  id, cdp_user_id, email, account_type, full_name, country_code, country_name,
  business_name, solana_address, bridge_kyc_link_id, bridge_kyc_link, bridge_tos_link,
  bridge_kyc_status, bridge_tos_status, bridge_customer_id, created_at, updated_at
`;

const userBalanceSelection = `
  user_id, sol_raw, usdc_raw, eurc_raw, created_at, updated_at
`;

const recipientSelection = `
  id, user_id, kind, display_name, bank_recipient_type, wallet_address,
  bank_country_code, bank_name, iban, bic, first_name, last_name, business_name,
  bridge_external_account_id, last_payment_at, created_at, updated_at
`;

const transactionSelection = `
  id, user_id, recipient_id, direction, entry_type, asset, amount_decimal, amount_raw, network,
  tracked_wallet_address, from_wallet_address, counterparty_name, counterparty_wallet_address,
  bridge_transfer_id, bridge_transfer_status, bridge_source_amount, bridge_source_currency,
  bridge_source_deposit_instructions, bridge_destination_tx_hash, bridge_receipt_url,
  transaction_signature, webhook_event_id, normalization_key, status, confirmed_at,
  failed_at, failure_reason, created_at, updated_at
`;

const userBalanceColumns = {
  sol: "sol_raw",
  usdc: "usdc_raw",
  eurc: "eurc_raw",
} satisfies Record<TransferAsset, keyof UserBalanceRow>;

function mapUser(row: UserRow): AppUser {
  return {
    id: Number(row.id),
    cdpUserId: row.cdp_user_id,
    email: row.email,
    accountType: row.account_type,
    fullName: row.full_name,
    countryCode: row.country_code,
    countryName: row.country_name,
    businessName: row.business_name,
    solanaAddress: row.solana_address,
    bridgeKycLinkId: row.bridge_kyc_link_id,
    bridgeKycLink: row.bridge_kyc_link,
    bridgeTosLink: row.bridge_tos_link,
    bridgeKycStatus: row.bridge_kyc_status,
    bridgeTosStatus: row.bridge_tos_status,
    bridgeCustomerId: row.bridge_customer_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRecipient(row: RecipientRow): Recipient {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    kind: row.kind,
    displayName: row.display_name,
    bankRecipientType: row.bank_recipient_type,
    walletAddress: row.wallet_address,
    bankCountryCode: row.bank_country_code,
    bankName: row.bank_name,
    iban: row.iban,
    bic: row.bic,
    firstName: row.first_name,
    lastName: row.last_name,
    businessName: row.business_name,
    bridgeExternalAccountId: row.bridge_external_account_id,
    lastPaymentAt: row.last_payment_at ? row.last_payment_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBridgeSourceDepositInstructions(value: unknown): BridgeSourceDepositInstructions | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const readString = (...keys: string[]) => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }

    return null;
  };

  return {
    paymentRail: readString("paymentRail", "payment_rail"),
    amount: readString("amount"),
    currency: readString("currency"),
    depositMessage: readString("depositMessage", "deposit_message"),
    fromAddress: readString("fromAddress", "from_address"),
    toAddress: readString("toAddress", "to_address"),
    blockchainMemo: readString("blockchainMemo", "blockchain_memo"),
    bankName: readString("bankName", "bank_name"),
    bankAddress: readString("bankAddress", "bank_address"),
    iban: readString("iban"),
    bic: readString("bic"),
    accountHolderName: readString("accountHolderName", "account_holder_name"),
    bankRoutingNumber: readString("bankRoutingNumber", "bank_routing_number"),
    bankAccountNumber: readString("bankAccountNumber", "bank_account_number"),
    bankBeneficiaryName: readString("bankBeneficiaryName", "bank_beneficiary_name"),
    bankBeneficiaryAddress: readString("bankBeneficiaryAddress", "bank_beneficiary_address"),
  };
}

function mapLedgerTransaction(row: TransactionRow): LedgerTransaction {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    recipientId: row.recipient_id === null ? null : Number(row.recipient_id),
    direction: row.direction,
    entryType: row.entry_type,
    asset: row.asset,
    amountDecimal: row.amount_decimal,
    amountRaw: row.amount_raw,
    network: row.network,
    trackedWalletAddress: row.tracked_wallet_address,
    fromWalletAddress: row.from_wallet_address,
    counterpartyName: row.counterparty_name,
    counterpartyWalletAddress: row.counterparty_wallet_address,
    bridgeTransferId: row.bridge_transfer_id,
    bridgeTransferStatus: row.bridge_transfer_status,
    bridgeSourceAmount: row.bridge_source_amount,
    bridgeSourceCurrency: row.bridge_source_currency,
    bridgeSourceDepositInstructions: mapBridgeSourceDepositInstructions(
      row.bridge_source_deposit_instructions,
    ),
    bridgeDestinationTxHash: row.bridge_destination_tx_hash,
    bridgeReceiptUrl: row.bridge_receipt_url,
    transactionSignature: row.transaction_signature,
    status: row.status,
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
    failedAt: row.failed_at ? row.failed_at.toISOString() : null,
    failureReason: row.failure_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function createEmptyBalance(decimals: number) {
  return {
    formatted: formatTokenAmount("0", decimals),
    raw: "0",
  };
}

function formatTokenAmount(rawAmount: string, decimals: number) {
  const isNegative = rawAmount.startsWith("-");
  const unsignedAmount = isNegative ? rawAmount.slice(1) : rawAmount;
  const normalizedAmount = unsignedAmount.replace(/^0+/, "") || "0";

  if (decimals === 0) {
    return `${isNegative ? "-" : ""}${normalizedAmount}`;
  }

  const paddedAmount = normalizedAmount.padStart(decimals + 1, "0");
  const whole = paddedAmount.slice(0, -decimals);
  const fraction = paddedAmount.slice(-decimals).replace(/0+$/, "");

  return `${isNegative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function mapBalances(row: UserBalanceRow): SolanaBalancesResponse["balances"] {
  return Object.fromEntries(
    TRANSFER_ASSETS.map(asset => {
      const raw = row[userBalanceColumns[asset]];
      return [
        asset,
        {
          formatted: formatTokenAmount(raw, getTransferAssetDecimals(asset)),
          raw,
        },
      ];
    }),
  ) as SolanaBalancesResponse["balances"];
}

function parseDecimalAmountToRaw(value: string, decimals: number) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(`Amount exceeds supported precision for ${decimals} decimal places.`);
  }

  const normalizedWhole = wholePart.replace(/^0+/, "") || "0";
  const normalizedFraction = fractionPart.padEnd(decimals, "0");
  return BigInt(`${normalizedWhole}${normalizedFraction}` || "0").toString();
}

function addBalanceDelta(
  balanceDeltas: Map<number, Record<TransferAsset, bigint>>,
  userId: number,
  asset: TransferAsset,
  amountRaw: bigint,
) {
  const current =
    balanceDeltas.get(userId) ??
    (Object.fromEntries(TRANSFER_ASSETS.map(balanceAsset => [balanceAsset, 0n])) as Record<
      TransferAsset,
      bigint
    >);

  current[asset] += amountRaw;

  balanceDeltas.set(userId, current);
}

async function applyBalanceDeltas(
  client: PoolClient,
  balanceDeltas: Map<number, Record<TransferAsset, bigint>>,
) {
  for (const [userId, delta] of balanceDeltas.entries()) {
    await ensureUserBalanceRecord(client, userId);

    for (const asset of TRANSFER_ASSETS) {
      if (delta[asset] === 0n) {
        continue;
      }

      const balanceColumn = userBalanceColumns[asset];
      await client.query(
        `
          UPDATE user_balances
          SET ${balanceColumn} = ((${balanceColumn})::NUMERIC + $2::NUMERIC)::TEXT, updated_at = NOW()
          WHERE user_id = $1
        `,
        [userId, delta[asset].toString()],
      );
    }
  }
}

async function applyRecipientLastPayments(
  client: PoolClient,
  updatedRecipientPayments: Map<number, Date>,
) {
  for (const [recipientId, confirmedAt] of updatedRecipientPayments.entries()) {
    await client.query(
      `
        UPDATE recipients
        SET last_payment_at = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [recipientId, confirmedAt],
    );
  }
}

async function ensureUserBalanceRecord(client: PoolClient, userId: number) {
  await client.query(
    `
      INSERT INTO user_balances (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );
}

async function getUserBalanceRow(client: PoolClient, userId: number) {
  await ensureUserBalanceRecord(client, userId);

  const result = await client.query<UserBalanceRow>(
    `
      SELECT ${userBalanceSelection}
      FROM user_balances
      WHERE user_id = $1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

async function getRecipientByWalletAddressForUserClient(
  client: PoolClient,
  userId: number,
  walletAddress: string,
) {
  const result = await client.query<RecipientRow>(
    `
      SELECT ${recipientSelection}
      FROM recipients
      WHERE user_id = $1 AND wallet_address = $2
      LIMIT 1
    `,
    [userId, walletAddress],
  );

  return result.rows[0] ? mapRecipient(result.rows[0]) : null;
}

export async function getUserByCdpUserId(cdpUserId: string) {
  const result = await pool.query<UserRow>(
    `
      SELECT ${userSelection}
      FROM users
      WHERE cdp_user_id = $1
    `,
    [cdpUserId],
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function getUsersBySolanaAddresses(addresses: string[]) {
  if (addresses.length === 0) {
    return [];
  }

  const result = await pool.query<UserRow>(
    `
      SELECT ${userSelection}
      FROM users
      WHERE solana_address = ANY($1::TEXT[])
    `,
    [Array.from(new Set(addresses))],
  );

  return result.rows.map(mapUser);
}

interface CreateUserInput {
  cdpUserId: string;
  email: string;
  accountType: AccountType;
  fullName: string;
  countryCode: string;
  countryName: string;
  businessName?: string;
  bridgeCustomerId?: string | null;
  bridgeKycLink?: string | null;
  bridgeKycLinkId?: string | null;
  bridgeKycStatus?: BridgeKycStatus | null;
  bridgeTosLink?: string | null;
  bridgeTosStatus?: BridgeTosStatus | null;
}

export async function createUser(input: CreateUserInput) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<UserRow>(
      `
        INSERT INTO users (
          cdp_user_id,
          email,
          account_type,
          full_name,
          country_code,
          country_name,
          business_name,
          bridge_kyc_link_id,
          bridge_kyc_link,
          bridge_tos_link,
          bridge_kyc_status,
          bridge_tos_status,
          bridge_customer_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING ${userSelection}
      `,
      [
        input.cdpUserId,
        input.email,
        input.accountType,
        input.fullName,
        input.countryCode,
        input.countryName,
        input.businessName ?? null,
        input.bridgeKycLinkId ?? null,
        input.bridgeKycLink ?? null,
        input.bridgeTosLink ?? null,
        input.bridgeKycStatus ?? null,
        input.bridgeTosStatus ?? null,
        input.bridgeCustomerId ?? null,
      ],
    );

    const user = mapUser(result.rows[0]);
    await ensureUserBalanceRecord(client, user.id);

    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUserSolanaAddress(cdpUserId: string, solanaAddress: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<UserRow>(
      `
        UPDATE users
        SET solana_address = $2, updated_at = NOW()
        WHERE cdp_user_id = $1
        RETURNING ${userSelection}
      `,
      [cdpUserId, solanaAddress],
    );

    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const user = mapUser(result.rows[0]);
    await ensureUserBalanceRecord(client, user.id);

    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUserBridgeStatuses(input: {
  bridgeKycLink?: string;
  bridgeKycLinkId?: string;
  bridgeKycStatus: BridgeKycStatus;
  bridgeTosLink?: string;
  bridgeTosStatus: BridgeTosStatus;
  bridgeCustomerId?: string;
  cdpUserId?: string;
  userId?: number;
}) {
  const targetField = input.userId === undefined ? "cdp_user_id" : "id";
  const targetValue = input.userId === undefined ? input.cdpUserId : input.userId;

  if (targetValue === undefined) {
    throw new Error("Either userId or cdpUserId is required to update Bridge statuses.");
  }

  const result = await pool.query<UserRow>(
    `
      UPDATE users
      SET
        bridge_kyc_link_id = COALESCE($2, bridge_kyc_link_id),
        bridge_customer_id = COALESCE($3, bridge_customer_id),
        bridge_kyc_link = COALESCE($4, bridge_kyc_link),
        bridge_kyc_status = $5,
        bridge_tos_link = COALESCE($6, bridge_tos_link),
        bridge_tos_status = $7,
        updated_at = NOW()
      WHERE ${targetField} = $1
      RETURNING ${userSelection}
    `,
    [
      targetValue,
      input.bridgeKycLinkId ?? null,
      input.bridgeCustomerId ?? null,
      input.bridgeKycLink ?? null,
      input.bridgeKycStatus,
      input.bridgeTosLink ?? null,
      input.bridgeTosStatus,
    ],
  );

  if (!result.rows[0]) {
    throw new Error("Unable to update Bridge status for unknown user.");
  }

  return mapUser(result.rows[0]);
}

interface CreateRecipientInput {
  userId: number;
  kind: RecipientKind;
  displayName: string;
  bankRecipientType?: BankRecipientType | null;
  walletAddress?: string | null;
  bankCountryCode?: string | null;
  bankName?: string | null;
  iban?: string | null;
  bic?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  bridgeExternalAccountId?: string | null;
}

export async function listRecipientsByUserId(userId: number) {
  const result = await pool.query<RecipientRow>(
    `
      SELECT ${recipientSelection}
      FROM recipients
      WHERE user_id = $1
      ORDER BY updated_at DESC, id DESC
    `,
    [userId],
  );

  return result.rows.map(mapRecipient);
}

export async function createRecipient(input: CreateRecipientInput) {
  const result = await pool.query<RecipientRow>(
    `
      INSERT INTO recipients (
        user_id,
        kind,
        display_name,
        bank_recipient_type,
        wallet_address,
        bank_country_code,
        bank_name,
        iban,
        bic,
        first_name,
        last_name,
        business_name,
        bridge_external_account_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING ${recipientSelection}
    `,
    [
      input.userId,
      input.kind,
      input.displayName,
      input.bankRecipientType ?? null,
      input.walletAddress ?? null,
      input.bankCountryCode ?? null,
      input.bankName ?? null,
      input.iban ?? null,
      input.bic ?? null,
      input.firstName ?? null,
      input.lastName ?? null,
      input.businessName ?? null,
      input.bridgeExternalAccountId ?? null,
    ],
  );

  return mapRecipient(result.rows[0]);
}

export async function getRecipientByIdForUser(userId: number, recipientId: number) {
  const result = await pool.query<RecipientRow>(
    `
      SELECT ${recipientSelection}
      FROM recipients
      WHERE id = $1 AND user_id = $2
    `,
    [recipientId, userId],
  );

  return result.rows[0] ? mapRecipient(result.rows[0]) : null;
}

export async function deleteRecipientByIdForUser(userId: number, recipientId: number) {
  const result = await pool.query<RecipientRow>(
    `
      DELETE FROM recipients
      WHERE id = $1 AND user_id = $2
      RETURNING ${recipientSelection}
    `,
    [recipientId, userId],
  );

  return result.rows[0] ? mapRecipient(result.rows[0]) : null;
}

export async function listTransactionsByUserId(userId: number) {
  const result = await pool.query<TransactionRow>(
    `
      SELECT ${transactionSelection}
      FROM transactions
      WHERE user_id = $1
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
    `,
    [userId],
  );

  return collapseLedgerTransactions(result.rows);
}

export async function listTransactionsByUserIdPaginated(
  userId: number,
  options: ListTransactionsOptions = {},
): Promise<ListTransactionsResult> {
  const result = await pool.query<TransactionRow>(
    `
      SELECT ${transactionSelection}
      FROM transactions
      WHERE user_id = $1
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
    `,
    [userId],
  );

  return paginateTransactions(collapseLedgerTransactions(result.rows), options);
}

export async function getUserBalancesByUserId(userId: number): Promise<SolanaBalancesResponse["balances"]> {
  const client = await pool.connect();

  try {
    const row = await getUserBalanceRow(client, userId);
    return row
      ? mapBalances(row)
      : Object.fromEntries(
          TRANSFER_ASSETS.map(asset => [asset, createEmptyBalance(getTransferAssetDecimals(asset))]),
        ) as SolanaBalancesResponse["balances"];
  } finally {
    client.release();
  }
}

function buildOnrampCounterpartyName(paymentRail: string | null | undefined) {
  const normalizedRail = paymentRail?.trim();
  return normalizedRail ? `Bridge ${normalizedRail.toUpperCase()} On-ramp` : "Bridge On-ramp";
}

function buildOfframpNormalizationKey(bridgeTransferId: string) {
  return `offramp:${bridgeTransferId}`;
}

export interface CreatePendingOnrampTransactionInput {
  asset: OnrampDestinationAsset;
  userId: number;
  walletAddress: string;
  bridgeTransferId: string;
  bridgeTransferStatus: BridgeTransferState;
  sourceAmount: string;
  sourceCurrency: string;
  expectedDestinationAmount: string;
  depositInstructions: BridgeSourceDepositInstructions | null;
  receiptUrl?: string | null;
}

export async function createPendingOnrampTransaction(input: CreatePendingOnrampTransactionInput) {
  const amountRaw = parseDecimalAmountToRaw(
    input.expectedDestinationAmount,
    getTransferAssetDecimals(input.asset),
  );
  const result = await pool.query<TransactionRow>(
    `
      INSERT INTO transactions (
        user_id,
        recipient_id,
        direction,
        entry_type,
        asset,
        amount_decimal,
        amount_raw,
        network,
        tracked_wallet_address,
        from_wallet_address,
        counterparty_name,
        counterparty_wallet_address,
        bridge_transfer_id,
        bridge_transfer_status,
        bridge_source_amount,
        bridge_source_currency,
        bridge_source_deposit_instructions,
        bridge_destination_tx_hash,
        bridge_receipt_url,
        transaction_signature,
        webhook_event_id,
        normalization_key,
        status,
        confirmed_at,
        failed_at,
        failure_reason
      )
      VALUES (
        $1, NULL, 'inbound', 'onramp', $2, $3, $4, 'solana-mainnet', $5, $6, $7, NULL, $8, $9,
        $10, $11, $12::JSONB, NULL, $13, $8, NULL, $14, 'pending', NULL, NULL, NULL
      )
      RETURNING ${transactionSelection}
    `,
    [
      input.userId,
      input.asset,
      input.expectedDestinationAmount,
      amountRaw,
      input.walletAddress,
      input.walletAddress,
      buildOnrampCounterpartyName(input.depositInstructions?.paymentRail),
      input.bridgeTransferId,
      input.bridgeTransferStatus,
      input.sourceAmount,
      input.sourceCurrency,
      input.depositInstructions ? JSON.stringify(input.depositInstructions) : null,
      input.receiptUrl ?? null,
      `onramp:${input.bridgeTransferId}`,
    ],
  );

  return mapCollapsedTransaction(mapLedgerTransaction(result.rows[0]), null);
}

export interface CreatePendingOfframpTransactionInput {
  asset: OfframpSourceAsset;
  amount: string;
  bridgeTransferId: string;
  bridgeTransferStatus: BridgeTransferState;
  depositInstructions: BridgeSourceDepositInstructions;
  recipientId: number;
  recipientName: string;
  receiptUrl?: string | null;
  sourceAmount: string;
  sourceCurrency: string;
  userId: number;
  walletAddress: string;
}

export async function createPendingOfframpTransaction(input: CreatePendingOfframpTransactionInput) {
  const amountRaw = parseDecimalAmountToRaw(input.amount, getTransferAssetDecimals(input.asset));
  const result = await pool.query<TransactionRow>(
    `
      INSERT INTO transactions (
        user_id,
        recipient_id,
        direction,
        entry_type,
        asset,
        amount_decimal,
        amount_raw,
        network,
        tracked_wallet_address,
        from_wallet_address,
        counterparty_name,
        counterparty_wallet_address,
        bridge_transfer_id,
        bridge_transfer_status,
        bridge_source_amount,
        bridge_source_currency,
        bridge_source_deposit_instructions,
        bridge_destination_tx_hash,
        bridge_receipt_url,
        transaction_signature,
        webhook_event_id,
        normalization_key,
        status,
        confirmed_at,
        failed_at,
        failure_reason
      )
      VALUES (
        $1, $2, 'outbound', 'offramp', $3, $4, $5, 'solana-mainnet', $6, $7, $8, NULL, $9, $10,
        $11, $12, $13::JSONB, NULL, $14, $9, NULL, $15, 'pending', NULL, NULL, NULL
      )
      RETURNING ${transactionSelection}
    `,
    [
      input.userId,
      input.recipientId,
      input.asset,
      input.amount,
      amountRaw,
      input.walletAddress,
      input.walletAddress,
      input.recipientName,
      input.bridgeTransferId,
      input.bridgeTransferStatus,
      input.sourceAmount,
      input.sourceCurrency,
      JSON.stringify(input.depositInstructions),
      input.receiptUrl ?? null,
      buildOfframpNormalizationKey(input.bridgeTransferId),
    ],
  );

  return mapCollapsedTransaction(mapLedgerTransaction(result.rows[0]), null);
}

interface PendingOnrampMatchRow {
  id: string;
  user_id: string;
  asset: OnrampDestinationAsset;
  tracked_wallet_address: string;
  bridge_transfer_id: string;
  status: TransactionStatus;
}

interface ConfirmedTransferReconciliationRow {
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

interface PendingOfframpMatchRow {
  id: string;
  user_id: string;
  asset: OfframpSourceAsset;
  tracked_wallet_address: string;
  recipient_id: string | null;
  transaction_signature: string;
  status: TransactionStatus;
}

export async function getPendingOnrampByDestinationTxHash(txHash: string) {
  const result = await pool.query<PendingOnrampMatchRow>(
    `
      SELECT id, user_id, tracked_wallet_address, bridge_transfer_id
      , asset
      FROM transactions
      WHERE entry_type = 'onramp'
        AND status = 'pending'
        AND bridge_destination_tx_hash = $1
      LIMIT 1
    `,
    [txHash],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    asset: row.asset,
    userId: Number(row.user_id),
    trackedWalletAddress: row.tracked_wallet_address,
    bridgeTransferId: row.bridge_transfer_id,
  };
}

export async function getOfframpByBroadcastDetails(input: {
  amountRaw: string;
  asset: OfframpSourceAsset;
  trackedWalletAddress: string;
  userId: number;
  walletAddress: string | null;
}) {
  if (!input.walletAddress) {
    return null;
  }

  const result = await pool.query<PendingOfframpMatchRow>(
    `
      SELECT id, user_id, asset, tracked_wallet_address, recipient_id, transaction_signature, status
      FROM transactions
      WHERE entry_type = 'offramp'
        AND status IN ('pending', 'confirmed')
        AND user_id = $1::bigint
        AND asset = $2::text
        AND amount_raw = $3::text
        AND tracked_wallet_address = $4::text
        AND COALESCE(
          bridge_source_deposit_instructions ->> 'toAddress',
          bridge_source_deposit_instructions ->> 'to_address'
        ) = $5::text
      ORDER BY
        CASE WHEN transaction_signature = bridge_transfer_id THEN 0 ELSE 1 END,
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        id DESC
      LIMIT 1
    `,
    [
      input.userId,
      input.asset,
      input.amountRaw,
      input.trackedWalletAddress,
      input.walletAddress,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    asset: row.asset,
    id: Number(row.id),
    recipientId: row.recipient_id === null ? null : Number(row.recipient_id),
    status: row.status,
    trackedWalletAddress: row.tracked_wallet_address,
    transactionSignature: row.transaction_signature,
    userId: Number(row.user_id),
  };
}

async function reconcilePendingOnrampWithConfirmedTransfer(client: PoolClient, txHash: string) {
  const pendingOnrampResult = await client.query<PendingOnrampMatchRow>(
    `
      SELECT id, user_id, tracked_wallet_address, bridge_transfer_id, status
      , asset
      FROM transactions
      WHERE entry_type = 'onramp'
        AND bridge_destination_tx_hash = $1::text
        AND status IN ('pending', 'confirmed')
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [txHash],
  );

  const pendingOnramp = pendingOnrampResult.rows[0];
  if (!pendingOnramp) {
    return null;
  }

  const confirmedTransferResult = await client.query<ConfirmedTransferReconciliationRow>(
    `
      SELECT
        id,
        user_id,
        tracked_wallet_address,
        amount_decimal,
        amount_raw,
        confirmed_at,
        from_wallet_address,
        counterparty_name,
        counterparty_wallet_address,
        transaction_signature
      FROM transactions
      WHERE entry_type = 'transfer'
        AND status = 'confirmed'
        AND direction = 'inbound'
        AND asset = $4::text
        AND transaction_signature = $1::text
        AND user_id = $2::bigint
        AND tracked_wallet_address = $3::text
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [txHash, pendingOnramp.user_id, pendingOnramp.tracked_wallet_address, pendingOnramp.asset],
  );

  const confirmedTransfer = confirmedTransferResult.rows[0];
  if (!confirmedTransfer) {
    return null;
  }

  if (pendingOnramp.status === "confirmed") {
    await client.query(
      `
        DELETE FROM transactions
        WHERE id = $1::bigint
      `,
      [confirmedTransfer.id],
    );

    return Number(pendingOnramp.user_id);
  }

  const updatedOnramp = await client.query<TransactionRow>(
    `
      UPDATE transactions
      SET
        status = 'confirmed',
        confirmed_at = COALESCE($2::timestamptz, confirmed_at),
        failed_at = NULL,
        failure_reason = NULL,
        amount_decimal = $3::numeric,
        amount_raw = $4::text,
        bridge_transfer_status = 'payment_processed',
        transaction_signature = $1::text,
        from_wallet_address = $5::text,
        counterparty_name = COALESCE($6::text, counterparty_name),
        counterparty_wallet_address = COALESCE($7::text, counterparty_wallet_address),
        updated_at = NOW()
      WHERE id = $8::bigint
      RETURNING ${transactionSelection}
    `,
    [
      confirmedTransfer.transaction_signature,
      confirmedTransfer.confirmed_at,
      confirmedTransfer.amount_decimal,
      confirmedTransfer.amount_raw,
      confirmedTransfer.from_wallet_address,
      confirmedTransfer.counterparty_name ?? null,
      confirmedTransfer.counterparty_wallet_address ?? null,
      pendingOnramp.id,
    ],
  );

  await client.query(
    `
      DELETE FROM transactions
      WHERE id = $1::bigint
    `,
    [confirmedTransfer.id],
  );

  const row = updatedOnramp.rows[0];
  return row ? Number(row.user_id) : Number(pendingOnramp.user_id);
}

async function deleteDuplicateConfirmedTransferForOnramp(
  client: PoolClient,
  input: {
    asset: OnrampDestinationAsset;
    txHash: string;
    trackedWalletAddress: string;
    userId: number;
  },
) {
  const duplicateTransferResult = await client.query<{ id: string }>(
    `
      SELECT id
      FROM transactions
      WHERE entry_type = 'transfer'
        AND status = 'confirmed'
        AND direction = 'inbound'
        AND asset = $4::text
        AND transaction_signature = $1::text
        AND user_id = $2::bigint
        AND tracked_wallet_address = $3::text
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [input.txHash, input.userId, input.trackedWalletAddress, input.asset],
  );

  const duplicateTransfer = duplicateTransferResult.rows[0];
  if (!duplicateTransfer) {
    return false;
  }

  await client.query(
    `
      DELETE FROM transactions
      WHERE id = $1::bigint
    `,
    [duplicateTransfer.id],
  );

  return true;
}

async function deleteDuplicateConfirmedTransferForOfframp(
  client: PoolClient,
  input: {
    asset: OfframpSourceAsset;
    txHash: string;
    trackedWalletAddress: string;
    userId: number;
  },
) {
  const duplicateTransferResult = await client.query<{ id: string }>(
    `
      SELECT id
      FROM transactions
      WHERE entry_type = 'transfer'
        AND status = 'confirmed'
        AND direction = 'outbound'
        AND asset = $4::text
        AND transaction_signature = $1::text
        AND user_id = $2::bigint
        AND tracked_wallet_address = $3::text
      ORDER BY COALESCE(confirmed_at, created_at) DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [input.txHash, input.userId, input.trackedWalletAddress, input.asset],
  );

  const duplicateTransfer = duplicateTransferResult.rows[0];
  if (!duplicateTransfer) {
    return false;
  }

  await client.query(
    `
      DELETE FROM transactions
      WHERE id = $1::bigint
    `,
    [duplicateTransfer.id],
  );

  return true;
}

async function reconcilePendingOnrampWithConfirmedTransferByTxHash(txHash: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const reconciledUserId = await reconcilePendingOnrampWithConfirmedTransfer(client, txHash);

    await client.query("COMMIT");
    return reconciledUserId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface WebhookLedgerEntryInput {
  userId: number;
  recipientId: number | null;
  direction: TransactionDirection;
  entryType: TransactionEntryType;
  asset: TransferAsset;
  amountDecimal: string;
  amountRaw: string;
  trackedWalletAddress: string;
  fromWalletAddress: string;
  counterpartyName?: string | null;
  counterpartyWalletAddress?: string | null;
  transactionSignature: string;
  normalizationKey: string;
  webhookEventId: string;
  confirmedAt: Date;
}

interface AlchemyOnrampCompletionEffectInput {
  type: "onramp_completion";
  txHash: string;
  amountDecimal: string;
  amountRaw: string;
  fromWalletAddress: string;
  counterpartyName?: string | null;
  counterpartyWalletAddress?: string | null;
  confirmedAt: Date;
}

interface AlchemyOfframpBroadcastEffectInput {
  type: "offramp_broadcast";
  transactionId: number;
  txHash: string;
  amountDecimal: string;
  amountRaw: string;
  fromWalletAddress: string;
  toWalletAddress?: string | null;
  confirmedAt: Date;
}

type AlchemyWebhookEffectInput =
  | {
      type: "ledger";
      entry: WebhookLedgerEntryInput;
    }
  | AlchemyOnrampCompletionEffectInput
  | AlchemyOfframpBroadcastEffectInput;

function collectOnrampReconciliationTxHashes(effects: AlchemyWebhookEffectInput[]) {
  const txHashes = new Set<string>();

  for (const effect of effects) {
    if (effect.type === "onramp_completion") {
      txHashes.add(effect.txHash);
      continue;
    }

    if (
      effect.type === "ledger" &&
      effect.entry.entryType === "transfer" &&
      effect.entry.direction === "inbound" &&
      isOnrampDestinationAsset(effect.entry.asset)
    ) {
      txHashes.add(effect.entry.transactionSignature);
    }
  }

  return txHashes;
}

async function insertConfirmedLedgerEntry(client: PoolClient, entry: WebhookLedgerEntryInput) {
  const result = await client.query<TransactionRow>(
    `
      INSERT INTO transactions (
        user_id,
        recipient_id,
        direction,
        entry_type,
        asset,
        amount_decimal,
        amount_raw,
        network,
        tracked_wallet_address,
        from_wallet_address,
        counterparty_name,
        counterparty_wallet_address,
        transaction_signature,
        webhook_event_id,
        normalization_key,
        status,
        confirmed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'solana-mainnet', $8, $9, $10, $11, $12, $13, $14,
        'confirmed', $15
      )
      ON CONFLICT (normalization_key) DO NOTHING
      RETURNING ${transactionSelection}
    `,
    [
      entry.userId,
      entry.recipientId,
      entry.direction,
      entry.entryType,
      entry.asset,
      entry.amountDecimal,
      entry.amountRaw,
      entry.trackedWalletAddress,
      entry.fromWalletAddress,
      entry.counterpartyName ?? null,
      entry.counterpartyWalletAddress ?? null,
      entry.transactionSignature,
      entry.webhookEventId,
      entry.normalizationKey,
      entry.confirmedAt,
    ],
  );

  return result.rows[0] ?? null;
}

async function applyOfframpBroadcastEffect(
  client: PoolClient,
  effect: AlchemyOfframpBroadcastEffectInput,
) {
  const existingResult = await client.query<PendingOfframpMatchRow>(
    `
      SELECT id, user_id, asset, tracked_wallet_address, recipient_id, transaction_signature, status
      FROM transactions
      WHERE id = $1::bigint
        AND entry_type = 'offramp'
      LIMIT 1
      FOR UPDATE
    `,
    [effect.transactionId],
  );

  const existing = existingResult.rows[0];
  if (!existing || !isOfframpSourceAsset(existing.asset)) {
    return null;
  }

  const alreadyBroadcasted = existing.transaction_signature === effect.txHash;
  const updated = await client.query<TransactionRow>(
    `
      UPDATE transactions
      SET
        transaction_signature = $2::text,
        from_wallet_address = $3::text,
        amount_decimal = $4::numeric,
        amount_raw = $5::text,
        counterparty_wallet_address = COALESCE($6::text, counterparty_wallet_address),
        updated_at = NOW()
      WHERE id = $1::bigint
      RETURNING ${transactionSelection}
    `,
    [
      effect.transactionId,
      effect.txHash,
      effect.fromWalletAddress,
      effect.amountDecimal,
      effect.amountRaw,
      effect.toWalletAddress ?? null,
    ],
  );

  const row = updated.rows[0];
  if (!row || !isOfframpSourceAsset(row.asset)) {
    return null;
  }

  const removedDuplicateTransfer = await deleteDuplicateConfirmedTransferForOfframp(client, {
    asset: row.asset,
    trackedWalletAddress: row.tracked_wallet_address,
    txHash: effect.txHash,
    userId: Number(row.user_id),
  });

  return {
    alreadyBroadcasted,
    removedDuplicateTransfer,
    row,
  };
}

const bridgeFailureStates = new Set<BridgeTransferState>([
  "undeliverable",
  "returned",
  "missing_return_policy",
  "refunded",
  "canceled",
  "error",
]);

export async function applyBridgeTransferWebhookUpdate(input: {
  eventId: string;
  webhookId: string;
  eventObjectId: string;
  bridgeTransferId: string;
  bridgeTransferStatus: BridgeTransferState;
  bridgeDestinationTxHash?: string | null;
  destinationAmountDecimal?: string | null;
  receiptUrl?: string | null;
  eventCreatedAt?: Date | null;
}) {
  const client = await pool.connect();
  const bridgeDestinationTxHash = input.bridgeDestinationTxHash ?? null;
  let committed = false;

  try {
    await client.query("BEGIN");

    const processed = await client.query<{ event_id: string }>(
      `
        INSERT INTO processed_bridge_webhook_events (event_id, webhook_id, event_object_id, event_created_at)
        VALUES ($1::text, $2::text, $3::text, $4::timestamptz)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `,
      [input.eventId, input.webhookId, input.eventObjectId, input.eventCreatedAt ?? null],
    );

    if (!processed.rows[0]) {
      await client.query("COMMIT");
      committed = true;

      const affectedUserIds = new Set<number>();
      if (bridgeDestinationTxHash) {
        const reconciledUserId = await reconcilePendingOnrampWithConfirmedTransferByTxHash(
          bridgeDestinationTxHash,
        );

        if (reconciledUserId !== null) {
          affectedUserIds.add(reconciledUserId);
        }
      }

      return {
        affectedUserIds: Array.from(affectedUserIds),
        applied: false,
      };
    }

    const nextAmountDecimal =
      typeof input.destinationAmountDecimal === "string" && input.destinationAmountDecimal.trim().length > 0
        ? input.destinationAmountDecimal.trim()
        : null;
    const nextAmountRaw = nextAmountDecimal ? parseDecimalAmountToRaw(nextAmountDecimal, 6) : null;
    const shouldMarkFailed = bridgeFailureStates.has(input.bridgeTransferStatus);
    const shouldConfirmOfframp = input.bridgeTransferStatus === "payment_processed";

    const result = await client.query<TransactionRow>(
      `
        UPDATE transactions
        SET
          bridge_transfer_status = $2::text,
          bridge_destination_tx_hash = CASE
            WHEN entry_type = 'onramp' AND $3::text IS NOT NULL AND status <> 'confirmed' THEN $3::text
            ELSE bridge_destination_tx_hash
          END,
          bridge_receipt_url = COALESCE($4::text, bridge_receipt_url),
          amount_decimal = CASE
            WHEN entry_type = 'onramp' AND $5::numeric IS NOT NULL THEN $5::numeric
            ELSE amount_decimal
          END,
          amount_raw = CASE
            WHEN entry_type = 'onramp' AND $6::text IS NOT NULL THEN $6::text
            ELSE amount_raw
          END,
          status = CASE
            WHEN $7::boolean AND status = 'pending' THEN 'failed'
            WHEN entry_type = 'offramp' AND $8::boolean AND status = 'pending' THEN 'confirmed'
            ELSE status
          END,
          confirmed_at = CASE
            WHEN entry_type = 'offramp' AND $8::boolean AND status = 'pending' THEN COALESCE($9::timestamptz, NOW())
            ELSE confirmed_at
          END,
          failed_at = CASE
            WHEN $7::boolean AND status = 'pending' THEN NOW()
            WHEN entry_type = 'offramp' AND $8::boolean AND status = 'pending' THEN NULL
            ELSE failed_at
          END,
          failure_reason = CASE
            WHEN $7::boolean AND status = 'pending' THEN CONCAT('Bridge transfer moved to ', $2::text, '.')
            WHEN entry_type = 'offramp' AND $8::boolean AND status = 'pending' THEN NULL
            ELSE failure_reason
          END,
          updated_at = NOW()
        WHERE bridge_transfer_id = $1::text
        RETURNING ${transactionSelection}
      `,
      [
        input.bridgeTransferId,
        input.bridgeTransferStatus,
        input.bridgeDestinationTxHash ?? null,
        input.receiptUrl ?? null,
        nextAmountDecimal,
        nextAmountRaw,
        shouldMarkFailed,
        shouldConfirmOfframp,
        input.eventCreatedAt ?? null,
      ],
    );

    const affectedUserIds = new Set(result.rows.map(row => Number(row.user_id)));
    const updatedRecipientPayments = new Map<number, Date>();

    if (shouldConfirmOfframp) {
      const recipientConfirmedAt = input.eventCreatedAt ?? new Date();

      for (const row of result.rows) {
        if (row.entry_type === "offramp" && row.recipient_id !== null) {
          updatedRecipientPayments.set(Number(row.recipient_id), recipientConfirmedAt);
        }
      }
    }

    await applyRecipientLastPayments(client, updatedRecipientPayments);

    await client.query("COMMIT");
    committed = true;

    if (bridgeDestinationTxHash) {
      const reconciledUserId = await reconcilePendingOnrampWithConfirmedTransferByTxHash(
        bridgeDestinationTxHash,
      );

      if (reconciledUserId !== null) {
        affectedUserIds.add(reconciledUserId);
      }
    }

    return {
      affectedUserIds: Array.from(affectedUserIds),
      applied: true,
    };
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function applyAlchemyWebhookEffects(input: {
  eventId: string;
  webhookId: string;
  eventCreatedAt?: Date | null;
  effects: AlchemyWebhookEffectInput[];
}) {
  const client = await pool.connect();
  const onrampReconciliationTxHashes = collectOnrampReconciliationTxHashes(input.effects);
  let committed = false;

  try {
    await client.query("BEGIN");

    const processed = await client.query<{ event_id: string }>(
      `
        INSERT INTO processed_webhook_events (event_id, webhook_id, event_created_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `,
      [input.eventId, input.webhookId, input.eventCreatedAt ?? null],
    );

    if (!processed.rows[0]) {
      await client.query("COMMIT");
      committed = true;

      const affectedUserIds = new Set<number>();
      for (const txHash of onrampReconciliationTxHashes) {
        const reconciledUserId = await reconcilePendingOnrampWithConfirmedTransferByTxHash(txHash);

        if (reconciledUserId !== null) {
          affectedUserIds.add(reconciledUserId);
        }
      }

      return {
        affectedUserIds: Array.from(affectedUserIds),
        applied: false,
      };
    }

    const affectedUserIds = new Set<number>();
    const balanceDeltas = new Map<number, Record<TransferAsset, bigint>>();
    const updatedRecipientPayments = new Map<number, Date>();

    for (const effect of input.effects) {
      if (effect.type === "ledger") {
        const inserted = await insertConfirmedLedgerEntry(client, effect.entry);
        if (!inserted) {
          continue;
        }

        affectedUserIds.add(Number(inserted.user_id));
        addBalanceDelta(
          balanceDeltas,
          Number(inserted.user_id),
          inserted.asset,
          inserted.direction === "inbound" ? BigInt(inserted.amount_raw) : BigInt(inserted.amount_raw) * -1n,
        );

        if (
          inserted.recipient_id !== null &&
          inserted.direction === "outbound" &&
          inserted.entry_type === "transfer"
        ) {
          updatedRecipientPayments.set(Number(inserted.recipient_id), effect.entry.confirmedAt);
        }

        continue;
      }

      if (effect.type === "offramp_broadcast") {
        const applied = await applyOfframpBroadcastEffect(client, effect);
        if (!applied) {
          continue;
        }

        const userId = Number(applied.row.user_id);
        affectedUserIds.add(userId);

        if (!applied.alreadyBroadcasted && !applied.removedDuplicateTransfer) {
          addBalanceDelta(balanceDeltas, userId, applied.row.asset, BigInt(effect.amountRaw) * -1n);
        }

        continue;
      }

      const completed = await client.query<TransactionRow>(
        `
          UPDATE transactions
          SET
            status = 'confirmed',
            confirmed_at = $2,
            failed_at = NULL,
            failure_reason = NULL,
            amount_decimal = $3,
            amount_raw = $4,
            bridge_transfer_status = 'payment_processed',
            transaction_signature = $1,
            from_wallet_address = $5,
            counterparty_name = COALESCE($6, counterparty_name),
            counterparty_wallet_address = COALESCE($7, counterparty_wallet_address),
            updated_at = NOW()
          WHERE entry_type = 'onramp'
            AND status = 'pending'
            AND bridge_destination_tx_hash = $1
          RETURNING ${transactionSelection}
        `,
        [
          effect.txHash,
          effect.confirmedAt,
          effect.amountDecimal,
          effect.amountRaw,
          effect.fromWalletAddress,
          effect.counterpartyName ?? null,
          effect.counterpartyWalletAddress ?? null,
        ],
      );

      const row = completed.rows[0];
      if (!row) {
        continue;
      }

      const userId = Number(row.user_id);
      affectedUserIds.add(userId);

      if (!isOnrampDestinationAsset(row.asset)) {
        continue;
      }

      const removedDuplicateTransfer = await deleteDuplicateConfirmedTransferForOnramp(client, {
        asset: row.asset,
        trackedWalletAddress: row.tracked_wallet_address,
        txHash: effect.txHash,
        userId,
      });

      if (!removedDuplicateTransfer) {
        addBalanceDelta(balanceDeltas, userId, row.asset, BigInt(effect.amountRaw));
      }
    }

    await applyBalanceDeltas(client, balanceDeltas);
    await applyRecipientLastPayments(client, updatedRecipientPayments);

    await client.query("COMMIT");
    committed = true;

    for (const txHash of onrampReconciliationTxHashes) {
      const reconciledUserId = await reconcilePendingOnrampWithConfirmedTransferByTxHash(txHash);

      if (reconciledUserId !== null) {
        affectedUserIds.add(reconciledUserId);
      }
    }

    return {
      affectedUserIds: Array.from(affectedUserIds),
      applied: true,
    };
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function applyWebhookLedgerEntries(input: {
  eventId: string;
  webhookId: string;
  eventCreatedAt?: Date | null;
  entries: WebhookLedgerEntryInput[];
}) {
  return applyAlchemyWebhookEffects({
    ...input,
    effects: input.entries.map(entry => ({
      entry,
      type: "ledger" as const,
    })),
  });
}

export async function resolveRecipientIdByWalletAddressForUser(
  userId: number,
  walletAddress: string | null,
) {
  if (!walletAddress) {
    return null;
  }

  const client = await pool.connect();

  try {
    const recipient = await getRecipientByWalletAddressForUserClient(client, userId, walletAddress);
    return recipient?.id ?? null;
  } finally {
    client.release();
  }
}

export async function getRecipientByWalletAddressForUser(
  userId: number,
  walletAddress: string | null,
) {
  if (!walletAddress) {
    return null;
  }

  const client = await pool.connect();

  try {
    return getRecipientByWalletAddressForUserClient(client, userId, walletAddress);
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  await pool.end();
}

export async function initializeDatabase() {
  if (!databaseInitialized) {
    databaseInitialized = initializeDatabaseInternal();
  }

  return databaseInitialized;
}

async function initializeDatabaseInternal() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const schemaPath = path.resolve(process.cwd(), "src", "db", "schema.sql");
  const migrationsDirectory = path.resolve(process.cwd(), "src", "db", "migrations");

  const schemaSql = await readFile(schemaPath, "utf8");
  if (schemaSql.trim().length > 0) {
    await pool.query(schemaSql);
  }

  let migrationFiles: string[] = [];

  try {
    migrationFiles = (await readdir(migrationsDirectory))
      .filter(fileName => fileName.endsWith(".sql"))
      .sort();
  } catch (error) {
    if (!isMissingDirectoryError(error)) {
      throw error;
    }
  }

  for (const migrationFile of migrationFiles) {
    const alreadyApplied = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migrationFile],
    );

    if (alreadyApplied.rowCount) {
      continue;
    }

    const migrationPath = path.join(migrationsDirectory, migrationFile);
    const migrationSql = await readFile(migrationPath, "utf8");

    await pool.query("BEGIN");

    try {
      await pool.query(migrationSql);
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationFile]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }

  await repairManagedSerialSequences();
}

function isMissingDirectoryError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function collapseLedgerTransactions(rows: TransactionRow[]) {
  const ledgerTransactions = rows.map(mapLedgerTransaction);
  const groupedTransactions = new Map<
    string,
    {
      feeRaw: bigint;
      transfers: LedgerTransaction[];
    }
  >();

  for (const transaction of ledgerTransactions) {
    const key = `${transaction.transactionSignature}:${transaction.trackedWalletAddress}`;
    const group = groupedTransactions.get(key) ?? {
      feeRaw: 0n,
      transfers: [],
    };

    if (transaction.entryType === "network_fee" && transaction.direction === "outbound") {
      group.feeRaw += BigInt(transaction.amountRaw);
    } else if (
      transaction.entryType === "transfer" ||
      transaction.entryType === "onramp" ||
      transaction.entryType === "offramp"
    ) {
      group.transfers.push(transaction);
    }

    groupedTransactions.set(key, group);
  }

  const collapsedTransactions: AppTransaction[] = [];

  for (const group of groupedTransactions.values()) {
    if (group.transfers.length === 0) {
      continue;
    }

    let feeAttached = false;
    const feeRaw = group.feeRaw > 0n ? group.feeRaw.toString() : null;
    const feeDisplay = feeRaw ? formatTokenAmount(feeRaw, 9) : null;

    for (const transfer of group.transfers) {
      const shouldAttachFee =
        !feeAttached && transfer.direction === "outbound" && feeRaw !== null;

      collapsedTransactions.push(
        mapCollapsedTransaction(transfer, shouldAttachFee ? { raw: feeRaw, display: feeDisplay } : null),
      );

      if (shouldAttachFee) {
        feeAttached = true;
      }
    }
  }

  collapsedTransactions.sort(compareTransactionsByMostRecent);

  return collapsedTransactions;
}

function mapCollapsedTransaction(
  transaction: LedgerTransaction,
  fee:
    | {
        raw: string | null;
        display: string | null;
      }
    | null,
): AppTransaction {
  return {
    ...transaction,
    amountDecimal: formatAssetAmount(transaction.amountRaw, transaction.asset),
    amountDisplay: formatAssetAmount(transaction.amountRaw, transaction.asset),
    networkFeeRaw: fee?.raw ?? null,
    networkFeeDisplay: fee?.display ?? null,
  };
}

function paginateTransactions(
  transactions: AppTransaction[],
  options: ListTransactionsOptions,
): ListTransactionsResult {
  const limit = normalizeTransactionLimit(options.limit);
  const startIndex = findTransactionStartIndex(transactions, options.cursor);
  const page = transactions.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < transactions.length;

  return {
    nextCursor: hasMore && page.length > 0 ? encodeTransactionCursor(page[page.length - 1]) : null,
    transactions: page,
  };
}

function normalizeTransactionLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit || limit < 1) {
    return 20;
  }

  return Math.min(Math.trunc(limit), 100);
}

function findTransactionStartIndex(transactions: AppTransaction[], cursor?: string | null) {
  const parsedCursor = decodeTransactionCursor(cursor);
  if (!parsedCursor) {
    return 0;
  }

  const index = transactions.findIndex(transaction => {
    const sortAt = getTransactionSortTimestamp(transaction);
    return sortAt === parsedCursor.sortAt && transaction.id === parsedCursor.id;
  });

  return index === -1 ? 0 : index + 1;
}

function compareTransactionsByMostRecent(left: AppTransaction, right: AppTransaction) {
  const leftTimestamp = Date.parse(getTransactionSortTimestamp(left));
  const rightTimestamp = Date.parse(getTransactionSortTimestamp(right));

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return right.id - left.id;
}

function getTransactionSortTimestamp(transaction: Pick<AppTransaction, "confirmedAt" | "createdAt">) {
  return transaction.confirmedAt ?? transaction.createdAt;
}

function encodeTransactionCursor(transaction: AppTransaction) {
  const payload: TransactionPageCursor = {
    id: transaction.id,
    sortAt: getTransactionSortTimestamp(transaction),
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeTransactionCursor(cursor?: string | null): TransactionPageCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const id = "id" in parsed ? parsed.id : null;
    const sortAt = "sortAt" in parsed ? parsed.sortAt : null;

    if (typeof id !== "number" || !Number.isFinite(id) || typeof sortAt !== "string" || !sortAt) {
      return null;
    }

    return {
      id,
      sortAt,
    };
  } catch {
    return null;
  }
}

function formatAssetAmount(rawAmount: string, asset: TransferAsset) {
  return formatTokenAmount(rawAmount, getTransferAssetDecimals(asset));
}
