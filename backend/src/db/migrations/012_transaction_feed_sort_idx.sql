CREATE INDEX IF NOT EXISTS transactions_user_id_feed_sort_idx
  ON transactions (user_id, (COALESCE(confirmed_at, created_at)) DESC, id DESC);
