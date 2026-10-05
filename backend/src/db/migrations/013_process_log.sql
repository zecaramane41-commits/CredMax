-- Migration 013: Process log (trilha de processo do ciclo de crédito)
-- Registo append-only de cada mudança de estado de uma entidade do processo
-- (pedido, crédito, desembolso, desconto consignado).

CREATE TABLE IF NOT EXISTS process_log (
    id BIGSERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    client_id INT REFERENCES clients(id) ON DELETE SET NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    reason TEXT,
    note TEXT,
    document_ids BIGINT[] NOT NULL DEFAULT '{}',
    actor_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_process_log_entity ON process_log(company_id, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_process_log_client ON process_log(company_id, client_id, created_at);
