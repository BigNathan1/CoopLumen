CREATE TABLE IF NOT EXISTS audit_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_address    TEXT,
  ip_address       TEXT,
  action           TEXT        NOT NULL,
  resource_type    TEXT        NOT NULL,
  resource_id      TEXT,
  before_state     JSONB,
  after_state      JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor        ON audit_log(actor_address);
CREATE INDEX IF NOT EXISTS idx_audit_resource     ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created      ON audit_log(created_at DESC);
