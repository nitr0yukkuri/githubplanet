CREATE TABLE IF NOT EXISTS planet_public_contribution_histories (
    github_id BIGINT PRIMARY KEY REFERENCES planets(github_id) ON DELETE CASCADE,
    github_login TEXT NOT NULL,
    calendar_started_at TIMESTAMPTZ NOT NULL,
    calendar_years JSONB NOT NULL CHECK (jsonb_typeof(calendar_years) = 'array'),
    daily_contributions JSONB NOT NULL CHECK (jsonb_typeof(daily_contributions) = 'array'),
    captured_at TIMESTAMPTZ NOT NULL,
    CHECK (calendar_started_at <= captured_at)
);
