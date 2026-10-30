CREATE TABLE IF NOT EXISTS github_profile_lookup_quota (
    quota_key TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL CHECK (request_count >= 0)
);
