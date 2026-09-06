-- migrate:no-transaction
-- migrate:verify-index=idx_planets_username_lower
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_planets_username_lower ON planets (LOWER(username));
