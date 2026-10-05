import { query } from "../config/db.js";

const DEFAULT_GROUP_LIMIT = 8;
const MAX_GROUP_LIMIT = 20;

/**
 * Pesquisa global do CredMax (ver docs/CREDMAX_ARQUITETURA.md, secção 22).
 * Devolve grupos tipados (cliente, crédito, pedido, contrato, pagamento)
 * sempre isolados por empresa (company_id).
 */
export async function globalSearch({ companyId, term, limit = DEFAULT_GROUP_LIMIT }, db = { query }) {
  const q = String(term || "").trim();
  if (q.length < 2) return { clients: [], loans: [], requests: [], contracts: [], repayments: [] };
  const groupLimit = Math.min(MAX_GROUP_LIMIT, Math.max(1, Number(limit) || DEFAULT_GROUP_LIMIT));
  const like = `%${q}%`;
  const exact = q;

  const clients = await db.query(
    `
    SELECT id, name, document_number, nuit, phone, phone_alt, status, score
    FROM clients
    WHERE company_id = $1
      AND (
        name ILIKE $2 OR document_number ILIKE $2 OR nuit ILIKE $2
        OR phone ILIKE $2 OR phone_alt ILIKE $2 OR email ILIKE $2
        OR CAST(id AS TEXT) = $3
      )
    ORDER BY
      CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,
      updated_at DESC NULLS LAST, id DESC
    LIMIT $4
    `,
    [companyId, like, exact, groupLimit],
  );

  const loans = await db.query(
    `
    SELECT l.id, l.contract_no, l.client_id, c.name AS client_name,
           l.product, l.principal, l.balance, l.status
    FROM loans l
    JOIN clients c ON c.id = l.client_id
    WHERE l.company_id = $1
      AND (
        l.contract_no ILIKE $2 OR c.name ILIKE $2
        OR CAST(l.id AS TEXT) = $3 OR CAST(l.client_id AS TEXT) = $3
      )
    ORDER BY l.id DESC
    LIMIT $4
    `,
    [companyId, like, exact, groupLimit],
  );

  const requests = await db.query(
    `
    SELECT r.id, r.client_id, c.name AS client_name,
           r.requested_amount, r.status, r.created_at
    FROM loan_approval_requests r
    JOIN clients c ON c.id = r.client_id
    WHERE r.company_id = $1
      AND (
        c.name ILIKE $2 OR CAST(r.id AS TEXT) = $3
        OR CAST(r.client_id AS TEXT) = $3
      )
    ORDER BY r.id DESC
    LIMIT $4
    `,
    [companyId, like, exact, groupLimit],
  );

  const contracts = await db.query(
    `
    SELECT d.id, d.doc_no, d.doc_type, d.loan_id, l.contract_no, c.name AS client_name
    FROM loan_documents d
    JOIN loans l ON l.id = d.loan_id
    JOIN clients c ON c.id = l.client_id
    WHERE d.company_id = $1
      AND (d.doc_no ILIKE $2 OR CAST(d.loan_id AS TEXT) = $3 OR l.contract_no ILIKE $2)
    ORDER BY d.id DESC
    LIMIT $4
    `,
    [companyId, like, exact, groupLimit],
  );

  const repayments = await db.query(
    `
    SELECT p.id, p.receipt_no, p.loan_id, p.client_id, c.name AS client_name,
           p.amount_received, p.payment_date
    FROM loan_repayments p
    JOIN clients c ON c.id = p.client_id
    WHERE p.company_id = $1
      AND (
        p.receipt_no ILIKE $2 OR CAST(p.id AS TEXT) = $3
        OR CAST(p.loan_id AS TEXT) = $3 OR c.name ILIKE $2
      )
    ORDER BY p.id DESC
    LIMIT $4
    `,
    [companyId, like, exact, groupLimit],
  );

  return {
    clients: clients.rows.map((r) => ({
      kind: "CLIENTE",
      id: r.id,
      title: r.name,
      subtitle: [r.document_number, r.nuit, r.phone].filter(Boolean).join(" · "),
      status: r.status,
      meta: { score: r.score, phoneAlt: r.phone_alt },
    })),
    loans: loans.rows.map((r) => ({
      kind: "CREDITO",
      id: r.id,
      title: r.contract_no,
      subtitle: r.client_name,
      status: r.status,
      meta: { clientId: r.client_id, product: r.product, principal: r.principal, balance: r.balance },
    })),
    requests: requests.rows.map((r) => ({
      kind: "PEDIDO",
      id: r.id,
      title: `REQ-${r.id}`,
      subtitle: r.client_name,
      status: r.status,
      meta: { clientId: r.client_id, requestedAmount: r.requested_amount, createdAt: r.created_at },
    })),
    contracts: contracts.rows.map((r) => ({
      kind: "CONTRATO",
      id: r.id,
      title: r.doc_no,
      subtitle: `${r.client_name} · ${r.contract_no}`,
      status: r.doc_type,
      meta: { loanId: r.loan_id, contractNo: r.contract_no },
    })),
    repayments: repayments.rows.map((r) => ({
      kind: "PAGAMENTO",
      id: r.id,
      title: r.receipt_no || `PAY-${r.id}`,
      subtitle: r.client_name,
      status: null,
      meta: { loanId: r.loan_id, clientId: r.client_id, amount: r.amount_received, paidOn: r.payment_date },
    })),
  };
}
