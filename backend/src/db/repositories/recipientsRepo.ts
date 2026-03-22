import type { PoolClient } from "pg";

import type {
  BankRecipientType,
  RecipientKind,
} from "../../types.js";
import { mapRecipient } from "../mappers.js";
import { pool } from "../pool.js";
import {
  recipientSelection,
  type RecipientRow,
} from "../rows.js";

export interface CreateRecipientInput {
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

export async function getRecipientByWalletAddressForUserClient(
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
      LIMIT 1
    `,
    [recipientId, userId],
  );

  return result.rows[0] ? mapRecipient(result.rows[0]) : null;
}

export async function getRecipientByPublicIdForUser(userId: number, recipientPublicId: string) {
  const result = await pool.query<RecipientRow>(
    `
      SELECT ${recipientSelection}
      FROM recipients
      WHERE public_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [recipientPublicId, userId],
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

export async function deleteRecipientByPublicIdForUser(userId: number, recipientPublicId: string) {
  const result = await pool.query<RecipientRow>(
    `
      DELETE FROM recipients
      WHERE public_id = $1 AND user_id = $2
      RETURNING ${recipientSelection}
    `,
    [recipientPublicId, userId],
  );

  return result.rows[0] ? mapRecipient(result.rows[0]) : null;
}

export async function resolveRecipientIdByWalletAddressForUser(
  userId: number,
  walletAddress: string | null,
) {
  if (!walletAddress) {
    return null;
  }

  const recipient = await getRecipientByWalletAddressForUser(userId, walletAddress);
  return recipient?.id ?? null;
}

export async function getRecipientByWalletAddressForUser(
  userId: number,
  walletAddress: string | null,
) {
  if (!walletAddress) {
    return null;
  }

  const result = await pool.query<RecipientRow>(
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
