import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { Pool, type PoolClient } from "pg";

import { config } from "./config.js";
import type {
  AppTransaction,
  AppUser,
  AccountType,
  BankRecipientType,
  BridgeKycStatus,
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
  user_id, sol_raw, usdc_raw, created_at, updated_at
`;

const recipientSelection = `
  id, user_id, kind, display_name, bank_recipient_type, wallet_address,
  bank_country_code, bank_name, iban, bic, first_name, last_name, business_name,
  bridge_external_account_id, last_payment_at, created_at, updated_at
`;

const transactionSelection = `
  id, user_id, recipient_id, direction, entry_type, asset, amount_decimal, amount_raw, network,
  tracked_wallet_address, from_wallet_address, counterparty_name, counterparty_wallet_address,
  transaction_signature, webhook_event_id, normalization_key, status, confirmed_at, failed_at,
  failure_reason, created_at, updated_at
`;

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
  return {
    sol: {
      formatted: formatTokenAmount(row.sol_raw, 9),
      raw: row.sol_raw,
    },
    usdc: {
      formatted: formatTokenAmount(row.usdc_raw, 6),
      raw: row.usdc_raw,
    },
  };
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
  bridgeCustomerId: string;
  bridgeKycLink: string;
  bridgeKycLinkId: string;
  bridgeKycStatus: BridgeKycStatus;
  bridgeTosLink: string;
  bridgeTosStatus: BridgeTosStatus;
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
        input.bridgeKycLinkId,
        input.bridgeKycLink,
        input.bridgeTosLink,
        input.bridgeKycStatus,
        input.bridgeTosStatus,
        input.bridgeCustomerId,
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
  bridgeKycStatus: BridgeKycStatus;
  bridgeTosLink?: string;
  bridgeTosStatus: BridgeTosStatus;
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
        bridge_kyc_status = $2,
        bridge_tos_status = $3,
        bridge_kyc_link = COALESCE($4, bridge_kyc_link),
        bridge_tos_link = COALESCE($5, bridge_tos_link),
        updated_at = NOW()
      WHERE ${targetField} = $1
      RETURNING ${userSelection}
    `,
    [
      targetValue,
      input.bridgeKycStatus,
      input.bridgeTosStatus,
      input.bridgeKycLink ?? null,
      input.bridgeTosLink ?? null,
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
    return row ? mapBalances(row) : { sol: createEmptyBalance(9), usdc: createEmptyBalance(6) };
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

export async function applyWebhookLedgerEntries(input: {
  eventId: string;
  webhookId: string;
  eventCreatedAt?: Date | null;
  entries: WebhookLedgerEntryInput[];
}) {
  const client = await pool.connect();

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
      return {
        affectedUserIds: [] as number[],
        applied: false,
      };
    }

    const insertedUserIds = new Set<number>();
    const balanceDeltas = new Map<number, { sol: bigint; usdc: bigint }>();
    const updatedRecipientPayments = new Map<number, Date>();

    for (const entry of input.entries) {
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

      if (!result.rows[0]) {
        continue;
      }

      insertedUserIds.add(entry.userId);

      const current = balanceDeltas.get(entry.userId) ?? { sol: 0n, usdc: 0n };
      const signedAmount =
        entry.direction === "inbound" ? BigInt(entry.amountRaw) : BigInt(entry.amountRaw) * -1n;

      if (entry.asset === "sol") {
        current.sol += signedAmount;
      } else {
        current.usdc += signedAmount;
      }

      balanceDeltas.set(entry.userId, current);

      if (entry.recipientId !== null && entry.direction === "outbound" && entry.entryType === "transfer") {
        updatedRecipientPayments.set(entry.recipientId, entry.confirmedAt);
      }
    }

    for (const [userId, delta] of balanceDeltas.entries()) {
      await ensureUserBalanceRecord(client, userId);

      if (delta.sol !== 0n) {
        await client.query(
          `
            UPDATE user_balances
            SET sol_raw = ((sol_raw)::NUMERIC + $2::NUMERIC)::TEXT, updated_at = NOW()
            WHERE user_id = $1
          `,
          [userId, delta.sol.toString()],
        );
      }

      if (delta.usdc !== 0n) {
        await client.query(
          `
            UPDATE user_balances
            SET usdc_raw = ((usdc_raw)::NUMERIC + $2::NUMERIC)::TEXT, updated_at = NOW()
            WHERE user_id = $1
          `,
          [userId, delta.usdc.toString()],
        );
      }
    }

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

    await client.query("COMMIT");

    return {
      affectedUserIds: Array.from(insertedUserIds),
      applied: true,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
    } else if (transaction.entryType === "transfer") {
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

      collapsedTransactions.push({
        ...transfer,
        amountDecimal: formatAssetAmount(transfer.amountRaw, transfer.asset),
        amountDisplay: formatAssetAmount(transfer.amountRaw, transfer.asset),
        networkFeeRaw: shouldAttachFee ? feeRaw : null,
        networkFeeDisplay: shouldAttachFee ? feeDisplay : null,
      });

      if (shouldAttachFee) {
        feeAttached = true;
      }
    }
  }

  collapsedTransactions.sort(compareTransactionsByMostRecent);

  return collapsedTransactions;
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
  return formatTokenAmount(rawAmount, asset === "sol" ? 9 : 6);
}
