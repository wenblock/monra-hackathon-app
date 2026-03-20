ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS output_asset TEXT NULL,
  ADD COLUMN IF NOT EXISTS output_amount_decimal NUMERIC(36, 9) NULL,
  ADD COLUMN IF NOT EXISTS output_amount_raw TEXT NULL;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_entry_type_check;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_output_asset_check;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_swap_output_fields_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_entry_type_check
  CHECK (entry_type IN ('transfer', 'network_fee', 'onramp', 'offramp', 'swap'));

ALTER TABLE transactions
  ADD CONSTRAINT transactions_output_asset_check
  CHECK (output_asset IS NULL OR output_asset IN ('sol', 'usdc', 'eurc'));

ALTER TABLE transactions
  ADD CONSTRAINT transactions_swap_output_fields_check
  CHECK (
    (entry_type = 'swap' AND output_asset IS NOT NULL AND output_amount_decimal IS NOT NULL AND output_amount_raw IS NOT NULL)
    OR
    (entry_type <> 'swap' AND output_asset IS NULL AND output_amount_decimal IS NULL AND output_amount_raw IS NULL)
  );
