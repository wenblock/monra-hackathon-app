CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_id UUID;

UPDATE users
SET public_id = gen_random_uuid()
WHERE public_id IS NULL;

ALTER TABLE users
  ALTER COLUMN public_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_uidx
  ON users (public_id);

ALTER TABLE recipients
  ADD COLUMN IF NOT EXISTS public_id UUID;

UPDATE recipients
SET public_id = gen_random_uuid()
WHERE public_id IS NULL;

ALTER TABLE recipients
  ALTER COLUMN public_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recipients_public_id_uidx
  ON recipients (public_id);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS public_id UUID;

UPDATE transactions
SET public_id = gen_random_uuid()
WHERE public_id IS NULL;

ALTER TABLE transactions
  ALTER COLUMN public_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_public_id_uidx
  ON transactions (public_id);
