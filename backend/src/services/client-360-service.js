import { query } from "../config/db.js";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapRows(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (typeof value === "bigint") return [key, Number(value)];
      return [key, value];
    }),
  ));
}

/**
 * Agregador do Cliente 360.
 * Mantém as tabelas de domínio existentes como fonte de verdade e aplica
 * company_id em todas as consultas para isolamento entre empresas.
 */
export async function getClient360(companyId, clientId) {
  const clientResult = await query(
    `SELECT c.*, p.code AS carteira_code, p.name AS carteira_name, p.gestor_name AS carteira_gestor_name
     FROM clients c
     LEFT JOIN portfolios p ON p.id = c.carteira_id AND p.company_id = c.company_id
     WHERE c.id = $1 AND c.company_id = $2 LIMIT 1`,
    [clientId, companyId],
  );
  if (!clientResult.rows[0]) return null;

  const [
    documents,
    evaluations,
    guarantors,
    collaterals,
    loans,
    repayments,
    installments,
    approvalRequests,
    promises,
    renegotiations,
    transfers,
    financialEvents,
    contractAudits,
  ] = await Promise.all([
    query(`SELECT * FROM client_documents WHERE client_id = $1 AND company_id = $2 ORDER BY uploaded_at DESC, id DESC`, [clientId, companyId]),
    query(`SELECT e.*, u.full_name AS analyst_name FROM client_evaluations e LEFT JOIN users u ON u.id = e.analyst_user_id WHERE e.client_id = $1 AND e.company_id = $2 ORDER BY e.created_at DESC, e.id DESC`, [clientId, companyId]),
    query(`SELECT * FROM guarantors WHERE client_id = $1 AND company_id = $2 ORDER BY created_at DESC, id DESC`, [clientId, companyId]),
    query(`SELECT * FROM collaterals WHERE client_id = $1 AND company_id = $2 ORDER BY created_at DESC, id DESC`, [clientId, companyId]),
    query(`SELECT l.*, u.full_name AS manager_name, p.code AS carteira_code, p.name AS carteira_name
            FROM loans l
            LEFT JOIN users u ON u.id = l.manager_user_id
            LEFT JOIN portfolios p ON p.id = l.carteira_id AND p.company_id = l.company_id
            WHERE l.client_id = $1 AND l.company_id = $2 ORDER BY l.created_at DESC, l.id DESC`, [clientId, companyId]),
    query(`SELECT r.*, l.contract_no FROM loan_repayments r LEFT JOIN loans l ON l.id = r.loan_id AND l.company_id = r.company_id
            WHERE r.client_id = $1 AND r.company_id = $2 ORDER BY r.payment_date DESC, r.id DESC`, [clientId, companyId]),
    query(`SELECT li.*, l.contract_no FROM loan_installments li JOIN loans l ON l.id = li.loan_id
            WHERE l.client_id = $1 AND l.company_id = $2 ORDER BY li.due_date ASC, li.installment_no ASC`, [clientId, companyId]),
    query(`SELECT r.*, u.full_name AS created_by_full_name FROM loan_approval_requests r
            LEFT JOIN users u ON u.id = r.created_by_user_id
            WHERE r.client_id = $1 AND r.company_id = $2 ORDER BY r.created_at DESC, r.id DESC`, [clientId, companyId]),
    query(`SELECT p.*, l.contract_no FROM loan_payment_promises p LEFT JOIN loans l ON l.id = p.loan_id AND l.company_id = p.company_id
            WHERE p.loan_id IN (SELECT id FROM loans WHERE client_id = $1 AND company_id = $2)
            AND p.company_id = $2 ORDER BY p.promised_for DESC, p.id DESC`, [clientId, companyId]),
    query(`SELECT r.*, l.contract_no FROM loan_renegotiations r JOIN loans l ON l.id = r.loan_id
            WHERE l.client_id = $1 AND l.company_id = $2 ORDER BY r.created_at DESC, r.id DESC`, [clientId, companyId]),
    query(`SELECT t.*, op.code AS origin_code, op.name AS origin_name, dp.code AS dest_code, dp.name AS dest_name
            FROM portfolio_transfers t
            LEFT JOIN portfolios op ON op.id = t.origin_portfolio_id AND op.company_id = t.company_id
            LEFT JOIN portfolios dp ON dp.id = t.dest_portfolio_id AND dp.company_id = t.company_id
            WHERE t.client_id = $1 AND t.company_id = $2 ORDER BY t.created_at DESC, t.id DESC`, [clientId, companyId]),
    query(`SELECT e.*, l.contract_no FROM loan_financial_events e JOIN loans l ON l.id = e.loan_id
            WHERE l.client_id = $1 AND l.company_id = $2 ORDER BY e.created_at DESC, e.id DESC`, [clientId, companyId]),
    query(`SELECT a.*, l.contract_no FROM loan_contract_audit a LEFT JOIN loans l ON l.id = a.loan_id AND l.company_id = a.company_id
            WHERE (l.client_id = $1 OR a.loan_id IN (SELECT id FROM loans WHERE client_id = $1 AND company_id = $2))
            AND a.company_id = $2 ORDER BY a.changed_at DESC, a.id DESC`, [clientId, companyId]),
  ]);

  const c = clientResult.rows[0];
  const loanRows = loans.rows;
  const repaymentRows = repayments.rows;
  const installmentRows = installments.rows;

  const activeStatuses = new Set(["active", "ativo", "open"]);
  const activeLoans = loanRows.filter((l) => activeStatuses.has(String(l.status).toLowerCase()));
  const overdue = installmentRows.filter((i) => ["late", "overdue", "atrasado"].includes(String(i.status).toLowerCase()));
  const totalDebt = loanRows.reduce((s, l) => s + num(l.balance), 0);
  const totalDisbursed = loanRows.reduce((s, l) => s + num(l.principal), 0);
  const totalPaid = repaymentRows.reduce((s, r) => s + num(r.amount_applied || r.amount_received), 0);

  return {
    client: {
      id: c.id, name: c.name, type: c.client_type, nuit: c.nuit, phone: c.phone,
      phoneAlt: c.phone_alt, email: c.email, documentType: c.document_type,
      documentNumber: c.document_number, birthDate: c.birth_date, gender: c.gender,
      maritalStatus: c.marital_status, nationality: c.nationality, province: c.province,
      city: c.city, district: c.district, neighborhood: c.neighborhood,
      addressLine: c.address_line, houseNumber: c.house_number, occupation: c.occupation,
      employerName: c.employer_name, monthlyIncome: num(c.monthly_income),
      monthlyExpenses: num(c.monthly_expenses), businessName: c.business_name,
      businessSector: c.business_sector, registrationDate: c.registration_date,
      notes: c.notes, groupName: c.group_name, groupDescription: c.group_description,
      groupLeaderName: c.group_leader_name, score: num(c.score), status: c.status,
      carteira: c.carteira_id ? { id: c.carteira_id, code: c.carteira_code, name: c.carteira_name, gestorName: c.carteira_gestor_name } : null,
      createdAt: c.created_at, updatedAt: c.updated_at,
    },
    summary: {
      activeLoans: activeLoans.length,
      totalLoans: loanRows.length,
      totalDisbursed: Math.round(totalDisbursed * 100) / 100,
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      overdueInstallments: overdue.length,
      overdueAmount: Math.round(overdue.reduce((s, i) => s + num(i.payment_amount), 0) * 100) / 100,
      guaranteesCount: guarantors.rows.length + collaterals.rows.length,
      documentsCount: documents.rows.length,
      evaluationsCount: evaluations.rows.length,
      approvalRequestsCount: approvalRequests.rows.length,
      nextDueDate: installmentRows.find((i) => ["pending", "partial"].includes(String(i.status).toLowerCase()))?.due_date || null,
    },
    documents: mapRows(documents.rows),
    evaluations: mapRows(evaluations.rows),
    guarantees: { guarantors: mapRows(guarantors.rows), collaterals: mapRows(collaterals.rows) },
    loans: mapRows(loanRows),
    repayments: mapRows(repaymentRows),
    installments: mapRows(installmentRows),
    approvalRequests: mapRows(approvalRequests.rows),
    promises: mapRows(promises.rows),
    renegotiations: mapRows(renegotiations.rows),
    portfolioTransfers: mapRows(transfers.rows),
    financialEvents: mapRows(financialEvents.rows),
    contractAudits: mapRows(contractAudits.rows),
  };
}
