-- Migration 012: Branches, Tax Configuration, and Collection Visits

-- 1. Create branches table
CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    branch_type TEXT NOT NULL DEFAULT 'agencia',
    parent_id INT REFERENCES branches(id) ON DELETE SET NULL,
    address TEXT,
    city TEXT,
    province TEXT,
    phone TEXT,
    email TEXT,
    manager_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    manager_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT branches_company_code_key UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_company_id ON branches(company_id);
CREATE INDEX IF NOT EXISTS idx_branches_parent_id ON branches(parent_id);
CREATE INDEX IF NOT EXISTS idx_branches_manager_user_id ON branches(manager_user_id);

-- Add branch_id to existing tables
ALTER TABLE clients ADD COLUMN IF NOT EXISTS branch_id INT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS branch_id INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INT;

DO $$ 
BEGIN
    ALTER TABLE clients ADD CONSTRAINT fk_clients_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE loans ADD CONSTRAINT fk_loans_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE users ADD CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create tax_configurations table
CREATE TABLE IF NOT EXISTS tax_configurations (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tax_code TEXT NOT NULL,
    tax_name TEXT NOT NULL,
    rate NUMERIC(6,4) NOT NULL DEFAULT 0,
    applies_to TEXT NOT NULL DEFAULT 'commissions',
    is_exempt BOOLEAN NOT NULL DEFAULT false,
    exemption_reason TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tax_configurations_unique_code_date UNIQUE (company_id, tax_code, effective_from)
);

-- 3. Create collection_visits table
CREATE TABLE IF NOT EXISTS collection_visits (
    id BIGSERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    loan_id INT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    visit_date DATE NOT NULL,
    visit_type TEXT NOT NULL DEFAULT 'presencial',
    result TEXT NOT NULL DEFAULT 'sem_contacto',
    promised_amount NUMERIC(14,2),
    promised_date DATE,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    notes TEXT,
    visited_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    visited_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_visits_company_id ON collection_visits(company_id);
CREATE INDEX IF NOT EXISTS idx_collection_visits_loan_id ON collection_visits(loan_id);
CREATE INDEX IF NOT EXISTS idx_collection_visits_client_id ON collection_visits(client_id);
CREATE INDEX IF NOT EXISTS idx_collection_visits_visit_date ON collection_visits(visit_date);
