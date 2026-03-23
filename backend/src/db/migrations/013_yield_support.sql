ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_entry_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_entry_type_check
  CHECK (
    entry_type IN (
      'transfer',
      'network_fee',
      'onramp',
      'offramp',
      'swap',
      'yield_deposit',
      'yield_withdraw'
    )
  );
