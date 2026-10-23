CREATE TABLE IF NOT EXISTS meteor_events (
    id BIGSERIAL PRIMARY KEY,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
