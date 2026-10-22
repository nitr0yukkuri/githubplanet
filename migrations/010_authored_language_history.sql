CREATE TABLE IF NOT EXISTS authored_language_commits (
    github_id BIGINT NOT NULL REFERENCES planets(github_id) ON DELETE CASCADE,
    repository_full_name TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    authored_at TIMESTAMPTZ NOT NULL,
    language_added_lines JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_added_lines INTEGER NOT NULL DEFAULT 0,
    unclassified_added_lines INTEGER NOT NULL DEFAULT 0,
    files_complete BOOLEAN NOT NULL DEFAULT TRUE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (github_id, repository_full_name, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_authored_language_commits_github_authored
    ON authored_language_commits (github_id, authored_at ASC);

CREATE TABLE IF NOT EXISTS authored_language_history_scans (
    github_id BIGINT PRIMARY KEY REFERENCES planets(github_id) ON DELETE CASCADE,
    scan_status TEXT NOT NULL DEFAULT 'idle'
        CHECK (scan_status IN ('idle', 'running', 'complete', 'partial', 'failed')),
    scan_started_at TIMESTAMPTZ,
    scan_completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retry_after TIMESTAMPTZ,
    last_error TEXT,
    repositories_scanned INTEGER NOT NULL DEFAULT 0,
    private_repositories_skipped INTEGER NOT NULL DEFAULT 0,
    commits_found INTEGER NOT NULL DEFAULT 0,
    commits_scanned INTEGER NOT NULL DEFAULT 0,
    unavailable_commits INTEGER NOT NULL DEFAULT 0,
    incomplete_file_commits INTEGER NOT NULL DEFAULT 0,
    unclassified_added_lines BIGINT NOT NULL DEFAULT 0,
    repository_cap_reached BOOLEAN NOT NULL DEFAULT FALSE,
    api_requests INTEGER NOT NULL DEFAULT 0,
    request_budget_reached BOOLEAN NOT NULL DEFAULT FALSE,
    scan_cursor JSONB NOT NULL DEFAULT '{}'::jsonb
);

