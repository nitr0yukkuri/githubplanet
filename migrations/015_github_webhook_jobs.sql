CREATE TABLE IF NOT EXISTS github_webhook_jobs (
    id BIGSERIAL PRIMARY KEY,
    delivery_id UUID NOT NULL REFERENCES github_webhook_deliveries(delivery_id) ON DELETE CASCADE,
    commit_index INTEGER NOT NULL,
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error_code TEXT,
    UNIQUE (delivery_id, commit_index)
);

CREATE INDEX IF NOT EXISTS idx_github_webhook_jobs_pending
    ON github_webhook_jobs (available_at, id) WHERE completed_at IS NULL;
