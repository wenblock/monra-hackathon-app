CREATE UNIQUE INDEX IF NOT EXISTS users_solana_address_uidx
  ON users (solana_address)
  WHERE solana_address IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_balances (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sol_raw TEXT NOT NULL DEFAULT '0',
  usdc_raw TEXT NOT NULL DEFAULT '0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_balances (user_id)
SELECT id
FROM users
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event_created_at TIMESTAMPTZ NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS entry_type TEXT;

UPDATE transactions
SET entry_type = 'transfer'
WHERE entry_type IS NULL;

ALTER TABLE transactions
  ALTER COLUMN entry_type SET NOT NULL;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_entry_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_entry_type_check
  CHECK (entry_type IN ('transfer', 'network_fee'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS tracked_wallet_address TEXT;

UPDATE transactions
SET tracked_wallet_address = from_wallet_address
WHERE tracked_wallet_address IS NULL;

ALTER TABLE transactions
  ALTER COLUMN tracked_wallet_address SET NOT NULL;

ALTER TABLE transactions
  ALTER COLUMN counterparty_name DROP NOT NULL;

ALTER TABLE transactions
  ALTER COLUMN counterparty_wallet_address DROP NOT NULL;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_direction_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_direction_check
  CHECK (direction IN ('inbound', 'outbound'));

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_transaction_signature_key;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS webhook_event_id TEXT NULL REFERENCES processed_webhook_events(event_id) ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS normalization_key TEXT;

UPDATE transactions
SET normalization_key = CONCAT('legacy:', id::TEXT)
WHERE normalization_key IS NULL;

ALTER TABLE transactions
  ALTER COLUMN normalization_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_normalization_key_key'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_normalization_key_key UNIQUE (normalization_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transactions_user_id_confirmed_at_idx
  ON transactions (user_id, confirmed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS transactions_transaction_signature_idx
  ON transactions (transaction_signature);
