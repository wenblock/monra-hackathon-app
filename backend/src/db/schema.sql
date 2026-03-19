CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  cdp_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('individual', 'business')),
  full_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  business_name TEXT NULL,
  solana_address TEXT NULL,
  bridge_kyc_link_id TEXT NULL,
  bridge_kyc_link TEXT NULL,
  bridge_tos_link TEXT NULL,
  bridge_kyc_status TEXT NULL,
  bridge_tos_status TEXT NULL,
  bridge_customer_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_cdp_user_id_idx ON users (cdp_user_id);
CREATE INDEX IF NOT EXISTS users_bridge_customer_id_idx ON users (bridge_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_solana_address_uidx
  ON users (solana_address)
  WHERE solana_address IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_balances (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sol_raw TEXT NOT NULL DEFAULT '0',
  usdc_raw TEXT NOT NULL DEFAULT '0',
  eurc_raw TEXT NOT NULL DEFAULT '0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipients (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('wallet', 'bank')),
  display_name TEXT NOT NULL,
  bank_recipient_type TEXT NULL CHECK (bank_recipient_type IN ('individual', 'business')),
  wallet_address TEXT NULL,
  bank_country_code TEXT NULL,
  bank_name TEXT NULL,
  iban TEXT NULL,
  bic TEXT NULL,
  first_name TEXT NULL,
  last_name TEXT NULL,
  business_name TEXT NULL,
  bridge_external_account_id TEXT NULL,
  last_payment_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (kind = 'wallet' AND wallet_address IS NOT NULL AND bank_recipient_type IS NULL)
    OR
    (kind = 'bank' AND wallet_address IS NULL AND bank_recipient_type IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS recipients_user_wallet_address_uidx
  ON recipients (user_id, wallet_address)
  WHERE wallet_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recipients_user_iban_uidx
  ON recipients (user_id, iban)
  WHERE iban IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recipients_bridge_external_account_id_uidx
  ON recipients (bridge_external_account_id)
  WHERE bridge_external_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS recipients_user_id_updated_at_idx
  ON recipients (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event_created_at TIMESTAMPTZ NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_bridge_webhook_events (
  event_id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event_object_id TEXT NULL,
  event_created_at TIMESTAMPTZ NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id BIGINT NULL REFERENCES recipients(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('transfer', 'network_fee', 'onramp', 'offramp')),
  asset TEXT NOT NULL CHECK (asset IN ('sol', 'usdc', 'eurc')),
  amount_decimal NUMERIC(36, 9) NOT NULL,
  amount_raw TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network = 'solana-mainnet'),
  tracked_wallet_address TEXT NOT NULL,
  from_wallet_address TEXT NOT NULL,
  counterparty_name TEXT NULL,
  counterparty_wallet_address TEXT NULL,
  bridge_transfer_id TEXT NULL,
  bridge_transfer_status TEXT NULL,
  bridge_source_amount TEXT NULL,
  bridge_source_currency TEXT NULL,
  bridge_source_deposit_instructions JSONB NULL,
  bridge_destination_tx_hash TEXT NULL,
  bridge_receipt_url TEXT NULL,
  transaction_signature TEXT NOT NULL,
  webhook_event_id TEXT NULL REFERENCES processed_webhook_events(event_id) ON DELETE SET NULL,
  normalization_key TEXT NOT NULL UNIQUE,
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

CREATE INDEX IF NOT EXISTS transactions_user_id_confirmed_at_idx
  ON transactions (user_id, confirmed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS transactions_transaction_signature_idx
  ON transactions (transaction_signature);
