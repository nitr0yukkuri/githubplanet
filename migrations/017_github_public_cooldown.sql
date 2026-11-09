ALTER TABLE github_profile_lookup_quota ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;
