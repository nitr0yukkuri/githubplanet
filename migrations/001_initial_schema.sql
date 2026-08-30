CREATE TABLE IF NOT EXISTS planets (
    github_id BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    planet_color TEXT,
    planet_size_factor REAL,
    main_language TEXT,
    language_stats JSONB,
    total_commits INTEGER,
    last_updated TIMESTAMP DEFAULT NOW(),
    planet_name TEXT,
    achievements JSONB DEFAULT '{}'::jsonb,
    weekly_commits INTEGER DEFAULT 0,
    last_login_contributions BIGINT,
    last_login_at TIMESTAMP,
    notified_achievement_ids JSONB,
    unlocked_titles JSONB DEFAULT '{"prefixes": ["名もなき"], "suffixes": ["旅人"]}'::jsonb,
    active_title JSONB DEFAULT '{"prefix": "名もなき", "suffix": "旅人"}'::jsonb,
    random_key DOUBLE PRECISION NOT NULL DEFAULT random()
);

CREATE TABLE IF NOT EXISTS "session" (
    sid VARCHAR PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

CREATE TABLE IF NOT EXISTS language_color_cache (
    language TEXT PRIMARY KEY,
    color TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE planets ADD COLUMN IF NOT EXISTS planet_name TEXT;
ALTER TABLE planets ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '{}'::jsonb;
ALTER TABLE planets ADD COLUMN IF NOT EXISTS weekly_commits INTEGER DEFAULT 0;
ALTER TABLE planets
    ADD COLUMN IF NOT EXISTS last_login_contributions BIGINT,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS notified_achievement_ids JSONB;
ALTER TABLE planets
    ADD COLUMN IF NOT EXISTS unlocked_titles JSONB DEFAULT '{"prefixes": ["名もなき"], "suffixes": ["旅人"]}'::jsonb,
    ADD COLUMN IF NOT EXISTS active_title JSONB DEFAULT '{"prefix": "名もなき", "suffix": "旅人"}'::jsonb;
ALTER TABLE planets ADD COLUMN IF NOT EXISTS random_key DOUBLE PRECISION;
ALTER TABLE planets ALTER COLUMN random_key SET DEFAULT random();
UPDATE planets SET random_key = random() WHERE random_key IS NULL;
ALTER TABLE planets ALTER COLUMN random_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" (expire);
CREATE INDEX IF NOT EXISTS idx_planets_username ON planets (username);
