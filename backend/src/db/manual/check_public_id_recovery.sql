-- Run this against the production database before or after deploying the
-- bootstrap fix when recovering from a public_id migration crash loop.

-- 1. Check whether the public_id migration is already marked as applied.
SELECT
  EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE name = '011_public_ids.sql'
  ) AS public_id_migration_recorded;

-- 2. Check whether the expected public_id columns actually exist.
SELECT
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'recipients', 'transactions')
  AND column_name = 'public_id'
ORDER BY table_name ASC;

-- 3. Check whether the expected unique indexes exist.
SELECT
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'users_public_id_uidx',
    'recipients_public_id_uidx',
    'transactions_public_id_uidx'
  )
ORDER BY indexname ASC;
