CREATE TABLE IF NOT EXISTS processed_bridge_webhook_events (
  event_id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event_object_id TEXT NULL,
  event_created_at TIMESTAMPTZ NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_entry_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_entry_type_check
  CHECK (entry_type IN ('transfer', 'network_fee', 'onramp'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bridge_transfer_id TEXT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bridge_transfer_status TEXT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bridge_source_amount TEXT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bridge_source_currency TEXT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bridge_source_deposit_instructions JSONB NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bridge_destination_tx_hash TEXT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bridge_receipt_url TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_bridge_transfer_id_uidx
  ON transactions (bridge_transfer_id)
  WHERE bridge_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_bridge_destination_tx_hash_idx
  ON transactions (bridge_destination_tx_hash)
  WHERE bridge_destination_tx_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_onramp_bridge_destination_tx_hash_uidx
  ON transactions (bridge_destination_tx_hash)
  WHERE bridge_destination_tx_hash IS NOT NULL AND entry_type = 'onramp';

CREATE INDEX IF NOT EXISTS transactions_pending_onramp_idx
  ON transactions (status, bridge_destination_tx_hash, user_id)
  WHERE entry_type = 'onramp';
