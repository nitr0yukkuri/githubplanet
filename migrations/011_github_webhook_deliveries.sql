CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
    delivery_id UUID PRIMARY KEY,
    payload_sha256 TEXT NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_webhook_deliveries_received_at
    ON github_webhook_deliveries (received_at);
