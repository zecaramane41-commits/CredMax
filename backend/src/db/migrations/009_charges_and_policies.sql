-- Migration 009: Encargos e Parametros de Credito da Empresa
CREATE TABLE IF NOT EXISTS company_charges (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fixed', -- 'fixed' or 'percentage'
  default_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_charges_company ON company_charges(company_id);

ALTER TABLE loan_approval_policies ADD COLUMN IF NOT EXISTS default_administrative_fee_rate NUMERIC(5,2) NOT NULL DEFAULT 2.00;
ALTER TABLE loan_approval_policies ADD COLUMN IF NOT EXISTS default_interest_rate NUMERIC(5,2) NOT NULL DEFAULT 30.00;
ALTER TABLE loan_approval_policies ADD COLUMN IF NOT EXISTS max_loan_term_months INT NOT NULL DEFAULT 24;

-- Encargos padrao para empresas existentes
INSERT INTO company_charges (company_id, name, type, default_value, is_required, is_active)
SELECT c.id, e.name, e.type, e.default_value, e.is_required, true
FROM companies c
CROSS JOIN (
  VALUES 
    ('Taxa de Abertura e Processamento', 'fixed', 500.00, false),
    ('Comissão de Vistoria e Avaliação', 'fixed', 300.00, false),
    ('Seguro Prestamista de Crédito', 'percentage', 1.00, false),
    ('Encargo Notarial e Registo', 'fixed', 250.00, false)
) AS e(name, type, default_value, is_required)
WHERE NOT EXISTS (SELECT 1 FROM company_charges cc WHERE cc.company_id = c.id);
