UPDATE transactions AS transactions
SET counterparty_name = recipients.display_name
FROM recipients AS recipients
WHERE transactions.recipient_id = recipients.id
  AND transactions.direction = 'outbound'
  AND transactions.entry_type = 'transfer'
  AND transactions.counterparty_name IS NULL;
