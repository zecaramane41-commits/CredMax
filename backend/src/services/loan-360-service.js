import { query } from "../config/db.js";

const rows = (result) => result.rows || [];

export async function getLoan360(companyId, loanId) {
  const loanResult = await query(
    `SELECT l.*, c.name AS client_name, c.nuit AS client_nuit, c.phone AS client_phone,
            c.document_type AS client_document_type, c.document_number AS client_document_number,
            c.client_type, u.full_name AS manager_name
     FROM loans l
     JOIN clients c ON c.id = l.client_id AND c.company_id = l.company_id
     LEFT JOIN users u ON u.id = l.manager_user_id
     WHERE l.id = $1 AND l.company_id = $2
     LIMIT 1`,
    [loanId, companyId],
  );
  if (!loanResult.rows[0]) return null;

  const loan = loanResult.rows[0];
  const [installments, repayments, approvals, documents, events, promises, renegotiations, contractAudit, guarantors, collaterals] = await Promise.all([
    query(`SELECT * FROM loan_installments WHERE loan_id = $1 ORDER BY installment_no ASC, id ASC`, [loanId]),
    query(`SELECT * FROM loan_repayments WHERE loan_id = $1 AND company_id = $2 ORDER BY payment_date DESC, id DESC`, [loanId, companyId]),
    query(`SELECT * FROM loan_approval_requests WHERE client_id = $1 AND company_id = $2 AND generated_loan_id = $3 ORDER BY created_at DESC, id DESC`, [loan.client_id, companyId, loanId]),
    query(`SELECT * FROM loan_documents WHERE loan_id = $1 AND company_id = $2 ORDER BY generated_at DESC, id DESC`, [loanId, companyId]),
    query(`SELECT * FROM loan_financial_events WHERE loan_id = $1 AND company_id = $2 ORDER BY created_at DESC, id DESC`, [loanId, companyId]),
    query(`SELECT * FROM loan_payment_promises WHERE loan_id = $1 AND company_id = $2 ORDER BY promised_for DESC, id DESC`, [loanId, companyId]),
    query(`SELECT * FROM loan_renegotiations WHERE loan_id = $1 AND company_id = $2 ORDER BY created_at DESC, id DESC`, [loanId, companyId]),
    query(`SELECT * FROM loan_contract_audit WHERE loan_id = $1 AND company_id = $2 ORDER BY changed_at DESC, id DESC`, [loanId, companyId]),
    query(`SELECT * FROM guarantors WHERE client_id = $1 AND company_id = $2 ORDER BY created_at DESC, id DESC`, [loan.client_id, companyId]),
    query(`SELECT * FROM collaterals WHERE client_id = $1 AND company_id = $2 ORDER BY created_at DESC, id DESC`, [loan.client_id, companyId]),
  ]);

  const installmentRows = rows(installments);
  const repaymentRows = rows(repayments);
  const paid = repaymentRows.reduce((sum, item) => sum + Number(item.amount_applied || item.amount_received || 0), 0);
  const overdue = installmentRows.filter((item) => ["late", "overdue", "atrasado"].includes(String(item.status || "").toLowerCase()));
  const timeline = [
    { type: "loan_created", date: loan.created_at, title: "Crédito criado", status: loan.status },
    ...rows(approvals).map((item) => ({ type: "approval", date: item.created_at, title: "Pedido de aprovação", status: item.status, note: item.final_decision_note || item.manager_decision_note || item.analyst_decision_note || null })),
    ...rows(contractAudit).map((item) => ({ type: "contract", date: item.changed_at, title: `Contrato: ${item.action}`, status: item.action })),
    ...rows(events).map((item) => ({ type: "financial_event", date: item.created_at, title: item.event_type, status: item.workflow_status, amount: item.amount })),
    ...repaymentRows.map((item) => ({ type: "payment", date: item.payment_date, title: "Pagamento recebido", amount: item.amount_received, status: "confirmed" })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  return {
    loan: {
      ...loan,
      client: {
        id: loan.client_id,
        name: loan.client_name,
        nuit: loan.client_nuit,
        phone: loan.client_phone,
        documentType: loan.client_document_type,
        documentNumber: loan.client_document_number,
        type: loan.client_type,
      },
      managerName: loan.manager_name || null,
    },
    summary: {
      principal: Number(loan.principal || 0),
      balance: Number(loan.balance || 0),
      totalPaid: Math.round(paid * 100) / 100,
      installments: installmentRows.length,
      overdueInstallments: overdue.length,
      overdueAmount: Math.round(overdue.reduce((sum, item) => sum + Number(item.payment_amount || 0), 0) * 100) / 100,
      daysOverdue: Number(loan.days_overdue || 0),
      guarantees: rows(guarantors).length + rows(collaterals).length,
    },
    timeline,
    installments: installmentRows,
    repayments: repaymentRows,
    approvals: rows(approvals),
    documents: rows(documents),
    financialEvents: rows(events),
    promises: rows(promises),
    renegotiations: rows(renegotiations),
    contractAudit: rows(contractAudit),
    guarantees: { guarantors: rows(guarantors), collaterals: rows(collaterals) },
  };
}
