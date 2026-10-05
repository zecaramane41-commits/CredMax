CREATE TABLE IF NOT EXISTS credit_workflow_audit (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  request_id BIGINT NOT NULL,
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  actor_user_id BIGINT,
  actor_name TEXT,
  actor_role TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_workflow_audit_company_request
  ON credit_workflow_audit (company_id, request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_workflow_audit_company_status
  ON credit_workflow_audit (company_id, previous_status, next_status, created_at DESC);
