ALTER TABLE users
  ADD COLUMN IF NOT EXISTS solana_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS bridge_kyc_link_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS bridge_kyc_link TEXT NULL,
  ADD COLUMN IF NOT EXISTS bridge_tos_link TEXT NULL,
  ADD COLUMN IF NOT EXISTS bridge_kyc_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS bridge_tos_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS bridge_customer_id TEXT NULL;

CREATE INDEX IF NOT EXISTS users_bridge_customer_id_idx ON users (bridge_customer_id);
