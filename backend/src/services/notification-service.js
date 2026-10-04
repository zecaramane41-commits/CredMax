import nodemailer from "nodemailer";
import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { publishAppEvent } from "./event-bus.js";

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatMoney(value) {
  return `${round2(value).toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
}

function formatDatePt(isoDate) {
  if (!isoDate) return "-";
  const raw = String(isoDate).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("258") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 9) return `+258${digits}`;
  if (digits.length >= 9) return `+${digits}`;
  return null;
}

export async function getNotificationSettings(companyId) {
  const result = await query(
    `
    SELECT
      company_id,
      sms_enabled,
      sms_provider,
      sms_api_key,
      sms_sender_id,
      due_reminder_days,
      notify_payment_sms,
      notify_due_reminder_sms,
      notify_caixa_alerts,
      email_enabled,
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_password,
      smtp_from,
      notify_disbursement_email,
      notify_mora_alerts
    FROM notification_settings
    WHERE company_id = $1
    LIMIT 1
    `,
    [companyId],
  );
  if (!result.rows[0]) {
    return {
      companyId,
      smsEnabled: true,
      smsProvider: "console",
      smsApiKey: null,
      smsSenderId: "SiGeM",
      dueReminderDays: 3,
      notifyPaymentSms: true,
      notifyDueReminderSms: true,
      notifyCaixaAlerts: true,
      emailEnabled: false,
      smtpHost: null,
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: null,
      smtpPassword: null,
      smtpFrom: null,
      notifyDisbursementEmail: true,
      notifyMoraAlerts: true,
    };
  }
  const row = result.rows[0];
  return {
    companyId,
    smsEnabled: Boolean(row.sms_enabled),
    smsProvider: row.sms_provider || "console",
    smsApiKey: row.sms_api_key || null,
    smsSenderId: row.sms_sender_id || "SiGeM",
    dueReminderDays: Number(row.due_reminder_days || 3),
    notifyPaymentSms: Boolean(row.notify_payment_sms),
    notifyDueReminderSms: Boolean(row.notify_due_reminder_sms),
    notifyCaixaAlerts: Boolean(row.notify_caixa_alerts),
    emailEnabled: Boolean(row.email_enabled),
    smtpHost: row.smtp_host || null,
    smtpPort: Number(row.smtp_port || 587),
    smtpSecure: Boolean(row.smtp_secure),
    smtpUser: row.smtp_user || null,
    smtpPassword: row.smtp_password || null,
    smtpFrom: row.smtp_from || null,
    notifyDisbursementEmail: Boolean(row.notify_disbursement_email),
    notifyMoraAlerts: Boolean(row.notify_mora_alerts),
  };
}

export async function upsertNotificationSettings(companyId, payload) {
  await query(
    `
    INSERT INTO notification_settings (
      company_id, sms_enabled, sms_provider, sms_api_key, sms_sender_id,
      due_reminder_days, notify_payment_sms, notify_due_reminder_sms, notify_caixa_alerts, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (company_id) DO UPDATE SET
      sms_enabled = EXCLUDED.sms_enabled,
      sms_provider = EXCLUDED.sms_provider,
      sms_api_key = COALESCE(EXCLUDED.sms_api_key, notification_settings.sms_api_key),
      sms_sender_id = EXCLUDED.sms_sender_id,
      due_reminder_days = EXCLUDED.due_reminder_days,
      notify_payment_sms = EXCLUDED.notify_payment_sms,
      notify_due_reminder_sms = EXCLUDED.notify_due_reminder_sms,
      notify_caixa_alerts = EXCLUDED.notify_caixa_alerts,
      email_enabled = EXCLUDED.email_enabled,
      smtp_host = COALESCE(EXCLUDED.smtp_host, notification_settings.smtp_host),
      smtp_port = COALESCE(EXCLUDED.smtp_port, notification_settings.smtp_port),
      smtp_secure = EXCLUDED.smtp_secure,
      smtp_user = COALESCE(EXCLUDED.smtp_user, notification_settings.smtp_user),
      smtp_password = COALESCE(EXCLUDED.smtp_password, notification_settings.smtp_password),
      smtp_from = COALESCE(EXCLUDED.smtp_from, notification_settings.smtp_from),
      notify_disbursement_email = EXCLUDED.notify_disbursement_email,
      notify_mora_alerts = EXCLUDED.notify_mora_alerts,
      updated_at = NOW()
    `,
    [
      companyId,
      Boolean(payload.smsEnabled),
      String(payload.smsProvider || "console"),
      payload.smsApiKey || null,
      String(payload.smsSenderId || "SiGeM").slice(0, 11),
      Math.max(1, Math.min(30, Number(payload.dueReminderDays || 3))),
      Boolean(payload.notifyPaymentSms),
      Boolean(payload.notifyDueReminderSms),
      Boolean(payload.notifyCaixaAlerts),
      Boolean(payload.emailEnabled),
      payload.smtpHost || null,
      Number(payload.smtpPort || 587),
      Boolean(payload.smtpSecure),
      payload.smtpUser || null,
      payload.smtpPassword || null,
      payload.smtpFrom || null,
      payload.notifyDisbursementEmail !== false,
      payload.notifyMoraAlerts !== false,
    ],
  );
  return getNotificationSettings(companyId);
}

async function dispatchSms({ provider, apiKey, senderId, phone, message }) {
  if (provider === "twilio" && apiKey) {
    const [accountSid, authToken] = String(apiKey).split("|");
    if (!accountSid || !authToken) {
      return { status: "failed", response: "Twilio credentials invalid (use SID|TOKEN format)" };
    }
    try {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const body = new URLSearchParams({
        To: phone,
        From: senderId || "SiGeM",
        Body: message,
      });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { status: "failed", response: JSON.stringify(data) };
      }
      return { status: "sent", response: JSON.stringify({ sid: data.sid }) };
    } catch (error) {
      return { status: "failed", response: error instanceof Error ? error.message : "Twilio error" };
    }
  }

  logger.info("[SMS]", { phone, message: message.slice(0, 160) });
  return { status: "sent", response: "console provider (dev mode)" };
}

export async function sendClientSms({
  companyId,
  clientId,
  phone,
  messageType,
  messageBody,
  referenceType = null,
  referenceId = null,
}) {
  const settings = await getNotificationSettings(companyId);
  if (!settings.smsEnabled) {
    return { skipped: true, reason: "sms_disabled" };
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return { skipped: true, reason: "invalid_phone" };
  }

  const inserted = await query(
    `
    INSERT INTO client_sms_log (
      company_id, client_id, phone, message_type, message_body, status, reference_type, reference_id
    )
    VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)
    RETURNING id
    `,
    [companyId, clientId || null, normalizedPhone, messageType, messageBody, referenceType, referenceId],
  );
  const smsLogId = inserted.rows[0].id;

  const dispatch = await dispatchSms({
    provider: settings.smsProvider,
    apiKey: settings.smsApiKey,
    senderId: settings.smsSenderId,
    phone: normalizedPhone,
    message: messageBody,
  });

  await query(
    `
    UPDATE client_sms_log
    SET status = $1, provider_response = $2, sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE NULL END
    WHERE id = $3
    `,
    [dispatch.status, dispatch.response || null, smsLogId],
  );

  return { smsLogId, status: dispatch.status, phone: normalizedPhone };
}

export async function createSystemNotification({
  companyId,
  userId = null,
  category = "general",
  severity = "info",
  title,
  message,
  referenceType = null,
  referenceId = null,
  metadata = {},
}) {
  const result = await query(
    `
    INSERT INTO system_notifications (
      company_id, user_id, category, severity, title, message,
      reference_type, reference_id, metadata_json
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING id, created_at
    `,
    [
      companyId,
      userId,
      category,
      severity,
      title,
      message,
      referenceType,
      referenceId,
      JSON.stringify(metadata || {}),
    ],
  );
  const created = result.rows[0];
  if (created) {
    publishAppEvent(companyId, "NOTIFICATION_CREATED", {
      id: Number(created.id),
      userId,
      category,
      severity,
      title,
      message,
      referenceType,
      referenceId,
      createdAt: created.created_at,
    });
  }
  return created;
}

export async function notifyCaixaMovement({
  companyId,
  actionType,
  actorName,
  amount = null,
  note = null,
  sessionId = null,
}) {
  const settings = await getNotificationSettings(companyId);
  if (!settings.notifyCaixaAlerts) return null;

  const actionLabels = {
    open_day: "Abertura de caixa",
    close_day: "Fecho de caixa",
    reinforcement: "Reforço de caixa",
    payment_received: "Pagamento recebido",
    disbursement: "Desembolso",
    expense: "Despesa de caixa",
    reopen_day: "Reabertura de caixa",
  };
  const label = actionLabels[actionType] || actionType;
  const amountText = amount !== null && amount !== undefined ? ` Valor: ${formatMoney(amount)}.` : "";
  const noteText = note ? ` ${note}` : "";

  return createSystemNotification({
    companyId,
    category: "caixa",
    severity: actionType === "expense" || actionType === "disbursement" ? "warning" : "info",
    title: `Movimento de caixa: ${label}`,
    message: `${actorName || "Operador"} registou ${label.toLowerCase()}.${amountText}${noteText}`,
    referenceType: "finance_session",
    referenceId: sessionId,
    metadata: { actionType, amount, note },
  });
}

export async function notifyPaymentReceivedSms({ companyId, clientId, repaymentId }) {
  const settings = await getNotificationSettings(companyId);
  if (!settings.notifyPaymentSms) return { skipped: true, reason: "payment_sms_disabled" };

  const clientResult = await query(
    `
    SELECT c.name, c.phone, c.phone_alt
    FROM clients c
    WHERE c.id = $1 AND c.company_id = $2
    LIMIT 1
    `,
    [clientId, companyId],
  );
  const client = clientResult.rows[0];
  if (!client) return { skipped: true, reason: "client_not_found" };

  const repaymentResult = await query(
    `
    SELECT r.amount_received, r.amount_applied, r.receipt_no, r.payment_date
    FROM loan_repayments r
    WHERE r.id = $1 AND r.company_id = $2
    LIMIT 1
    `,
    [repaymentId, companyId],
  );
  const repayment = repaymentResult.rows[0];
  if (!repayment) return { skipped: true, reason: "repayment_not_found" };

  const debtResult = await query(
    `
    SELECT COALESCE(SUM(l.balance), 0) AS total_balance
    FROM loans l
    WHERE l.client_id = $1
      AND l.company_id = $2
      AND l.status IN ('active', 'disbursed', 'overdue', 'restructured')
    `,
    [clientId, companyId],
  );
  const totalBalance = round2(debtResult.rows[0]?.total_balance || 0);
  const paid = round2(repayment.amount_applied || repayment.amount_received || 0);
  const receiptNo = repayment.receipt_no || `#${repaymentId}`;
  const paymentDate = formatDatePt(repayment.payment_date);

  const messageBody =
    `SiGeM: Ola ${client.name.split(" ")[0] || "Cliente"}, recebemos ${formatMoney(paid)} em ${paymentDate}. ` +
    `Recibo ${receiptNo}. Saldo remanescente: ${formatMoney(totalBalance)}. Obrigado.`;

  const phone = client.phone || client.phone_alt;
  return sendClientSms({
    companyId,
    clientId,
    phone,
    messageType: "payment_received",
    messageBody,
    referenceType: "loan_repayment",
    referenceId: repaymentId,
  });
}

export async function sendDueDateReminders() {
  const companies = await query(`SELECT id FROM companies WHERE is_active = TRUE`);
  let sent = 0;
  let skipped = 0;

  for (const company of companies.rows) {
    const companyId = Number(company.id);
    const settings = await getNotificationSettings(companyId);
    if (!settings.notifyDueReminderSms) {
      skipped += 1;
      continue;
    }

    const daysBefore = settings.dueReminderDays || 3;
    const targetDate = new Date();
    targetDate.setUTCDate(targetDate.getUTCDate() + daysBefore);
    const targetIso = targetDate.toISOString().slice(0, 10);

    const installments = await query(
      `
      SELECT
        li.id AS installment_id,
        li.installment_no,
        li.due_date,
        li.payment_amount,
        li.status,
        l.id AS loan_id,
        l.contract_no,
        l.client_id,
        c.name AS client_name,
        c.phone,
        c.phone_alt
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      JOIN clients c ON c.id = l.client_id
      WHERE l.company_id = $1
        AND li.due_date = $2::date
        AND li.status IN ('pending', 'partial', 'late')
        AND l.status IN ('active', 'disbursed', 'overdue', 'restructured')
      `,
      [companyId, targetIso],
    );

    for (const row of installments.rows) {
      const existing = await query(
        `
        SELECT id FROM installment_reminder_log
        WHERE installment_id = $1 AND reminder_date = CURRENT_DATE AND days_before_due = $2
        LIMIT 1
        `,
        [row.installment_id, daysBefore],
      );
      if (existing.rows[0]) continue;

      const amount = round2(row.payment_amount || 0);
      const dueDate = formatDatePt(row.due_date);
      const messageBody =
        `SiGeM: Ola ${String(row.client_name).split(" ")[0] || "Cliente"}, lembrete: prestacao ${row.installment_no} ` +
        `do contrato ${row.contract_no} vence em ${daysBefore} dias (${dueDate}). Valor: ${formatMoney(amount)}.`;

      const smsResult = await sendClientSms({
        companyId,
        clientId: row.client_id,
        phone: row.phone || row.phone_alt,
        messageType: "due_reminder",
        messageBody,
        referenceType: "loan_installment",
        referenceId: row.installment_id,
      });

      if (!smsResult.skipped) {
        await query(
          `
          INSERT INTO installment_reminder_log (company_id, installment_id, reminder_date, days_before_due, sms_log_id)
          VALUES ($1,$2,CURRENT_DATE,$3,$4)
          ON CONFLICT DO NOTHING
          `,
          [companyId, row.installment_id, daysBefore, smsResult.smsLogId || null],
        );
        sent += 1;

        await createSystemNotification({
          companyId,
          category: "prestacao",
          severity: "warning",
          title: `Prestacao a vencer em ${daysBefore} dias`,
          message: `${row.client_name} - Contrato ${row.contract_no}, prestacao ${row.installment_no} (${formatMoney(amount)}) vence em ${dueDate}.`,
          referenceType: "loan_installment",
          referenceId: row.installment_id,
          metadata: { clientId: row.client_id, dueDate: row.due_date },
        });
      } else {
        skipped += 1;
      }
    }

    // Alertas de mora: prestações já vencidas (Fase 4)
    const moraRows = await query(
      `
      SELECT
        li.id AS installment_id,
        li.installment_no,
        li.due_date,
        li.payment_amount,
        l.id AS loan_id,
        l.contract_no,
        l.client_id,
        c.name AS client_name,
        c.phone,
        c.phone_alt,
        c.email
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      JOIN clients c ON c.id = l.client_id
      WHERE l.company_id = $1
        AND li.status = 'late'
        AND li.due_date < CURRENT_DATE
        AND NOT EXISTS (
          SELECT 1 FROM installment_reminder_log rl
          WHERE rl.installment_id = li.id
            AND rl.days_before_due = 0
            AND rl.reminder_date = CURRENT_DATE
        )
      LIMIT 500
      `,
      [companyId],
    );

    for (const row of moraRows.rows) {
      const amount = round2(row.payment_amount || 0);
      const dueDate = formatDatePt(row.due_date);
      const messageBody =
        `SiGeM: Ola ${String(row.client_name).split(" ")[0] || "Cliente"}, a prestacao ${row.installment_no} ` +
        `do contrato ${row.contract_no} encontra-se EM MORA desde ${dueDate}. Valor: ${formatMoney(amount)}. Regularize ja.`;

      const smsResult = await sendClientSms({
        companyId,
        clientId: row.client_id,
        phone: row.phone || row.phone_alt,
        messageType: "mora_alert",
        messageBody,
        referenceType: "loan_installment",
        referenceId: row.installment_id,
      });

      try {
        await notifyMoraAlertEmail({
          companyId,
          clientId: Number(row.client_id),
          clientName: row.client_name || "Cliente",
          clientEmail: row.email || null,
          contractNo: row.contract_no || "-",
          installmentNo: row.installment_no || "-",
          dueDate,
          amount: formatMoney(amount),
        });
      } catch {
        /* e-mail best-effort */
      }

      await query(
        `
        INSERT INTO installment_reminder_log (company_id, installment_id, reminder_date, days_before_due, sms_log_id)
        VALUES ($1,$2,CURRENT_DATE,0,$3)
        ON CONFLICT DO NOTHING
        `,
        [companyId, row.installment_id, smsResult.smsLogId || null],
      );
      sent += 1;

      await createSystemNotification({
        companyId,
        category: "mora",
        severity: "danger",
        title: "Prestação em mora",
        message: `${row.client_name} - Contrato ${row.contract_no}, prestação ${row.installment_no} (${formatMoney(amount)}) vencida em ${dueDate}.`,
        referenceType: "loan_installment",
        referenceId: row.installment_id,
        metadata: { clientId: row.client_id, dueDate: row.due_date },
      });
    }
  }

  return { sent, skipped };
}

export async function getClientCreditProfile(companyId, clientId) {
  const clientResult = await query(
    `
    SELECT
      c.id, c.name, c.nuit, c.phone, c.phone_alt, c.email, c.score, c.status,
      c.monthly_income, c.monthly_expenses, c.client_type
    FROM clients c
    WHERE c.id = $1 AND c.company_id = $2
    LIMIT 1
    `,
    [clientId, companyId],
  );
  if (!clientResult.rows[0]) return null;
  const client = clientResult.rows[0];

  const loansResult = await query(
    `
    SELECT
      l.id, l.contract_no, l.product, l.principal, l.balance, l.status,
      l.disbursed_on, l.maturity_on, l.payment_frequency, l.days_overdue,
      u.full_name AS manager_name, l.interest_rate
    FROM loans l
    LEFT JOIN users u ON u.id = l.manager_user_id
    WHERE l.client_id = $1 AND l.company_id = $2
    ORDER BY l.created_at DESC
    `,
    [clientId, companyId],
  );

  const repaymentsResult = await query(
    `
    SELECT
      r.id, r.receipt_no, r.payment_date, r.amount_received, r.amount_applied,
      r.principal_applied, r.interest_applied, r.mora_applied, r.loan_id,
      l.contract_no
    FROM loan_repayments r
    LEFT JOIN loans l ON l.id = r.loan_id
    WHERE r.client_id = $1 AND r.company_id = $2
    ORDER BY r.payment_date DESC, r.id DESC
    LIMIT 50
    `,
    [clientId, companyId],
  );

  const installmentsResult = await query(
    `
    SELECT
      li.id, li.loan_id, li.installment_no, li.due_date, li.payment_amount,
      li.principal_amount, li.interest_amount, li.status, li.paid_at,
      l.contract_no
    FROM loan_installments li
    JOIN loans l ON l.id = li.loan_id
    WHERE l.client_id = $1 AND l.company_id = $2
      AND li.status IN ('pending', 'partial', 'late')
    ORDER BY li.due_date ASC
    LIMIT 100
    `,
    [clientId, companyId],
  );

  const smsResult = await query(
    `
    SELECT id, message_type, message_body, status, sent_at, created_at
    FROM client_sms_log
    WHERE client_id = $1 AND company_id = $2
    ORDER BY created_at DESC
    LIMIT 30
    `,
    [clientId, companyId],
  );

  const evaluationsResult = await query(
    `
    SELECT e.id, e.final_score, e.decision, u.full_name AS analyst_name, e.created_at, e.note
    FROM client_evaluations e
    LEFT JOIN users u ON u.id = e.analyst_user_id
    WHERE e.client_id = $1 AND e.company_id = $2
    ORDER BY e.created_at DESC
    LIMIT 10
    `,
    [clientId, companyId],
  );

  const totalDebt = round2(loansResult.rows.reduce((sum, l) => sum + Number(l.balance || 0), 0));
  const totalPaid = round2(
    repaymentsResult.rows.reduce((sum, r) => sum + Number(r.amount_applied || r.amount_received || 0), 0),
  );
  const overdueInstallments = installmentsResult.rows.filter((i) => i.status === "late").length;
  const nextInstallment = installmentsResult.rows[0] || null;

  return {
    client: {
      id: client.id,
      name: client.name,
      nuit: client.nuit,
      phone: client.phone,
      phoneAlt: client.phone_alt,
      email: client.email,
      score: Number(client.score || 0),
      status: client.status,
      type: client.client_type,
      monthlyIncome: Number(client.monthly_income || 0),
      monthlyExpenses: Number(client.monthly_expenses || 0),
    },
    summary: {
      totalDebt,
      totalPaid,
      activeLoans: loansResult.rows.filter((l) => !["closed", "rejected", "cancelled"].includes(String(l.status))).length,
      overdueInstallments,
      nextDueDate: nextInstallment?.due_date || null,
      nextDueAmount: nextInstallment ? round2(nextInstallment.payment_amount) : 0,
    },
    loans: loansResult.rows.map((l) => ({
      id: l.id,
      contractNo: l.contract_no,
      product: l.product,
      principal: Number(l.principal || 0),
      balance: Number(l.balance || 0),
      status: l.status,
      disbursedOn: l.disbursed_on,
      maturityDate: l.maturity_on,
      paymentFrequency: l.payment_frequency,
      daysOverdue: Number(l.days_overdue || 0),
      managerName: l.manager_name,
      interestRate: Number(l.interest_rate || 0),
    })),
    repayments: repaymentsResult.rows.map((r) => ({
      id: r.id,
      receiptNo: r.receipt_no,
      paymentDate: r.payment_date,
      amountReceived: Number(r.amount_received || 0),
      amountApplied: Number(r.amount_applied || 0),
      principalApplied: Number(r.principal_applied || 0),
      interestApplied: Number(r.interest_applied || 0),
      moraApplied: Number(r.mora_applied || 0),
      loanId: r.loan_id,
      contractNo: r.contract_no,
    })),
    pendingInstallments: installmentsResult.rows.map((i) => ({
      id: i.id,
      loanId: i.loan_id,
      contractNo: i.contract_no,
      installmentNo: i.installment_no,
      dueDate: i.due_date,
      paymentAmount: Number(i.payment_amount || 0),
      principalAmount: Number(i.principal_amount || 0),
      interestAmount: Number(i.interest_amount || 0),
      status: i.status,
      paidAt: i.paid_at,
    })),
    smsHistory: smsResult.rows.map((s) => ({
      id: s.id,
      messageType: s.message_type,
      messageBody: s.message_body,
      status: s.status,
      sentAt: s.sent_at,
      createdAt: s.created_at,
    })),
    evaluations: evaluationsResult.rows.map((e) => ({
      id: e.id,
      finalScore: Number(e.final_score || 0),
      decision: e.decision,
      analystName: e.analyst_name,
      createdAt: e.created_at,
      note: e.note,
    })),
  };
}

export async function listNotifications(companyId, { userId = null, unreadOnly = false, limit = 50 } = {}) {
  const params = [companyId];
  let where = "WHERE n.company_id = $1 AND (n.user_id IS NULL OR n.user_id = $2)";
  params.push(userId);
  if (unreadOnly) where += " AND n.is_read = FALSE";
  params.push(Math.min(100, Math.max(1, limit)));

  const result = await query(
    `
    SELECT
      n.id, n.category, n.severity, n.title, n.message,
      n.reference_type, n.reference_id, n.is_read, n.created_at, n.metadata_json
    FROM system_notifications n
    ${where}
    ORDER BY n.created_at DESC
    LIMIT $3
    `,
    params,
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS unread_count
    FROM system_notifications n
    WHERE n.company_id = $1
      AND (n.user_id IS NULL OR n.user_id = $2)
      AND n.is_read = FALSE
    `,
    [companyId, userId],
  );

  return {
    notifications: result.rows.map((row) => ({
      id: Number(row.id),
      category: row.category,
      severity: row.severity,
      title: row.title,
      message: row.message,
      referenceType: row.reference_type,
      referenceId: row.reference_id ? Number(row.reference_id) : null,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
      metadata: row.metadata_json || {},
    })),
    unreadCount: Number(countResult.rows[0]?.unread_count || 0),
  };
}

export async function markNotificationsRead(companyId, userId, notificationIds = null) {
  if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    await query(
      `
      UPDATE system_notifications
      SET is_read = TRUE
      WHERE company_id = $1
        AND (user_id IS NULL OR user_id = $2)
        AND id = ANY($3::bigint[])
      `,
      [companyId, userId, notificationIds],
    );
  } else {
    await query(
      `
      UPDATE system_notifications
      SET is_read = TRUE
      WHERE company_id = $1
        AND (user_id IS NULL OR user_id = $2)
        AND is_read = FALSE
      `,
      [companyId, userId],
    );
  }
}
// =============================================================================
// E-MAIL TEMPLATES & DISPATCH
// =============================================================================

function buildEmailTransport(settings) {
  if (!settings.emailEnabled || !settings.smtpHost || !settings.smtpUser) {
    return null;
  }
  try {
    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort || 587),
      secure: Boolean(settings.smtpSecure),
      auth: { user: settings.smtpUser, pass: settings.smtpPassword || "" },
    });
  } catch (error) {
    logger.warn("nodemailer not available", { error: error instanceof Error ? error.message : error });
    return null;
  }
}

export function buildDisbursementEmail({ clientName, contractNo, amount, currency, disbursedOn }) {
  const subject = `SiGeM - Confirmacao de Desembolso ${contractNo || ""}`.trim();
  const body =
    `Ola ${clientName || "Cliente"},\n\n` +
    `O seu desembolso foi processado com sucesso.\n\n` +
    `Contrato: ${contractNo || "-"}\n` +
    `Valor: ${amount} ${currency || "MZN"}\n` +
    `Data: ${disbursedOn || "-"}\n\n` +
    `Obrigado por escolher o SiGeM.\n`;
  return { subject, body };
}

export function buildRepaymentReceiptEmail({ clientName, receiptNo, amount, paymentDate, balance, contractNo }) {
  const subject = `SiGeM - Recibo de Reembolso ${receiptNo || ""}`.trim();
  const body =
    `Ola ${clientName || "Cliente"},\n\n` +
    `Confirmamos a recepção do seu reembolso.\n\n` +
    `Recibo: ${receiptNo || "-"}\n` +
    `Contrato: ${contractNo || "-"}\n` +
    `Valor pago: ${amount} MZN\n` +
    `Data: ${paymentDate || "-"}\n` +
    `Saldo remanescente: ${balance} MZN\n\n` +
    `Obrigado.\n`;
  return { subject, body };
}

export function buildMoraAlertEmail({ clientName, contractNo, installmentNo, dueDate, amount }) {
  const subject = `SiGeM - Alerta de Mora ${contractNo || ""}`.trim();
  const body =
    `Ola ${clientName || "Cliente"},\n\n` +
    `A sua prestação está em mora.\n\n` +
    `Contrato: ${contractNo || "-"}\n` +
    `Prestação: ${installmentNo || "-"}\n` +
    `Vencimento: ${dueDate || "-"}\n` +
    `Valor em dívida: ${amount} MZN\n\n` +
    `Regularize a sua situação o mais breve possível.\n`;
  return { subject, body };
}



export function startNotificationScheduler() {
  const runReminders = async () => {
    try {
      const result = await sendDueDateReminders();
      if (result.sent > 0) {
        logger.info("Due date reminders sent", result);
      }
    } catch (error) {
      logger.error("Due date reminder scheduler failed", { error: error instanceof Error ? error.message : error });
    }
    try {
      // Resumo semanal para gestores (envia apenas quando ainda não foi hoje)
      const summary = await sendWeeklyManagerSummaries();
      if (summary.sent > 0) {
        logger.info("Weekly manager summaries sent", { sent: summary.sent });
      }
    } catch (error) {
      logger.error("Weekly manager summary scheduler failed", { error: error instanceof Error ? error.message : error });
    }
  };

  runReminders();
  const intervalMs = 6 * 60 * 60 * 1000;
  setInterval(runReminders, intervalMs);
  logger.info("Notification scheduler started", { intervalHours: 6 });
}


export function buildTransferApprovedEmail({ clientName, fromManager, toManager, portfolio }) {
  const subject = `SiGeM - Transferência de Carteira`;
  const body =
    `Ola ${clientName || "Cliente"},\n\n` +
    `A sua carteira foi transferida.\n\n` +
    `De: ${fromManager || "-"}\n` +
    `Para: ${toManager || "-"}\n` +
    `Carteira: ${portfolio || "-"}\n\n` +
    `O seu novo gestor entrará em contacto consigo.\n`;
  return { subject, body };
}

export function buildManagerSummaryEmail({ managerName, period, disbursements, repayments, activeClients }) {
  const subject = `SiGeM - Resumo Semanal de Gestão`;
  const body =
    `Ola ${managerName || "Gestor"},\n\n` +
    `Resumo da semana (${period || "-"}):\n\n` +
    `Clientes activos: ${activeClients ?? 0}\n` +
    `Desembolsos: ${disbursements ?? 0}\n` +
    `Reembolsos: ${repayments ?? 0}\n\n` +
    `Consulte o sistema para mais detalhes.\n`;
  return { subject, body };
}

export async function sendClientEmail({ companyId, clientId, recipientEmail, messageType, subject, body, referenceType = null, referenceId = null }) {
  const settings = await getNotificationSettings(companyId);
  const inserted = await query(
    `INSERT INTO client_email_log (company_id, client_id, recipient_email, message_type, subject, body, status, reference_type, reference_id)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8) RETURNING id`,
    [companyId, clientId, recipientEmail, messageType, subject, body, referenceType, referenceId],
  );
  const logId = Number(inserted.rows[0].id);
  const transport = buildEmailTransport(settings);
  if (!transport) {
    await query("UPDATE client_email_log SET status = 'skipped', provider_response = 'email_not_configured' WHERE id = $1", [logId]);
    return { skipped: true, reason: "email_not_configured", logId };
  }
  try {
    const info = await transport.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to: recipientEmail, subject, text: body,
    });
    await query("UPDATE client_email_log SET status = 'sent', provider_response = $1, sent_at = NOW() WHERE id = $2",
      [JSON.stringify({ messageId: info.messageId }), logId]);
    return { status: "sent", logId, messageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "email_send_failed";
    await query("UPDATE client_email_log SET status = 'failed', provider_response = $1 WHERE id = $2", [message, logId]);
    return { status: "failed", logId, error: message };
  }
}

export async function notifyDisbursementEmail({ companyId, clientId, clientName, clientEmail, contractNo, amount, currency, disbursedOn }) {
  const settings = await getNotificationSettings(companyId);
  if (!settings.notifyDisbursementEmail || !clientEmail) return { skipped: true };
  const { subject, body } = buildDisbursementEmail({ clientName, contractNo, amount, currency, disbursedOn });
  return sendClientEmail({ companyId, clientId, recipientEmail: clientEmail, messageType: "disbursement_confirmation", subject, body, referenceType: "loan", referenceId: null });
}

export async function notifyRepaymentEmail({ companyId, clientId, clientName, clientEmail, receiptNo, amount, paymentDate, balance, contractNo }) {
  if (!clientEmail) return { skipped: true };
  const { subject, body } = buildRepaymentReceiptEmail({ clientName, receiptNo, amount, paymentDate, balance, contractNo });
  return sendClientEmail({ companyId, clientId, recipientEmail: clientEmail, messageType: "repayment_receipt", subject, body, referenceType: "loan_repayment", referenceId: null });
}

export async function notifyMoraAlertEmail({ companyId, clientId, clientName, clientEmail, contractNo, installmentNo, dueDate, amount }) {
  const settings = await getNotificationSettings(companyId);
  if (!settings.notifyMoraAlerts || !clientEmail) return { skipped: true };
  const { subject, body } = buildMoraAlertEmail({ clientName, contractNo, installmentNo, dueDate, amount });
  return sendClientEmail({ companyId, clientId, recipientEmail: clientEmail, messageType: "mora_alert", subject, body, referenceType: "loan_installment", referenceId: null });
}

export async function notifyTransferApprovedEmail({ companyId, clientId, clientName, clientEmail, fromManager, toManager, portfolio }) {
  if (!clientEmail) return { skipped: true };
  const { subject, body } = buildTransferApprovedEmail({ clientName, fromManager, toManager, portfolio });
  return sendClientEmail({ companyId, clientId, recipientEmail: clientEmail, messageType: "transfer_approved", subject, body, referenceType: "client", referenceId: clientId });
}

// Resumo semanal por gestor responsável (Fase 4 - 4.2)
export async function sendWeeklyManagerSummaries({ force = false } = {}) {
  let sent = 0;
  try {
    const companies = await query(`SELECT DISTINCT company_id AS id FROM portfolios WHERE is_active = true`);
    for (const company of companies.rows) {
      const companyId = Number(company.id);
      const settings = await getNotificationSettings(companyId);
      if (!settings.emailEnabled) continue;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffIso = cutoff.toISOString().slice(0, 10);

      const managers = await query(
        `
        SELECT DISTINCT
          p.gestor_user_id AS user_id,
          p.gestor_name AS manager_name,
          e.email,
          e.full_name,
          (SELECT COUNT(DISTINCT c.id) FROM clients c WHERE c.company_id = $1 AND c.carteira_id IN (SELECT id FROM portfolios pp WHERE pp.company_id = $1 AND pp.gestor_user_id = p.gestor_user_id) AND c.status = 'active') AS active_clients,
          (SELECT COUNT(*) FROM loans l WHERE l.company_id = $1 AND l.carteira_id IN (SELECT id FROM portfolios pp WHERE pp.company_id = $1 AND pp.gestor_user_id = p.gestor_user_id) AND l.disbursed_at::date >= $2::date) AS disbursements,
          (SELECT COUNT(*) FROM loan_repayments r WHERE r.company_id = $1 AND r.carteira_id IN (SELECT id FROM portfolios pp WHERE pp.company_id = $1 AND pp.gestor_user_id = p.gestor_user_id) AND r.payment_date >= $2::date) AS repayments
        FROM portfolios p
        LEFT JOIN users e ON e.id = p.gestor_user_id
        WHERE p.company_id = $1
          AND p.is_active = true
          AND p.gestor_user_id IS NOT NULL
        `,
        [companyId, cutoffIso],
      );

      for (const row of managers.rows) {
        const email = row.email;
        if (!email) continue;
        if (!force) {
          // evitar reenvio no mesmo dia
          const already = await query(
            `SELECT id FROM client_email_log WHERE company_id = $1 AND recipient_email = $2 AND message_type = 'manager_summary' AND created_at::date = CURRENT_DATE`,
            [companyId, email],
          );
          if (already.rows[0]) continue;
        }
        const period = `${cutoffIso} a ${new Date().toISOString().slice(0, 10)}`;
        const { subject, body } = buildManagerSummaryEmail({
          managerName: row.manager_name || row.full_name || "Gestor",
          period,
          disbursements: Number(row.disbursements || 0),
          repayments: Number(row.repayments || 0),
          activeClients: Number(row.active_clients || 0),
        });
        await sendClientEmail({
          companyId,
          clientId: null,
          recipientEmail: email,
          messageType: "manager_summary",
          subject,
          body,
          referenceType: "portfolio",
          referenceId: null,
        });
        sent += 1;
      }
    }
    return { sent };
  } catch (error) {
    logger.error("Weekly manager summary failed", { error: error instanceof Error ? error.message : error });
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

