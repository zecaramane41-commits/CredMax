-- Migration 004: Admin platform modules tables
-- Support, Notifications, Monitoring, Security, Settings for central admin

-- ─── Support Tickets ──────────────────────────────────────────────────────────
-- Drop and recreate to ensure proper schema (handles partial previous runs)
DROP TABLE IF EXISTS support_ticket_messages CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP SEQUENCE IF EXISTS support_tickets_id_seq;
DROP SEQUENCE IF EXISTS support_ticket_messages_id_seq;

CREATE SEQUENCE support_tickets_id_seq START 1;

CREATE TABLE support_tickets (
  id INT NOT NULL DEFAULT nextval('support_tickets_id_seq'::regclass) PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to_user_id INT REFERENCES users(id),
  created_by_user_id INT,
  created_by_name TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id INT,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_company ON support_tickets(company_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);

CREATE SEQUENCE support_ticket_messages_id_seq START 1;

CREATE TABLE support_ticket_messages (
  id INT NOT NULL DEFAULT nextval('support_ticket_messages_id_seq'::regclass) PRIMARY KEY,
  ticket_id INT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id INT,
  user_name TEXT NOT NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id);

-- ─── Platform Notifications ───────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS platform_notifications_id_seq START 1;

CREATE TABLE IF NOT EXISTS platform_notifications (
  id INT NOT NULL DEFAULT nextval('platform_notifications_id_seq'::regclass),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'info',
  target_companies TEXT NOT NULL DEFAULT 'all',
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_notifications_type ON platform_notifications(notification_type);

-- ─── Platform Settings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by_user_id INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default settings
INSERT INTO platform_settings (key, value, description) VALUES
  ('plan_monthly_price', '5000', 'Preco do plano mensal (MT)'),
  ('plan_quarterly_price', '13500', 'Preco do plano trimestral (MT)'),
  ('plan_annual_price', '48000', 'Preco do plano anual (MT)'),
  ('plan_grace_days', '5', 'Dias de carencia apos vencimento'),
  ('smtp_host', '', 'Servidor SMTP'),
  ('smtp_port', '587', 'Porta SMTP'),
  ('smtp_user', '', 'Usuario SMTP'),
  ('smtp_pass', '', 'Senha SMTP'),
  ('smtp_from', 'noreply@example.com', 'Email remetente'),
  ('sms_provider', 'console', 'Provedor SMS (console/twilio)'),
  ('sms_api_key', '', 'Chave API do provedor SMS'),
  ('sms_sender_id', 'SiGeM', 'ID do remetente SMS'),
  ('platform_name', 'SiGeM', 'Nome da plataforma'),
  ('platform_logo_url', '', 'URL do logotipo'),
  ('maintenance_mode', 'false', 'Modo de manutencao'),
  ('maintenance_message', '', 'Mensagem de manutencao')
ON CONFLICT (key) DO NOTHING;