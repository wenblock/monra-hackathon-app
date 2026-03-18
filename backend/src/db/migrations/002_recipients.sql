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
