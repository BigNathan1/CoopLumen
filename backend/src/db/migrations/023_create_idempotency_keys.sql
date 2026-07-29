CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT        PRIMARY KEY,
  endpoint      TEXT        NOT NULL,
  response_body JSONB       NOT NULL,
  status_code   INT         NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE idempotency_keys IS
  'Records the response of a write request keyed by its Idempotency-Key header, so a retried request replays the original response instead of repeating the side effect.';
COMMENT ON COLUMN idempotency_keys.key IS
  'Client-supplied Idempotency-Key header value.';
COMMENT ON COLUMN idempotency_keys.endpoint IS
  'Route the key was scoped to, so the same key cannot be replayed against a different endpoint.';
