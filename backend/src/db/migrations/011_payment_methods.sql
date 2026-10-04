CREATE TABLE IF NOT EXISTS company_payment_methods (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('banco', 'carteira_movel', 'caixa')),
  name TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  nib_iban TEXT,
  account_holder TEXT,
  branch TEXT,
  provider TEXT,
  phone_number TEXT,
  agent_code TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpm_company_active ON company_payment_methods(company_id, is_active);
