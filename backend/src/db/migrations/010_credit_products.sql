-- Migration 010: Produtos de credito parametrizaveis por empresa
CREATE TABLE IF NOT EXISTS credit_products (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  min_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_term_months INT NOT NULL DEFAULT 1,
  max_term_months INT NOT NULL DEFAULT 12,
  interest_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  administrative_fee_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  daily_penalty_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  payment_frequency TEXT NOT NULL DEFAULT 'mensal',
  amortization_method TEXT NOT NULL DEFAULT 'price',
  requires_guarantee BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_credit_products_company_code UNIQUE (company_id, code),
  CONSTRAINT chk_credit_products_amounts CHECK (min_amount >= 0 AND max_amount >= min_amount),
  CONSTRAINT chk_credit_products_terms CHECK (min_term_months > 0 AND max_term_months >= min_term_months),
  CONSTRAINT chk_credit_products_rates CHECK (
    interest_rate >= 0 AND administrative_fee_rate >= 0 AND daily_penalty_rate >= 0
  ),
  CONSTRAINT chk_credit_products_frequency CHECK (
    payment_frequency IN ('diario', 'semanal', 'quinzenal', 'mensal')
  ),
  CONSTRAINT chk_credit_products_amortization CHECK (
    amortization_method IN ('price', 'sac', 'americano')
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_products_company_active
  ON credit_products(company_id, is_active);

INSERT INTO credit_products (
  company_id, code, name, description, min_amount, max_amount,
  min_term_months, max_term_months, interest_rate,
  administrative_fee_rate, daily_penalty_rate, payment_frequency,
  amortization_method, requires_guarantee, is_active
)
SELECT
  c.id,
  p.code,
  p.name,
  p.description,
  p.min_amount,
  p.max_amount,
  p.min_term_months,
  p.max_term_months,
  p.interest_rate,
  p.administrative_fee_rate,
  p.daily_penalty_rate,
  p.payment_frequency,
  p.amortization_method,
  p.requires_guarantee,
  true
FROM companies c
CROSS JOIN (
  VALUES
    ('CRED-NORMAL', 'Credito Normal', 'Produto padrao de credito.', 1000.00, 100000.00, 1, 24, 30.00, 2.00, 0.10, 'mensal', 'price', false),
    ('CRED-REEMPRESTIMO', 'Reemprestimo', 'Produto para clientes elegiveis a novo credito.', 1000.00, 150000.00, 1, 24, 28.00, 2.00, 0.10, 'mensal', 'price', true)
) AS p(
  code, name, description, min_amount, max_amount, min_term_months,
  max_term_months, interest_rate, administrative_fee_rate, daily_penalty_rate,
  payment_frequency, amortization_method, requires_guarantee
)
WHERE NOT EXISTS (
  SELECT 1
  FROM credit_products cp
  WHERE cp.company_id = c.id AND cp.code = p.code
);
