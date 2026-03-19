-- Replace the placeholder values in this file before running it.
-- This repair assumes:
-- 1. The failed Solana tx should be removed from the ledger.
-- 2. The successful Solana tx already exists as a confirmed inbound transfer row
--    for the same destination asset as the on-ramp.
-- 3. The on-ramp row identified by bridge_transfer_id should become the canonical confirmed record.

BEGIN;

WITH target_onramp AS (
  SELECT id, user_id, asset, tracked_wallet_address
  FROM transactions
  WHERE entry_type = 'onramp'
    AND bridge_transfer_id = '__BRIDGE_TRANSFER_ID__'
  ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC
  LIMIT 1
),
failed_transfer_rows AS (
  SELECT t.id
  FROM transactions t
  JOIN target_onramp o
    ON o.user_id = t.user_id
   AND o.tracked_wallet_address = t.tracked_wallet_address
  WHERE t.entry_type = 'transfer'
    AND t.status = 'confirmed'
    AND t.direction = 'inbound'
    AND t.asset = o.asset
    AND t.transaction_signature = '__FAILED_TX_HASH__'
),
deleted_failed_transfers AS (
  DELETE FROM transactions
  WHERE id IN (SELECT id FROM failed_transfer_rows)
  RETURNING id
),
successful_transfer AS (
  SELECT
    t.id,
    t.amount_decimal,
    t.amount_raw,
    t.confirmed_at,
    t.from_wallet_address,
    t.counterparty_name,
    t.counterparty_wallet_address,
    t.transaction_signature
  FROM transactions t
  JOIN target_onramp o
    ON o.user_id = t.user_id
   AND o.tracked_wallet_address = t.tracked_wallet_address
  WHERE t.entry_type = 'transfer'
    AND t.status = 'confirmed'
    AND t.direction = 'inbound'
    AND t.asset = o.asset
    AND t.transaction_signature = '__SUCCESSFUL_TX_HASH__'
  ORDER BY COALESCE(t.confirmed_at, t.created_at) DESC, t.id DESC
  LIMIT 1
),
updated_onramp AS (
  UPDATE transactions
  SET
    bridge_destination_tx_hash = '__SUCCESSFUL_TX_HASH__',
    bridge_transfer_status = CASE
      WHEN EXISTS (SELECT 1 FROM successful_transfer) THEN 'payment_processed'
      ELSE 'payment_submitted'
    END,
    status = CASE
      WHEN EXISTS (SELECT 1 FROM successful_transfer) THEN 'confirmed'
      ELSE 'pending'
    END,
    confirmed_at = COALESCE((SELECT confirmed_at FROM successful_transfer), confirmed_at),
    failed_at = NULL,
    failure_reason = NULL,
    amount_decimal = COALESCE((SELECT amount_decimal FROM successful_transfer), amount_decimal),
    amount_raw = COALESCE((SELECT amount_raw FROM successful_transfer), amount_raw),
    transaction_signature = COALESCE(
      (SELECT transaction_signature FROM successful_transfer),
      transaction_signature
    ),
    from_wallet_address = COALESCE(
      (SELECT from_wallet_address FROM successful_transfer),
      from_wallet_address
    ),
    counterparty_name = COALESCE((SELECT counterparty_name FROM successful_transfer), counterparty_name),
    counterparty_wallet_address = COALESCE(
      (SELECT counterparty_wallet_address FROM successful_transfer),
      counterparty_wallet_address
    ),
    updated_at = NOW()
  WHERE id = (SELECT id FROM target_onramp)
  RETURNING id
)
DELETE FROM transactions
WHERE id IN (SELECT id FROM successful_transfer);

COMMIT;
