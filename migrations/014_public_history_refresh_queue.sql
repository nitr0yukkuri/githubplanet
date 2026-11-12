CREATE TABLE IF NOT EXISTS planet_public_history_refresh_jobs (
    github_id BIGINT PRIMARY KEY REFERENCES planets(github_id) ON DELETE CASCADE,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_until TIMESTAMPTZ,
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    last_failure_code TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_history_refresh_due
    ON planet_public_history_refresh_jobs (next_attempt_at, github_id)
    INCLUDE (lease_until);

INSERT INTO planet_public_history_refresh_jobs (github_id, next_attempt_at)
SELECT planet.github_id, COALESCE(history.captured_at + INTERVAL '30 days', NOW())
FROM planets AS planet
LEFT JOIN planet_public_contribution_histories AS history USING (github_id)
ON CONFLICT (github_id) DO NOTHING;

CREATE OR REPLACE FUNCTION enqueue_planet_public_history_refresh()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO planet_public_history_refresh_jobs (github_id)
    VALUES (NEW.github_id)
    ON CONFLICT (github_id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER planets_enqueue_public_history_refresh
AFTER INSERT ON planets
FOR EACH ROW
EXECUTE FUNCTION enqueue_planet_public_history_refresh();
