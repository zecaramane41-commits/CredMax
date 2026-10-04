-- Migration 003: Company subscription payments for microcredit admin
-- Controls company access based on payment status

CREATE SEQUENCE IF NOT EXISTS company_payments_id_seq START 1;

CREATE TABLE IF NOT EXISTS company_payments (
  id INT NOT NULL DEFAULT nextval('company_payments_id_seq'::regclass),
  company_id INT NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'monthly',
  amount NUMERIC(14,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  days_purchased INT NOT NULL DEFAULT 30,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference_no TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  receipt_no TEXT,
  receipt_issued_at TIMESTAMPTZ,
  receipt_issued_by_user_id INT,
  receipt_issued_by_name TEXT,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE company_payments ADD CONSTRAINT pk_company_payments PRIMARY KEY (id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE company_payments ADD CONSTRAINT fk_company_payments_company
    FOREIGN KEY (company_id) REFERENCES companies(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_payments_company_id ON company_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_company_payments_status ON company_payments(status);
CREATE INDEX IF NOT EXISTS idx_company_payments_valid_until ON company_payments(valid_until);
CREATE INDEX IF NOT EXISTS idx_company_payments_receipt_no ON company_payments(receipt_no);

-- Add subscription-related columns to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_grace_days INT NOT NULL DEFAULT 5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS total_paid NUMERIC(14,2) NOT NULL DEFAULT 0;