CREATE TABLE IF NOT EXISTS financial_calendar_days (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_date DATE NOT NULL,
  description VARCHAR(180) NOT NULL,
  day_type VARCHAR(20) NOT NULL DEFAULT 'feriado',
  is_working_day BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, calendar_date),
  CHECK (day_type IN ('feriado', 'nao_util', 'dia_util'))
);

CREATE INDEX IF NOT EXISTS idx_financial_calendar_company_date
  ON financial_calendar_days (company_id, calendar_date);
