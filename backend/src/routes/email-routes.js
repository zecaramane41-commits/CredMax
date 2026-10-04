import express from "express";
import { query, withTransaction } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";
import { sendClientEmail, buildDisbursementEmail, buildRepaymentReceiptEmail, buildMoraAlertEmail, buildTransferApprovedEmail, buildManagerSummaryEmail } from "../services/notification-service.js";

export const emailRouter = express.Router();

emailRouter.use(requireAuth);
emailRouter.use(requireReadWrite("gerir.notificacoes"));

// Histórico de e-mails enviados
emailRouter.get("/log", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const result = await query(
      `
      SELECT id, client_id, recipient_email, message_type, subject, status, provider_response, reference_type, reference_id, sent_at, created_at
      FROM client_email_log
      WHERE company_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [scope.companyId, limit],
    );
    return res.json({
      items: result.rows.map((row) => ({
        id: Number(row.id),
        clientId: row.client_id ? Number(row.client_id) : null,
        recipientEmail: row.recipient_email,
        messageType: row.message_type,
        subject: row.subject,
        status: row.status,
        providerResponse: row.provider_response,
        referenceType: row.reference_type,
        referenceId: row.reference_id ? Number(row.reference_id) : null,
        sentAt: row.sent_at,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// Teste de envio de e-mail (usa os templates)
emailRouter.post("/test", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const { recipientEmail, messageType } = req.body || {};
    if (!recipientEmail) return res.status(400).json({ message: "E-mail destinatário obrigatório." });

    const templates = {
      disbursement_confirmation: buildDisbursementEmail({ clientName: "Cliente Teste", contractNo: "TST-001", amount: "10.000,00", currency: "MZN", disbursedOn: new Date().toISOString().slice(0, 10) }),
      repayment_receipt: buildRepaymentReceiptEmail({ clientName: "Cliente Teste", receiptNo: "REC-001", amount: "5.000,00", paymentDate: new Date().toISOString().slice(0, 10), balance: "45.000,00", contractNo: "TST-001" }),
      mora_alert: buildMoraAlertEmail({ clientName: "Cliente Teste", contractNo: "TST-001", installmentNo: "3", dueDate: "2026-07-01", amount: "5.000,00" }),
      transfer_approved: buildTransferApprovedEmail({ clientName: "Cliente Teste", fromManager: "Gestor A", toManager: "Gestor B", portfolio: "Carteira Teste" }),
      manager_summary: buildManagerSummaryEmail({ managerName: "Gestor Teste", period: "2026-W35", disbursements: 5, repayments: 12, activeClients: 30 }),
    };

    const content = templates[messageType] || templates.disbursement_confirmation;
    const result = await sendClientEmail({
      companyId: scope.companyId,
      clientId: null,
      recipientEmail,
      messageType: messageType || "disbursement_confirmation",
      subject: content.subject,
      body: content.body,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// Preview de template (sem enviar)
emailRouter.get("/preview/:messageType", async (req, res, next) => {
  try {
    const { messageType } = req.params;
    const templates = {
      disbursement_confirmation: buildDisbursementEmail({ clientName: "Cliente Teste", contractNo: "TST-001", amount: "10.000,00", currency: "MZN", disbursedOn: "2026-08-26" }),
      repayment_receipt: buildRepaymentReceiptEmail({ clientName: "Cliente Teste", receiptNo: "REC-001", amount: "5.000,00", paymentDate: "2026-08-26", balance: "45.000,00", contractNo: "TST-001" }),
      mora_alert: buildMoraAlertEmail({ clientName: "Cliente Teste", contractNo: "TST-001", installmentNo: "3", dueDate: "2026-07-01", amount: "5.000,00" }),
      transfer_approved: buildTransferApprovedEmail({ clientName: "Cliente Teste", fromManager: "Gestor A", toManager: "Gestor B", portfolio: "Carteira Teste" }),
      manager_summary: buildManagerSummaryEmail({ managerName: "Gestor Teste", period: "2026-W35", disbursements: 5, repayments: 12, activeClients: 30 }),
    };
    const content = templates[messageType];
    if (!content) return res.status(404).json({ message: "Template não encontrado." });
    return res.json(content);
  } catch (error) {
    return next(error);
  }
});