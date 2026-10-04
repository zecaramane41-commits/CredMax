-- Notificações in-app, SMS a clientes e configurações por empresa

CREATE TABLE IF NOT EXISTS notification_settings (
  company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sms_provider TEXT NOT NULL DEFAULT 'console',
  sms_api_key TEXT,
  sms_sender_id TEXT DEFAULT 'SiGeM',
  due_reminder_days INT NOT NULL DEFAULT 3,
  notify_payment_sms BOOLEAN NOT NULL DEFAULT TRUE,
  notify_due_reminder_sms BOOLEAN NOT NULL DEFAULT TRUE,
  notify_caixa_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_notifications (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type TEXT,
  reference_id BIGINT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_notifications_company_unread
  ON system_notifications (company_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_notifications_user
  ON system_notifications (user_id, is_read, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_sms_log (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id INT REFERENCES clients(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message_type TEXT NOT NULL,
  message_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_response TEXT,
  reference_type TEXT,
  reference_id BIGINT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_sms_log_company_client
  ON client_sms_log (company_id, client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS installment_reminder_log (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  installment_id INT NOT NULL REFERENCES loan_installments(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  days_before_due INT NOT NULL DEFAULT 3,
  sms_log_id BIGINT REFERENCES client_sms_log(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (installment_id, reminder_date, days_before_due)
);
