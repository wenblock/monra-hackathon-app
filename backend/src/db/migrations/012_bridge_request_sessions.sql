CREATE TABLE IF NOT EXISTS bridge_request_sessions (
  operation_type TEXT NOT NULL CHECK (
    operation_type IN ('kyc_link', 'external_account', 'onramp_transfer', 'offramp_transfer')
  ),
  request_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  bridge_object_id TEXT NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE CASCADE,
  cdp_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operation_type, request_id)
);

CREATE INDEX IF NOT EXISTS bridge_request_sessions_user_id_idx
  ON bridge_request_sessions (user_id, updated_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bridge_request_sessions_cdp_user_id_idx
  ON bridge_request_sessions (cdp_user_id, updated_at DESC)
  WHERE cdp_user_id IS NOT NULL;
