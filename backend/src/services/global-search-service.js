import { query } from "../config/db.js";

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function mapResult(row) {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title,
    subtitle: row.subtitle || "",
    status: row.status || null,
    href: row.type === "client"
      ? `/clients/${row.id}/360`
      : row.type === "loan"
        ? `/credits/${row.id}/360`
        : row.type === "request"
          ? `/loans/approvals/${row.id}`
          : row.type === "payment"
            ? `/payments?repaymentId=${row.id}`
            : null,
  };
}

/**
 * Pesquisa operacional transversal, sempre limitada à empresa activa.
 * Não substitui os filtros das páginas de domínio; serve como ponto de entrada rápido.
 */
export async function globalSearch(companyId, rawTerm, rawLimit = 12) {
  const term = normalize(rawTerm);
  const limit = Math.min(Math.max(Number(rawLimit) || 12, 1), 25);
  if (term.length < 2) return { query: term, results: [] };

  const pattern = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
  const result = await query(
    `WITH results AS (
      SELECT c.id, 'client'::text AS type, c.name AS title,
             concat_ws(' · ', c.nuit, c.phone, c.document_number) AS subtitle,
             c.status, 1 AS rank
      FROM clients c
      WHERE c.company_id = $1
        AND (c.name ILIKE $2 ESCAPE '\\'
          OR c.nuit ILIKE $2 ESCAPE '\\'
          OR c.phone ILIKE $2 ESCAPE '\\'
          OR COALESCE(c.phone_alt, '') ILIKE $2 ESCAPE '\\'
          OR COALESCE(c.document_number, '') ILIKE $2 ESCAPE '\\')
      UNION ALL
      SELECT l.id, 'loan'::text, l.contract_no,
             concat_ws(' · ', c.name, l.product, l.status) AS subtitle,
             l.status, 2 AS rank
      FROM loans l
      JOIN clients c ON c.id = l.client_id AND c.company_id = l.company_id
      WHERE l.company_id = $1
        AND (l.contract_no ILIKE $2 ESCAPE '\\'
          OR c.name ILIKE $2 ESCAPE '\\'
          OR c.nuit ILIKE $2 ESCAPE '\\')
      UNION ALL
      SELECT r.id, 'request'::text,
             concat('Pedido #', r.id),
             concat_ws(' · ', c.name, r.requested_amount::text, r.status) AS subtitle,
             r.status, 3 AS rank
      FROM loan_approval_requests r
      JOIN clients c ON c.id = r.client_id AND c.company_id = r.company_id
      WHERE r.company_id = $1
        AND (c.name ILIKE $2 ESCAPE '\\'
          OR c.nuit ILIKE $2 ESCAPE '\\'
          OR r.id::text ILIKE $2 ESCAPE '\\')
      UNION ALL
      SELECT p.id, 'payment'::text,
             COALESCE(p.receipt_no, concat('Pagamento #', p.id)),
             concat_ws(' · ', c.name, p.payment_date::text, p.amount_received::text) AS subtitle,
             NULL::text AS status, 4 AS rank
      FROM loan_repayments p
      JOIN clients c ON c.id = p.client_id AND c.company_id = p.company_id
      WHERE p.company_id = $1
        AND (COALESCE(p.receipt_no, '') ILIKE $2 ESCAPE '\\'
          OR c.name ILIKE $2 ESCAPE '\\'
          OR c.nuit ILIKE $2 ESCAPE '\\'
          OR p.id::text ILIKE $2 ESCAPE '\\')
    )
    SELECT id, type, title, subtitle, status
    FROM results
    ORDER BY rank, title ASC, id DESC
    LIMIT $3`,
    [companyId, pattern, limit],
  );

  return { query: term, results: result.rows.map(mapResult) };
}
