ALTER TABLE user_balances
  ADD COLUMN IF NOT EXISTS eurc_raw TEXT NOT NULL DEFAULT '0';

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_asset_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_asset_check
  CHECK (asset IN ('sol', 'usdc', 'eurc'));
