CREATE TABLE IF NOT EXISTS yield_positions (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL CHECK (asset IN ('usdc')),
  principal_raw TEXT NOT NULL DEFAULT '0',
  total_deposited_raw TEXT NOT NULL DEFAULT '0',
  gross_withdrawn_raw TEXT NOT NULL DEFAULT '0',
  last_confirmed_signature TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, asset)
);

CREATE INDEX IF NOT EXISTS yield_positions_user_id_updated_at_idx
  ON yield_positions (user_id, updated_at DESC);

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
  AND first_entries.asset = latest_entries.asset
ON CONFLICT (user_id, asset) DO UPDATE
SET
  principal_raw = EXCLUDED.principal_raw,
  total_deposited_raw = EXCLUDED.total_deposited_raw,
  gross_withdrawn_raw = EXCLUDED.gross_withdrawn_raw,
  last_confirmed_signature = EXCLUDED.last_confirmed_signature,
  updated_at = EXCLUDED.updated_at;
