-- migrate:no-transaction
-- migrate:verify-index=idx_planets_random_key
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_planets_random_key ON planets (random_key);
