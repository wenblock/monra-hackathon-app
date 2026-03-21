CREATE TABLE IF NOT EXISTS swap_quote_sessions (
  request_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  input_asset TEXT NOT NULL CHECK (input_asset IN ('sol', 'usdc', 'eurc')),
  input_amount_raw TEXT NOT NULL,
  output_asset TEXT NOT NULL CHECK (output_asset IN ('sol', 'usdc', 'eurc')),
  output_amount_raw TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS swap_quote_sessions_user_id_idx
  ON swap_quote_sessions (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS swap_quote_sessions_expires_at_idx
  ON swap_quote_sessions (expires_at);

CREATE TABLE IF NOT EXISTS transaction_stream_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transaction_stream_events_created_at_idx
  ON transaction_stream_events (created_at DESC);
