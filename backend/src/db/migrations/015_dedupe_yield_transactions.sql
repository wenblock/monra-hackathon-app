WITH ranked_yield_rows AS (
  SELECT
    id,
    user_id,
    asset,
    direction,
    status,
    amount_raw::NUMERIC AS amount_raw_numeric,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, tracked_wallet_address, transaction_signature, entry_type, asset
      ORDER BY
        CASE status
          WHEN 'confirmed' THEN 0
          WHEN 'pending' THEN 1
          ELSE 2
        END ASC,
        CASE WHEN webhook_event_id IS NOT NULL THEN 0 ELSE 1 END ASC,
        COALESCE(confirmed_at, created_at) ASC,
        id ASC
    ) AS dedupe_rank
  FROM transactions
  WHERE entry_type IN ('yield_deposit', 'yield_withdraw')
),
duplicate_yield_rows AS (
  SELECT *
  FROM ranked_yield_rows
  WHERE dedupe_rank > 1
),
yield_balance_repairs AS (
  SELECT
    user_id,
    asset,
    SUM(
      CASE
        WHEN status <> 'confirmed' THEN 0::NUMERIC
        WHEN direction = 'inbound' THEN amount_raw_numeric * -1::NUMERIC
        ELSE amount_raw_numeric
      END
    ) AS delta_raw
  FROM duplicate_yield_rows
  GROUP BY user_id, asset
),
updated_usdc_balances AS (
  UPDATE user_balances
  SET
    usdc_raw = ((user_balances.usdc_raw)::NUMERIC + yield_balance_repairs.delta_raw)::TEXT,
    updated_at = NOW()
  FROM yield_balance_repairs
  WHERE user_balances.user_id = yield_balance_repairs.user_id
    AND yield_balance_repairs.asset = 'usdc'
    AND yield_balance_repairs.delta_raw <> 0::NUMERIC
  RETURNING user_balances.user_id
),
updated_eurc_balances AS (
  UPDATE user_balances
  SET
    eurc_raw = ((user_balances.eurc_raw)::NUMERIC + yield_balance_repairs.delta_raw)::TEXT,
    updated_at = NOW()
  FROM yield_balance_repairs
  WHERE user_balances.user_id = yield_balance_repairs.user_id
    AND yield_balance_repairs.asset = 'eurc'
    AND yield_balance_repairs.delta_raw <> 0::NUMERIC
  RETURNING user_balances.user_id
)
DELETE FROM transactions
WHERE id IN (
  SELECT id
  FROM duplicate_yield_rows
);

UPDATE transactions
SET
  normalization_key = CONCAT(
    transaction_signature,
    ':yield:',
    asset,
    ':',
    tracked_wallet_address,
    ':',
    entry_type,
    ':',
    direction
  )
WHERE entry_type IN ('yield_deposit', 'yield_withdraw')
  AND normalization_key <> CONCAT(
    transaction_signature,
    ':yield:',
    asset,
    ':',
    tracked_wallet_address,
    ':',
    entry_type,
    ':',
    direction
  );

DELETE FROM yield_positions;

WITH RECURSIVE ordered_history AS (
  SELECT
    user_id,
    asset,
    amount_raw::NUMERIC AS amount_raw,
    entry_type,
    transaction_signature,
    COALESCE(confirmed_at, created_at) AS occurred_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, asset
      ORDER BY COALESCE(confirmed_at, created_at) ASC, id ASC
    ) AS seq
  FROM transactions
  WHERE status = 'confirmed'
    AND asset = 'usdc'
    AND entry_type IN ('yield_deposit', 'yield_withdraw')
),
replayed_positions AS (
  SELECT
    user_id,
    asset,
    seq,
    CASE
      WHEN entry_type = 'yield_deposit' THEN amount_raw
      ELSE GREATEST(0::NUMERIC - amount_raw, 0::NUMERIC)
    END AS principal_raw,
    CASE WHEN entry_type = 'yield_deposit' THEN amount_raw ELSE 0::NUMERIC END AS total_deposited_raw,
    CASE WHEN entry_type = 'yield_withdraw' THEN amount_raw ELSE 0::NUMERIC END AS gross_withdrawn_raw,
    transaction_signature,
    occurred_at
  FROM ordered_history
  WHERE seq = 1

  UNION ALL

  SELECT
    next_entry.user_id,
    next_entry.asset,
    next_entry.seq,
    CASE
      WHEN next_entry.entry_type = 'yield_deposit'
        THEN replayed_positions.principal_raw + next_entry.amount_raw
      ELSE GREATEST(replayed_positions.principal_raw - next_entry.amount_raw, 0::NUMERIC)
    END AS principal_raw,
    replayed_positions.total_deposited_raw +
      CASE WHEN next_entry.entry_type = 'yield_deposit' THEN next_entry.amount_raw ELSE 0::NUMERIC END,
    replayed_positions.gross_withdrawn_raw +
      CASE WHEN next_entry.entry_type = 'yield_withdraw' THEN next_entry.amount_raw ELSE 0::NUMERIC END,
    next_entry.transaction_signature,
    next_entry.occurred_at
  FROM replayed_positions
  JOIN ordered_history AS next_entry
    ON next_entry.user_id = replayed_positions.user_id
    AND next_entry.asset = replayed_positions.asset
    AND next_entry.seq = replayed_positions.seq + 1
),
first_entries AS (
  SELECT DISTINCT ON (user_id, asset)
    user_id,
    asset,
    occurred_at
  FROM ordered_history
  ORDER BY user_id, asset, seq ASC
),
latest_entries AS (
  SELECT DISTINCT ON (user_id, asset)
    user_id,
    asset,
    principal_raw,
    total_deposited_raw,
    gross_withdrawn_raw,
    transaction_signature,
    occurred_at
  FROM replayed_positions
  ORDER BY user_id, asset, seq DESC
)
INSERT INTO yield_positions (
  user_id,
  asset,
  principal_raw,
  total_deposited_raw,
  gross_withdrawn_raw,
  last_confirmed_signature,
  created_at,
  updated_at
)
SELECT
  latest_entries.user_id,
  latest_entries.asset,
  latest_entries.principal_raw::TEXT,
  latest_entries.total_deposited_raw::TEXT,
  latest_entries.gross_withdrawn_raw::TEXT,
  latest_entries.transaction_signature,
  first_entries.occurred_at,
  latest_entries.occurred_at
FROM latest_entries
JOIN first_entries
  ON first_entries.user_id = latest_entries.user_id
  AND first_entries.asset = latest_entries.asset;
