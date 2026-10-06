-- Migration 014: Portal público do cliente (Fase 2.2)
-- Contas de acesso público do cliente com ligação a um cliente da empresa.
-- O registo no portal auto-liga (ou cria) o respetivo registo em `clients`.

CREATE TABLE IF NOT EXISTS portal_accounts (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    document_number TEXT,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_accounts_company_email
    ON portal_accounts (company_id, LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_accounts_company_client
    ON portal_accounts (company_id, client_id);

CREATE INDEX IF NOT EXISTS idx_portal_accounts_client
    ON portal_accounts (client_id);
