import type { PoolClient } from "pg";

import { TRANSFER_ASSETS, getTransferAssetDecimals } from "../../lib/assets.js";
import type {
  AccountType,
  BridgeKycStatus,
  BridgeTosStatus,
  SolanaBalancesResponse,
} from "../../types.js";
import { mapBalances, mapUser, createEmptyBalance } from "../mappers.js";
import { pool } from "../pool.js";
import {
  userBalanceSelection,
  userSelection,
  type UserBalanceRow,
  type UserRow,
} from "../rows.js";
import { withClient, withTransaction } from "../tx.js";

export interface CreateUserInput {
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

export async function ensureUserBalanceRecord(client: PoolClient, userId: number) {
  await client.query(
    `
      INSERT INTO user_balances (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );
}

export async function getUserBalanceRow(client: PoolClient, userId: number) {
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

export async function listUsersWithSolanaAddresses() {
  const result = await pool.query<UserRow>(
    `
      SELECT ${userSelection}
      FROM users
      WHERE solana_address IS NOT NULL
      ORDER BY id ASC
    `,
  );

  return result.rows.map(mapUser);
}

export async function createUser(input: CreateUserInput) {
  return withTransaction(async client => {
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
    return user;
  });
}

export async function updateUserSolanaAddress(cdpUserId: string, solanaAddress: string) {
  return withTransaction(async client => {
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
      return null;
    }

    const user = mapUser(result.rows[0]);
    await ensureUserBalanceRecord(client, user.id);
    return user;
  });
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

export async function getUserBalancesByUserId(userId: number): Promise<SolanaBalancesResponse["balances"]> {
  return withClient(async client => {
    const row = await getUserBalanceRow(client, userId);

    return row
      ? mapBalances(row)
      : (Object.fromEntries(
          TRANSFER_ASSETS.map(asset => [asset, createEmptyBalance(getTransferAssetDecimals(asset))]),
        ) as SolanaBalancesResponse["balances"]);
  });
}
