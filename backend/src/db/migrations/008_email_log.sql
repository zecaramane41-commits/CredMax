-- Fase 4: log de envio de e-mails
CREATE TABLE IF NOT EXISTS client_email_log (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id INT REFERENCES clients(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  message_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_response TEXT,
  reference_type TEXT,
  reference_id BIGINT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_email_log_company
  ON client_email_log (company_id, created_at DESC);