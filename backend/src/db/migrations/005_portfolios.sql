-- Migration 005: Portfólios / Carteiras de crédito
-- Modelo: Carteira (raiz) > Subcarteiras > Gestores/Subgestores > Clientes > Créditos
-- Cada carteira tem um gestor responsável. Subcarteiras fazem sub-direcção
-- da carteira geral. Clientes, empréstimos e reembolsos carregam carteira_id.

CREATE SEQUENCE IF NOT EXISTS portfolios_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS portfolio_transfers_id_seq START 1;

CREATE TABLE IF NOT EXISTS portfolios (
  id INT NOT NULL DEFAULT nextval('portfolios_id_seq'::regclass) PRIMARY KEY,
  company_id INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_id INT,
  gestor_name TEXT,
  gestor_user_id INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante unicidade do código dentro da empresa (e do nome)
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_company_code
  ON portfolios (company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_company_name
  ON portfolios (company_id, name);

CREATE INDEX IF NOT EXISTS idx_portfolios_company ON portfolios (company_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_parent ON portfolios (parent_id, company_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_gestor ON portfolios (company_id, gestor_user_id) WHERE gestor_user_id IS NOT NULL;

-- Foreign keys (users e portfolios já existem em migrações anteriores)
DO $$ BEGIN
  ALTER TABLE portfolios
    ADD CONSTRAINT fk_portfolios_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE portfolios
    ADD CONSTRAINT fk_portfolios_parent FOREIGN KEY (parent_id) REFERENCES portfolios(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE portfolios
    ADD CONSTRAINT fk_portfolios_gestor FOREIGN KEY (gestor_user_id) REFERENCES users(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Evita ciclo / autocuidado: uma portfólio não pode ser seu próprio pai
CREATE INDEX IF NOT EXISTS idx_portfolios_children ON portfolios (parent_id);

-- Transferências entre carteiras/gestores (movimentação de cliente ou crédito)
CREATE TABLE IF NOT EXISTS portfolio_transfers (
  id INT NOT NULL DEFAULT nextval('portfolio_transfers_id_seq'::regclass) PRIMARY KEY,
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  loan_id INT,
  origin_portfolio_id INT,
  dest_portfolio_id INT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by_user_id INT,
  requested_by_name TEXT,
  approved_by_user_id INT,
  approved_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_transfers_company
  ON portfolio_transfers (company_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_transfers_status
  ON portfolio_transfers (status);
CREATE INDEX IF NOT EXISTS idx_portfolio_transfers_client
  ON portfolio_transfers (client_id, company_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_transfers_origin
  ON portfolio_transfers (origin_portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_transfers_dest
  ON portfolio_transfers (dest_portfolio_id);

DO $$ BEGIN
  ALTER TABLE portfolio_transfers
    ADD CONSTRAINT fk_pt_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE portfolio_transfers
    ADD CONSTRAINT fk_pt_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE portfolio_transfers
    ADD CONSTRAINT fk_pt_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE portfolio_transfers
    ADD CONSTRAINT fk_pt_origin FOREIGN KEY (origin_portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE portfolio_transfers
    ADD CONSTRAINT fk_pt_dest FOREIGN KEY (dest_portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Columna carteira_id nas tabelas centrais (cliente / empréstimo / reembolso)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS carteira_id INT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS carteira_id INT;
ALTER TABLE loan_repayments ADD COLUMN IF NOT EXISTS carteira_id INT;

DO $$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT fk_clients_carteira FOREIGN KEY (carteira_id) REFERENCES portfolios(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE loans ADD CONSTRAINT fk_loans_carteira FOREIGN KEY (carteira_id) REFERENCES portfolios(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE loan_repayments ADD CONSTRAINT fk_loan_repayments_carteira FOREIGN KEY (carteira_id) REFERENCES portfolios(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_carteira ON clients (carteira_id);
CREATE INDEX IF NOT EXISTS idx_loans_carteira ON loans (carteira_id);
CREATE INDEX IF NOT EXISTS idx_loan_repayments_carteira ON loan_repayments (carteira_id);

-- Backfill: associar empréstimos à carteira do seu cliente (quando possível)
UPDATE loans l
SET carteira_id = c.carteira_id
FROM clients c
WHERE l.carteira_id IS NULL
  AND l.client_id = c.id
  AND c.carteira_id IS NOT NULL;

-- Backfill: associar reembolsos à carteira do empréstimo (quando possível)
UPDATE loan_repayments rp
SET carteira_id = l.carteira_id
FROM loans l
WHERE rp.carteira_id IS NULL
  AND rp.loan_id = l.id
  AND l.carteira_id IS NOT NULL;
