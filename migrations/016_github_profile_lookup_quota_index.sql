CREATE INDEX IF NOT EXISTS idx_github_profile_lookup_quota_window
    ON github_profile_lookup_quota (window_started_at);
