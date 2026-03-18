CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id BIGINT NULL REFERENCES recipients(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound')),
  asset TEXT NOT NULL CHECK (asset IN ('sol', 'usdc')),
  amount_decimal NUMERIC(36, 9) NOT NULL,
  amount_raw TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network = 'solana-mainnet'),
  from_wallet_address TEXT NOT NULL,
  counterparty_name TEXT NOT NULL,
  counterparty_wallet_address TEXT NOT NULL,
  transaction_signature TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  confirmed_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_user_id_created_at_idx
  ON transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_user_id_status_idx
  ON transactions (user_id, status);

CREATE INDEX IF NOT EXISTS transactions_recipient_id_idx
  ON transactions (recipient_id);
