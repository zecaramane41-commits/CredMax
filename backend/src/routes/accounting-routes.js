import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, withTransaction } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireAccountingPermission } from "../middleware/permissions.js";
import {
  applyCompanyAccountingTemplate,
  ensureCompanyAccountingAccounts,
  getAccountingTemplateLabel,
  getAccountingTemplateOptions,
  normalizeAccountingTemplateCode,
  postDoubleEntry,
} from "../services/accounting-service.js";

export const accountingRouter = express.Router();

accountingRouter.use(requireAuth);
accountingRouter.use(requireAccountingPermission);

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

const FIXED_MORA_RATE = 0.02;

function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return raw;
}

function parseIsoDateToUtcDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function daysBetween(startDate, endDate) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
}

function normalizeMoraPolicySettings(rawPolicy) {
  const dailyEnabledRaw = rawPolicy?.mora_daily_enabled !== undefined ? Boolean(rawPolicy.mora_daily_enabled) : Boolean(rawPolicy?.moraDailyEnabled);
  const weeklyEnabledRaw = rawPolicy?.mora_weekly_enabled !== undefined ? Boolean(rawPolicy.mora_weekly_enabled) : Boolean(rawPolicy?.moraWeeklyEnabled);
  const monthlyEnabledRaw = rawPolicy?.mora_monthly_enabled !== undefined
    ? Boolean(rawPolicy.mora_monthly_enabled)
    : rawPolicy?.moraMonthlyEnabled !== undefined
      ? Boolean(rawPolicy.moraMonthlyEnabled)
      : true;

  const moraDailyEnabled = dailyEnabledRaw;
  const moraWeeklyEnabled = !moraDailyEnabled && weeklyEnabledRaw;
  const moraMonthlyEnabled = !moraDailyEnabled && !moraWeeklyEnabled && monthlyEnabledRaw;
  const moraMode = moraDailyEnabled
    ? "daily"
    : moraWeeklyEnabled
      ? "weekly"
      : moraMonthlyEnabled
        ? "monthly"
        : "none";

  return {
    moraMonthlyEnabled,
    moraWeeklyEnabled,
    moraDailyEnabled,
    moraMode,
  };
}

function resolveMoraMode(policySettings = null) {
  const policy = normalizeMoraPolicySettings(policySettings || {});
  return policy.moraMode || "none";
}

function resolvePenaltyRateDecimal(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric / 100;
  return FIXED_MORA_RATE;
}

function resolveMoraPeriods({ moraMode, daysOverdue, dueDate, referenceDate, disbursedDate }) {
  const overdueDays = Number(daysOverdue || 0);
  if (!Number.isFinite(overdueDays) || overdueDays <= 0) return 0;
  if (moraMode === "daily") return Math.max(1, Math.floor(overdueDays));
  if (moraMode === "weekly") return Math.max(1, Math.ceil(overdueDays / 7));
  if (moraMode === "monthly") {
    const ref = referenceDate instanceof Date ? referenceDate : parseIsoDateToUtcDate(referenceDate);
    const disb = disbursedDate instanceof Date ? disbursedDate : parseIsoDateToUtcDate(disbursedDate) || parseIsoDateToUtcDate(dueDate);
    if (!ref || !disb) return 0;
    const daysSinceDisbursement = Math.max(0, daysBetween(disb, ref));
    if (daysSinceDisbursement < 30) return 0;
    return Math.max(1, Math.floor(daysSinceDisbursement / 30));
  }
  return 0;
}

function calculateMora(balance, dailyPenaltyRate, daysOverdue, options = {}) {
  const moraEnabled = options?.moraEnabled !== undefined ? Boolean(options.moraEnabled) : true;
  if (!moraEnabled) return 0;
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  if (!Number.isFinite(daysOverdue) || daysOverdue <= 0) return 0;
  const moraMode = options?.moraMode || resolveMoraMode(options?.policySettings || null);
  const periods = resolveMoraPeriods({
    moraMode,
    daysOverdue,
    dueDate: options?.dueDate,
    referenceDate: options?.referenceDate,
    disbursedDate: options?.disbursedDate,
  });
  if (periods <= 0) return 0;
  const penaltyRate = resolvePenaltyRateDecimal(dailyPenaltyRate);
  return round2(Number(balance || 0) * penaltyRate * periods);
}

function calculateNetMora(balance, dailyPenaltyRate, daysOverdue, waivedTotal, options = {}) {
  return Math.max(0, round2(calculateMora(balance, dailyPenaltyRate, daysOverdue, options) - (Number(waivedTotal) || 0)));
}

function normalizePaymentFrequencyValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["diario", "semanal", "quinzenal", "mensal"].includes(normalized)) return normalized;
  return "mensal";
}

function isMoraEnabledForFrequency(_paymentFrequency, policySettings) {
  return resolveMoraMode(policySettings) !== "none";
}

function parsePositiveInt(value, fallback, { min = 1, max = 500 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function resolveAccountClassFromCode(code) {
  const classDigit = String(code || "").trim().slice(0, 1);
  if (/^[1-9]$/.test(classDigit)) return classDigit;
  return "";
}

const CASH_EXPENSE_CATEGORIES = [
  "salario",
  "comissao",
  "agua",
  "luz",
  "renda",
  "mobilidade",
  "comunicacao",
  "internet",
  "ajuda_custo",
  "bonus",
  "manutencao",
  "combustivel",
  "impostos",
  "outros",
];

const CASH_EXPENSE_CATEGORY_LABELS = {
  salario: "Salario",
  comissao: "Comissao",
  agua: "Agua",
  luz: "Luz",
  renda: "Renda",
  mobilidade: "Mobilidade",
  comunicacao: "Comunicacao",
  internet: "Internet",
  ajuda_custo: "Ajuda de Custo",
  bonus: "Bonus",
  manutencao: "Manutencao",
  combustivel: "Combustivel",
  impostos: "Impostos",
  outros: "Outros",
};

const CASH_OUTFLOW_SOURCES = [
  "caixa_geral",
  "capital",
  "juros",
  "preparos",
  "capitalizacao",
  "mora",
  "prestacoes",
];

const CASH_OUTFLOW_SOURCE_LABELS = {
  caixa_geral: "Caixa Geral",
  capital: "Capital",
  juros: "Juros",
  preparos: "Preparos",
  capitalizacao: "Capitalizacao",
  mora: "Mora",
  prestacoes: "Prestacoes",
};

const MANAGER_LINKED_EXPENSE_CATEGORIES = new Set([
  "salario",
  "comissao",
  "mobilidade",
  "comunicacao",
  "internet",
  "ajuda_custo",
  "bonus",
]);

const CASH_EXPENSE_CATEGORY_ACCOUNT_CODE = {
  salario: "5110",
  comissao: "5120",
  agua: "5130",
  luz: "5130",
  renda: "5140",
  mobilidade: "5150",
  manutencao: "5150",
  combustivel: "5150",
  comunicacao: "5160",
  internet: "5160",
  ajuda_custo: "5170",
  bonus: "5170",
  impostos: "5180",
  outros: "5180",
};
const CASH_EXPENSE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXPENSE_ATTACHMENT_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CASH_EXPENSE_ATTACHMENTS_ROOT = path.resolve(__dirname, "../../uploads/cash-expenses");

function normalizeExpenseCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (CASH_EXPENSE_CATEGORIES.includes(normalized)) return normalized;
  return null;
}

function isManagerLinkedExpenseCategory(category) {
  return MANAGER_LINKED_EXPENSE_CATEGORIES.has(String(category || "").trim().toLowerCase());
}

function getExpenseCategoryLabel(category) {
  return CASH_EXPENSE_CATEGORY_LABELS[String(category || "").trim().toLowerCase()] || "Outros";
}

function normalizeOutflowSource(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "caixa_geral";
  if (CASH_OUTFLOW_SOURCES.includes(normalized)) return normalized;
  return null;
}

function getOutflowSourceLabel(source) {
  return CASH_OUTFLOW_SOURCE_LABELS[String(source || "").trim().toLowerCase()] || "Caixa Geral";
}

function normalizeExpenseWorkflowStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["pending_admin", "executed", "rejected"].includes(normalized)) return normalized;
  if (!normalized || normalized === "all") return "all";
  return null;
}

function isAdminRole(role) {
  return String(role || "").trim().toLowerCase() === "admin";
}

function isManagerRole(role) {
  return String(role || "").trim().toLowerCase() === "manager";
}

function safeFileName(name) {
  return String(name || "anexo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "anexo";
}

function mimeExtension(mimeType) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  return "bin";
}

function normalizeBase64Input(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const marker = "base64,";
  const markerIndex = raw.indexOf(marker);
  return markerIndex >= 0 ? raw.slice(markerIndex + marker.length) : raw;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function normalizeCashFlowPolicy(row) {
  const managerAutoApprovalLimitRaw = Number(row?.manager_auto_approval_limit ?? row?.managerAutoApprovalLimit);
  const managerAutoApprovalLimit = Number.isFinite(managerAutoApprovalLimitRaw) && managerAutoApprovalLimitRaw > 0
    ? round2(managerAutoApprovalLimitRaw)
    : 30000;
  const categoriesRequireAdmin = normalizeStringArray(row?.categories_require_admin ?? row?.categoriesRequireAdmin);
  return {
    managerAutoApprovalLimit,
    categoriesRequireAdmin,
    categoriesRequireAdminSet: new Set(categoriesRequireAdmin),
  };
}

async function loadCashFlowPolicy(dbClient, companyId) {
  const result = await dbClient.query(
    `
    SELECT manager_auto_approval_limit, categories_require_admin
    FROM cash_flow_policies
    WHERE company_id = $1
    LIMIT 1
    `,
    [companyId],
  );
  if (result.rows[0]) {
    return normalizeCashFlowPolicy(result.rows[0]);
  }

  await dbClient.query(
    `
    INSERT INTO cash_flow_policies (company_id)
    VALUES ($1)
    ON CONFLICT (company_id) DO NOTHING
    `,
    [companyId],
  );
  return normalizeCashFlowPolicy({});
}

function resolveExpenseWorkflow({ actorRole, amount, category, policy }) {
  const admin = isAdminRole(actorRole);
  if (admin) {
    return {
      workflowStatus: "executed",
      requiredApprovalRole: null,
      requiresApproval: false,
      reason: null,
    };
  }

  const requireByCategory = policy.categoriesRequireAdminSet.has(String(category || "").toLowerCase());
  const requireByAmount = Number(amount || 0) > Number(policy.managerAutoApprovalLimit || 0);
  const requiresApproval = requireByCategory || requireByAmount;

  if (!requiresApproval) {
    return {
      workflowStatus: "executed",
      requiredApprovalRole: null,
      requiresApproval: false,
      reason: null,
    };
  }

  return {
    workflowStatus: "pending_admin",
    requiredApprovalRole: "admin",
    requiresApproval: true,
    reason: requireByCategory
      ? "Categoria exige aprovacao de admin."
      : `Valor acima do limite automatico (${round2(policy.managerAutoApprovalLimit)} MT).`,
  };
}

async function resolveExpenseCostCenterId(dbClient, { companyId, costCenterId }) {
  const requestedId = Number(costCenterId);
  if (Number.isInteger(requestedId) && requestedId > 0) {
    const selected = await dbClient.query(
      `
      SELECT id
      FROM cash_cost_centers
      WHERE id = $1
        AND company_id = $2
        AND is_active = true
      LIMIT 1
      `,
      [requestedId, companyId],
    );
    if (!selected.rows[0]) {
      return { error: { status: 404, message: "Centro de custo informado nao existe ou esta inativo." } };
    }
    return { id: Number(selected.rows[0].id) };
  }

  const fallback = await dbClient.query(
    `
    SELECT id
    FROM cash_cost_centers
    WHERE company_id = $1
      AND is_active = true
    ORDER BY CASE WHEN code = 'OPER' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
    `,
    [companyId],
  );
  return { id: fallback.rows[0] ? Number(fallback.rows[0].id) : null };
}

async function insertCashExpenseAudit(dbClient, { companyId, cashExpenseId, action, actorUserId, actorName, payload }) {
  await dbClient.query(
    `
    INSERT INTO cash_expense_audit (
      company_id,
      cash_expense_id,
      action,
      actor_user_id,
      actor_name,
      payload
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      companyId,
      cashExpenseId,
      action,
      actorUserId || null,
      actorName || null,
      JSON.stringify(payload || {}),
    ],
  );
}

async function postExpenseAccountingEntry(dbClient, {
  companyId,
  expenseId,
  expenseDate,
  category,
  amount,
  description,
  payeeName,
  outflowSource,
  actorUserId,
  actorName,
}) {
  const accountCode = CASH_EXPENSE_CATEGORY_ACCOUNT_CODE[category] || "5180";
  const sourceLabel = getOutflowSourceLabel(outflowSource);
  const entry = await postDoubleEntry(dbClient, {
    companyId,
    entryDate: expenseDate,
    eventType: "despesa",
    description: `Despesa ${getExpenseCategoryLabel(category)} - ${payeeName} (Origem: ${sourceLabel})`,
    referenceType: "cash_expense",
    referenceId: Number(expenseId),
    actorUserId,
    actorName,
    lines: [
      { accountCode, debit: round2(amount), credit: 0, memo: description || `Despesa de ${getExpenseCategoryLabel(category)}` },
      { accountCode: "1110", debit: 0, credit: round2(amount), memo: `Saida de caixa - ${payeeName} (${sourceLabel})` },
    ],
  });

  await dbClient.query(
    `
    UPDATE cash_expenses
    SET accounting_entry_id = $1,
        updated_at = NOW()
    WHERE id = $2 AND company_id = $3
    `,
    [entry.entryId, Number(expenseId), companyId],
  );
  return Number(entry.entryId);
}

accountingRouter.get("/accounts", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar contas." });
    await withTransaction(async (dbClient) => {
      await ensureCompanyAccountingAccounts(dbClient, scope.companyId);
    });
    const accounts = await query(
      `
      SELECT id, code, name, account_type, is_active
      FROM accounting_accounts
      WHERE company_id = $1
      ORDER BY code ASC
      `,
      [scope.companyId],
    );
    return res.json({
      accounts: accounts.rows.map((row) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name,
        accountType: row.account_type,
        isActive: Boolean(row.is_active),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/account-templates", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar template contabil." });

    const companyResult = await query(
      `
      SELECT accounting_template_code
      FROM companies
      WHERE id = $1
      LIMIT 1
      `,
      [scope.companyId],
    );
    const currentTemplateCode = normalizeAccountingTemplateCode(companyResult.rows[0]?.accounting_template_code) || "microcredito";
    const options = getAccountingTemplateOptions();

    return res.json({
      companyId: scope.companyId,
      currentTemplate: {
        code: currentTemplateCode,
        label: getAccountingTemplateLabel(currentTemplateCode),
      },
      options,
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.post("/account-templates/apply", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para aplicar template contabil." });

    const templateCodeRaw = String(req.body?.templateCode || "").trim();
    const templateCode = normalizeAccountingTemplateCode(templateCodeRaw);
    if (!templateCode) {
      return res.status(400).json({ message: "Template contabil invalido." });
    }

    const result = await withTransaction(async (dbClient) => applyCompanyAccountingTemplate(dbClient, scope.companyId, templateCode));
    return res.json({
      message: `Template contabil ${result.templateLabel} aplicado com sucesso.`,
      template: {
        code: result.templateCode,
        label: result.templateLabel,
      },
      accountsCount: result.accountsCount,
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/ledger", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar razao contabil." });
    await withTransaction(async (dbClient) => {
      await ensureCompanyAccountingAccounts(dbClient, scope.companyId);
    });
    const from = parseIsoDate(req.query.from) || "1900-01-01";
    const to = parseIsoDate(req.query.to) || "2999-12-31";
    const accountCodeRaw = String(req.query.accountCode || "").trim();
    const accountCode = accountCodeRaw.toLowerCase() === "all" ? "" : accountCodeRaw;
    const eventTypeRaw = String(req.query.eventType || "").trim().toLowerCase();
    const allowedEventTypes = new Set([
      "desembolso",
      "pagamento",
      "mora",
      "estorno",
      "abatimento",
      "capitalizacao",
      "perdao_mora",
      "despesa",
      "liquidacao_antecipada",
      "reestruturacao_contrato",
    ]);
    const eventType = eventTypeRaw === "all" || !eventTypeRaw ? "" : eventTypeRaw;
    if (eventType && !allowedEventTypes.has(eventType)) {
      return res.status(400).json({ message: "Tipo de evento contabil invalido." });
    }
    const page = parsePositiveInt(req.query.page, 1, { min: 1, max: 100000 });
    const pageSize = parsePositiveInt(req.query.pageSize, 100, { min: 1, max: 500 });

    const whereParts = ["e.company_id = $1", "e.entry_date BETWEEN $2::date AND $3::date"];
    const params = [scope.companyId, from, to];
    if (accountCode) {
      params.push(accountCode);
      whereParts.push(`l.account_code = $${params.length}`);
    }
    if (eventType) {
      params.push(eventType);
      whereParts.push(`e.event_type = $${params.length}`);
    }
    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    const useAccountFilter = Boolean(accountCode);

    const countResult = await query(
      `
      SELECT COUNT(*)::INT AS total
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      ${whereSql}
      `,
      params,
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const safeOffset = (safePage - 1) * pageSize;

    const listParams = [...params, pageSize, safeOffset];
    const limitPlaceholder = `$${listParams.length - 1}`;
    const offsetPlaceholder = `$${listParams.length}`;
    const rowsResult = await query(
      `
      SELECT
        e.id AS entry_id,
        e.entry_date,
        e.event_type,
        e.description,
        e.reference_type,
        e.reference_id,
        e.loan_id,
        e.created_by_name,
        l.id AS line_id,
        l.account_code,
        l.account_name,
        l.debit,
        l.credit,
        l.memo
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      ${whereSql}
      ORDER BY e.entry_date ASC, e.id ASC, l.id ASC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
      `,
      listParams,
    );

    const accountListParams = [scope.companyId];
    if (accountCode) accountListParams.push(accountCode);
    const accountListResult = await query(
      `
      SELECT code, name, account_type, is_active
      FROM accounting_accounts
      WHERE company_id = $1
        AND is_active = true
        ${accountCode ? "AND code = $2" : ""}
      ORDER BY code ASC
      `,
      accountListParams,
    );

    const accountMovementResult = await query(
      `
      SELECT
        l.account_code,
        l.account_name,
        SUM(l.debit)::numeric(14,2) AS total_debit,
        SUM(l.credit)::numeric(14,2) AS total_credit
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      ${whereSql}
      GROUP BY l.account_code, l.account_name
      ORDER BY l.account_code ASC
      `,
      params,
    );

    const totalsResult = await query(
      `
      SELECT
        COALESCE(SUM(l.debit), 0)::numeric(14,2) AS total_debit,
        COALESCE(SUM(l.credit), 0)::numeric(14,2) AS total_credit,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.debit ELSE 0 END), 0)::numeric(14,2) AS cash_in,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.credit ELSE 0 END), 0)::numeric(14,2) AS cash_out
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      ${whereSql}
      `,
      params,
    );

    const summaryByEventResult = await query(
      `
      SELECT
        e.event_type,
        COALESCE(SUM(l.debit), 0)::numeric(14,2) AS total_debit,
        COALESCE(SUM(l.credit), 0)::numeric(14,2) AS total_credit,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.debit ELSE 0 END), 0)::numeric(14,2) AS cash_in,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.credit ELSE 0 END), 0)::numeric(14,2) AS cash_out
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      ${whereSql}
      GROUP BY e.event_type
      ORDER BY e.event_type ASC
      `,
      params,
    );

    const weeklyClosingResult = await query(
      `
      SELECT
        DATE_TRUNC('week', e.entry_date)::date AS period_start,
        COALESCE(SUM(l.debit), 0)::numeric(14,2) AS total_debit,
        COALESCE(SUM(l.credit), 0)::numeric(14,2) AS total_credit,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.debit ELSE 0 END), 0)::numeric(14,2) AS cash_in,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.credit ELSE 0 END), 0)::numeric(14,2) AS cash_out
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      ${whereSql}
      GROUP BY DATE_TRUNC('week', e.entry_date)
      ORDER BY DATE_TRUNC('week', e.entry_date) ASC
      `,
      params,
    );

    const monthlyClosingResult = await query(
      `
      SELECT
        DATE_TRUNC('month', e.entry_date)::date AS period_start,
        COALESCE(SUM(l.debit), 0)::numeric(14,2) AS total_debit,
        COALESCE(SUM(l.credit), 0)::numeric(14,2) AS total_credit,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.debit ELSE 0 END), 0)::numeric(14,2) AS cash_in,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.credit ELSE 0 END), 0)::numeric(14,2) AS cash_out
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      ${whereSql}
      GROUP BY DATE_TRUNC('month', e.entry_date)
      ORDER BY DATE_TRUNC('month', e.entry_date) ASC
      `,
      params,
    );

    const yearlyClosingResult = await query(
      `
      SELECT
        DATE_TRUNC('year', e.entry_date)::date AS period_start,
        COALESCE(SUM(l.debit), 0)::numeric(14,2) AS total_debit,
        COALESCE(SUM(l.credit), 0)::numeric(14,2) AS total_credit,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.debit ELSE 0 END), 0)::numeric(14,2) AS cash_in,
        COALESCE(SUM(CASE WHEN l.account_code = '1110' THEN l.credit ELSE 0 END), 0)::numeric(14,2) AS cash_out
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      ${whereSql}
      GROUP BY DATE_TRUNC('year', e.entry_date)
      ORDER BY DATE_TRUNC('year', e.entry_date) ASC
      `,
      params,
    );

    let runningBalance = 0;
    const lines = rowsResult.rows.map((row) => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      if (useAccountFilter) {
        runningBalance = round2(runningBalance + debit - credit);
      }
      return {
        entryId: Number(row.entry_id),
        lineId: Number(row.line_id),
        entryDate: row.entry_date,
        eventType: row.event_type,
        description: row.description,
        referenceType: row.reference_type || null,
        referenceId: row.reference_id ? Number(row.reference_id) : null,
        loanId: row.loan_id ? Number(row.loan_id) : null,
        createdByName: row.created_by_name || "Sistema",
        accountCode: row.account_code,
        accountName: row.account_name,
        debit,
        credit,
        memo: row.memo || "",
        runningBalance: useAccountFilter ? runningBalance : null,
      };
    });

    const movementByAccountMap = new Map(
      accountMovementResult.rows.map((row) => [
        String(row.account_code),
        {
          totalDebit: round2(Number(row.total_debit || 0)),
          totalCredit: round2(Number(row.total_credit || 0)),
          name: row.account_name || "",
        },
      ]),
    );

    const summaryByAccount = accountListResult.rows.map((row) => {
      const accountCodeValue = String(row.code || "");
      const movement = movementByAccountMap.get(accountCodeValue);
      const totalDebit = movement ? movement.totalDebit : 0;
      const totalCredit = movement ? movement.totalCredit : 0;
      return {
        accountCode: accountCodeValue,
        accountName: row.name || movement?.name || "",
        accountType: row.account_type || "asset",
        accountClass: resolveAccountClassFromCode(accountCodeValue),
        totalDebit,
        totalCredit,
        netMovement: round2(totalDebit - totalCredit),
      };
    });

    for (const [code, movement] of movementByAccountMap.entries()) {
      if (summaryByAccount.some((row) => row.accountCode === code)) continue;
      const totalDebit = round2(Number(movement.totalDebit || 0));
      const totalCredit = round2(Number(movement.totalCredit || 0));
      summaryByAccount.push({
        accountCode: code,
        accountName: movement.name || "",
        accountType: "asset",
        accountClass: resolveAccountClassFromCode(code),
        totalDebit,
        totalCredit,
        netMovement: round2(totalDebit - totalCredit),
      });
    }
    summaryByAccount.sort((a, b) => String(a.accountCode).localeCompare(String(b.accountCode), "pt"));

    const totalsRow = totalsResult.rows[0] || {};
    const totalDebit = round2(Number(totalsRow.total_debit || 0));
    const totalCredit = round2(Number(totalsRow.total_credit || 0));
    const cashIn = round2(Number(totalsRow.cash_in || 0));
    const cashOut = round2(Number(totalsRow.cash_out || 0));

    const mapClosingRows = (rows) =>
      rows.map((row) => {
        const rowTotalDebit = round2(Number(row.total_debit || 0));
        const rowTotalCredit = round2(Number(row.total_credit || 0));
        const rowCashIn = round2(Number(row.cash_in || 0));
        const rowCashOut = round2(Number(row.cash_out || 0));
        return {
          periodStart: row.period_start,
          totalDebit: rowTotalDebit,
          totalCredit: rowTotalCredit,
          netMovement: round2(rowTotalDebit - rowTotalCredit),
          cashIn: rowCashIn,
          cashOut: rowCashOut,
          netCash: round2(rowCashIn - rowCashOut),
        };
      });

    return res.json({
      filters: { from, to, accountCode: accountCode || "all", eventType: eventType || "all" },
      pagination: { page: safePage, pageSize, total, totalPages },
      lines,
      totals: {
        totalDebit,
        totalCredit,
        netMovement: round2(totalDebit - totalCredit),
        cashIn,
        cashOut,
        netCash: round2(cashIn - cashOut),
      },
      summaryByEvent: summaryByEventResult.rows.map((row) => {
        const eventTotalDebit = round2(Number(row.total_debit || 0));
        const eventTotalCredit = round2(Number(row.total_credit || 0));
        const eventCashIn = round2(Number(row.cash_in || 0));
        const eventCashOut = round2(Number(row.cash_out || 0));
        return {
          eventType: row.event_type,
          totalDebit: eventTotalDebit,
          totalCredit: eventTotalCredit,
          netMovement: round2(eventTotalDebit - eventTotalCredit),
          cashIn: eventCashIn,
          cashOut: eventCashOut,
          netCash: round2(eventCashIn - eventCashOut),
        };
      }),
      closingByPeriod: {
        weekly: mapClosingRows(weeklyClosingResult.rows),
        monthly: mapClosingRows(monthlyClosingResult.rows),
        yearly: mapClosingRows(yearlyClosingResult.rows),
      },
      summaryByAccount,
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/cash-flow/overview", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar fluxo de caixa." });

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();
    const from = fromRaw ? parseIsoDate(fromRaw) : null;
    const to = toRaw ? parseIsoDate(toRaw) : null;
    if ((fromRaw && !from) || (toRaw && !to)) {
      return res.status(400).json({ message: "Intervalo de datas invalido. Use formato YYYY-MM-DD." });
    }
    if (from && to) {
      const fromDate = parseIsoDateToUtcDate(from);
      const toDate = parseIsoDateToUtcDate(to);
      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        return res.status(400).json({ message: "Data inicial nao pode ser maior que data final." });
      }
    }

    const params = [scope.companyId, from, to];
    const summaryResult = await query(
      `
      WITH repayments AS (
        SELECT
          COALESCE(SUM(amount_received), 0)::NUMERIC AS cash_in,
          COALESCE(SUM(amount_applied), 0)::NUMERIC AS installments_paid,
          COALESCE(SUM(principal_applied), 0)::NUMERIC AS principal_received,
          COALESCE(SUM(interest_applied), 0)::NUMERIC AS interest_received,
          COALESCE(SUM(mora_applied), 0)::NUMERIC AS mora_received
        FROM loan_repayments
        WHERE company_id = $1
          AND ($2::date IS NULL OR payment_date >= $2::date)
          AND ($3::date IS NULL OR payment_date <= $3::date)
      ),
      disbursements AS (
        SELECT
          COALESCE(SUM(disbursement_net_amount), 0)::NUMERIC AS disbursed_net,
          COALESCE(SUM(administrative_fee_amount), 0)::NUMERIC AS admin_fees
        FROM loans
        WHERE company_id = $1
          AND disbursement_status = 'disbursed'
          AND ($2::date IS NULL OR disbursed_on >= $2::date)
          AND ($3::date IS NULL OR disbursed_on <= $3::date)
      ),
      financial_events AS (
        SELECT
          COALESCE(SUM(CASE WHEN event_type = 'capitalizacao' THEN amount ELSE 0 END), 0)::NUMERIC AS capitalized_total
        FROM loan_financial_events
        WHERE company_id = $1
          AND workflow_status IN ('executed', 'approved')
          AND ($2::date IS NULL OR created_at::date >= $2::date)
          AND ($3::date IS NULL OR created_at::date <= $3::date)
      ),
      expenses AS (
        SELECT COALESCE(SUM(amount), 0)::NUMERIC AS expenses_total
        FROM cash_expenses
        WHERE company_id = $1
          AND workflow_status = 'executed'
          AND ($2::date IS NULL OR expense_date >= $2::date)
          AND ($3::date IS NULL OR expense_date <= $3::date)
      )
      SELECT
        repayments.cash_in,
        repayments.installments_paid,
        repayments.principal_received,
        repayments.interest_received,
        repayments.mora_received,
        disbursements.disbursed_net,
        disbursements.admin_fees,
        financial_events.capitalized_total,
        expenses.expenses_total
      FROM repayments
      CROSS JOIN disbursements
      CROSS JOIN financial_events
      CROSS JOIN expenses
      `,
      params,
    );

    const monthlyResult = await query(
      `
      WITH repayments AS (
        SELECT
          DATE_TRUNC('month', payment_date)::date AS period,
          COALESCE(SUM(amount_received), 0)::NUMERIC AS cash_in,
          COALESCE(SUM(amount_applied), 0)::NUMERIC AS installments_paid,
          COALESCE(SUM(principal_applied), 0)::NUMERIC AS principal_received,
          COALESCE(SUM(interest_applied), 0)::NUMERIC AS interest_received,
          COALESCE(SUM(mora_applied), 0)::NUMERIC AS mora_received
        FROM loan_repayments
        WHERE company_id = $1
          AND ($2::date IS NULL OR payment_date >= $2::date)
          AND ($3::date IS NULL OR payment_date <= $3::date)
        GROUP BY DATE_TRUNC('month', payment_date)
      ),
      disbursements AS (
        SELECT
          DATE_TRUNC('month', disbursed_on)::date AS period,
          COALESCE(SUM(disbursement_net_amount), 0)::NUMERIC AS disbursed_net
        FROM loans
        WHERE company_id = $1
          AND disbursement_status = 'disbursed'
          AND ($2::date IS NULL OR disbursed_on >= $2::date)
          AND ($3::date IS NULL OR disbursed_on <= $3::date)
        GROUP BY DATE_TRUNC('month', disbursed_on)
      ),
      expenses AS (
        SELECT
          DATE_TRUNC('month', expense_date)::date AS period,
          COALESCE(SUM(amount), 0)::NUMERIC AS expenses_total
        FROM cash_expenses
        WHERE company_id = $1
          AND workflow_status = 'executed'
          AND ($2::date IS NULL OR expense_date >= $2::date)
          AND ($3::date IS NULL OR expense_date <= $3::date)
        GROUP BY DATE_TRUNC('month', expense_date)
      )
      SELECT
        TO_CHAR(COALESCE(r.period, d.period, x.period), 'YYYY-MM') AS period,
        COALESCE(r.cash_in, 0)::NUMERIC AS cash_in,
        COALESCE(r.installments_paid, 0)::NUMERIC AS installments_paid,
        COALESCE(r.principal_received, 0)::NUMERIC AS principal_received,
        COALESCE(r.interest_received, 0)::NUMERIC AS interest_received,
        COALESCE(r.mora_received, 0)::NUMERIC AS mora_received,
        COALESCE(d.disbursed_net, 0)::NUMERIC AS disbursed_net,
        COALESCE(x.expenses_total, 0)::NUMERIC AS expenses_total
      FROM repayments r
      FULL OUTER JOIN disbursements d ON d.period = r.period
      FULL OUTER JOIN expenses x ON x.period = COALESCE(r.period, d.period)
      ORDER BY COALESCE(r.period, d.period, x.period) ASC
      `,
      params,
    );

    const movementsResult = await query(
      `
      SELECT
        e.id,
        e.entry_date,
        e.event_type,
        e.description,
        COALESCE(SUM(l.debit), 0)::NUMERIC AS debit_total,
        COALESCE(SUM(l.credit), 0)::NUMERIC AS credit_total
      FROM accounting_entries e
      JOIN accounting_entry_lines l ON l.entry_id = e.id
      WHERE e.company_id = $1
        AND ($2::date IS NULL OR e.entry_date >= $2::date)
        AND ($3::date IS NULL OR e.entry_date <= $3::date)
      GROUP BY e.id, e.entry_date, e.event_type, e.description
      ORDER BY e.entry_date DESC, e.id DESC
      LIMIT 60
      `,
      params,
    );

    const expenseByCategoryResult = await query(
      `
      SELECT
        category,
        COUNT(*)::INT AS count,
        COALESCE(SUM(amount), 0)::NUMERIC AS total
      FROM cash_expenses
      WHERE company_id = $1
        AND workflow_status = 'executed'
        AND ($2::date IS NULL OR expense_date >= $2::date)
        AND ($3::date IS NULL OR expense_date <= $3::date)
      GROUP BY category
      ORDER BY category ASC
      `,
      params,
    );

    const expenseByOutflowSourceResult = await query(
      `
      SELECT
        outflow_source,
        COUNT(*)::INT AS count,
        COALESCE(SUM(amount), 0)::NUMERIC AS total
      FROM cash_expenses
      WHERE company_id = $1
        AND workflow_status = 'executed'
        AND ($2::date IS NULL OR expense_date >= $2::date)
        AND ($3::date IS NULL OR expense_date <= $3::date)
      GROUP BY outflow_source
      ORDER BY outflow_source ASC
      `,
      params,
    );

    const expenseByCostCenterResult = await query(
      `
      SELECT
        cc.id,
        cc.code,
        cc.name,
        COUNT(ce.id)::INT AS count,
        COALESCE(SUM(ce.amount), 0)::NUMERIC AS total
      FROM cash_cost_centers cc
      LEFT JOIN cash_expenses ce
        ON ce.cost_center_id = cc.id
        AND ce.company_id = $1
        AND ce.workflow_status = 'executed'
        AND ($2::date IS NULL OR ce.expense_date >= $2::date)
        AND ($3::date IS NULL OR ce.expense_date <= $3::date)
      WHERE cc.company_id = $1
        AND cc.is_active = true
      GROUP BY cc.id, cc.code, cc.name
      ORDER BY cc.code ASC
      `,
      params,
    );

    const pendingSummaryResult = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE workflow_status = 'pending_admin')::INT AS pending_admin_count,
        COALESCE(SUM(amount) FILTER (WHERE workflow_status = 'pending_admin'), 0)::NUMERIC AS pending_admin_amount
      FROM cash_expenses
      WHERE company_id = $1
        AND ($2::date IS NULL OR expense_date >= $2::date)
        AND ($3::date IS NULL OR expense_date <= $3::date)
      `,
      params,
    );

    const summary = summaryResult.rows[0] || {};
    const cashIn = Number(summary.cash_in || 0);
    const disbursedNet = Number(summary.disbursed_net || 0);
    const expensesTotal = Number(summary.expenses_total || 0);
    const cashOut = round2(disbursedNet + expensesTotal);
    const netCash = round2(cashIn - cashOut);

    const principalReceived = Number(summary.principal_received || 0);
    const interestReceived = Number(summary.interest_received || 0);
    const moraReceived = Number(summary.mora_received || 0);
    const installmentsPaid = Number(summary.installments_paid || 0);
    const adminFees = Number(summary.admin_fees || 0);
    const capitalizedTotal = Number(summary.capitalized_total || 0);

    const breakdown = [
      { key: "interest_received", label: "Juros", value: round2(interestReceived), type: "inflow" },
      { key: "mora_received", label: "Mora", value: round2(moraReceived), type: "inflow" },
      { key: "principal_received", label: "Capital Recebido", value: round2(principalReceived), type: "inflow" },
      { key: "installments_paid", label: "Prestacoes Pagas", value: round2(installmentsPaid), type: "inflow" },
      { key: "administrative_fees", label: "Preparos (Custos Adm.)", value: round2(adminFees), type: "inflow" },
      { key: "capitalized_total", label: "Capitalizacao", value: round2(capitalizedTotal), type: "adjustment" },
      { key: "disbursed_net", label: "Desembolso Liquido", value: round2(disbursedNet), type: "outflow" },
      { key: "expenses_total", label: "Despesas", value: round2(expensesTotal), type: "outflow" },
    ];

    return res.json({
      filters: { from, to },
      summary: {
        cashIn: round2(cashIn),
        cashOut,
        netCash,
        principalReceived: round2(principalReceived),
        interestReceived: round2(interestReceived),
        moraReceived: round2(moraReceived),
        installmentsPaid: round2(installmentsPaid),
        administrativeFees: round2(adminFees),
        capitalizedTotal: round2(capitalizedTotal),
        disbursedNet: round2(disbursedNet),
        expensesTotal: round2(expensesTotal),
      },
      breakdown,
      byMonth: monthlyResult.rows.map((row) => {
        const cashInMonth = Number(row.cash_in || 0);
        const disbursedMonth = Number(row.disbursed_net || 0);
        const expensesMonth = Number(row.expenses_total || 0);
        const cashOutMonth = disbursedMonth + expensesMonth;
        return {
          period: row.period,
          cashIn: round2(cashInMonth),
          cashOut: round2(cashOutMonth),
          netCash: round2(cashInMonth - cashOutMonth),
          disbursedNet: round2(disbursedMonth),
          expensesTotal: round2(expensesMonth),
          installmentsPaid: round2(Number(row.installments_paid || 0)),
          principalReceived: round2(Number(row.principal_received || 0)),
          interestReceived: round2(Number(row.interest_received || 0)),
          moraReceived: round2(Number(row.mora_received || 0)),
        };
      }),
      expenseByCategory: expenseByCategoryResult.rows.map((row) => ({
        category: row.category,
        categoryLabel: getExpenseCategoryLabel(row.category),
        count: Number(row.count || 0),
        total: round2(Number(row.total || 0)),
      })),
      expenseByOutflowSource: expenseByOutflowSourceResult.rows.map((row) => ({
        outflowSource: row.outflow_source || "caixa_geral",
        outflowSourceLabel: getOutflowSourceLabel(row.outflow_source),
        count: Number(row.count || 0),
        total: round2(Number(row.total || 0)),
      })),
      expenseByCostCenter: expenseByCostCenterResult.rows.map((row) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name,
        count: Number(row.count || 0),
        total: round2(Number(row.total || 0)),
      })),
      approvalsSummary: {
        pendingAdminCount: Number(pendingSummaryResult.rows[0]?.pending_admin_count || 0),
        pendingAdminAmount: round2(Number(pendingSummaryResult.rows[0]?.pending_admin_amount || 0)),
      },
      recentMovements: movementsResult.rows.map((row) => ({
        id: Number(row.id),
        entryDate: row.entry_date,
        eventType: row.event_type,
        description: row.description || "",
        debitTotal: round2(Number(row.debit_total || 0)),
        creditTotal: round2(Number(row.credit_total || 0)),
      })),
      expenseCategories: CASH_EXPENSE_CATEGORIES.map((category) => ({
        value: category,
        label: getExpenseCategoryLabel(category),
      })),
      outflowSources: CASH_OUTFLOW_SOURCES.map((source) => ({
        value: source,
        label: getOutflowSourceLabel(source),
      })),
      managerLinkedCategories: Array.from(MANAGER_LINKED_EXPENSE_CATEGORIES),
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/cash-flow/expenses", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar despesas." });

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();
    const categoryRaw = String(req.query.category || "all").trim().toLowerCase();
    const payeeTypeRaw = String(req.query.payeeType || "all").trim().toLowerCase();
    const workflowStatusRaw = String(req.query.workflowStatus || "all").trim().toLowerCase();
    const outflowSourceRaw = String(req.query.outflowSource || "all").trim().toLowerCase();
    const costCenterIdRaw = String(req.query.costCenterId || "all").trim().toLowerCase();
    const from = fromRaw ? parseIsoDate(fromRaw) : null;
    const to = toRaw ? parseIsoDate(toRaw) : null;
    if ((fromRaw && !from) || (toRaw && !to)) {
      return res.status(400).json({ message: "Intervalo de datas invalido. Use formato YYYY-MM-DD." });
    }
    if (from && to) {
      const fromDate = parseIsoDateToUtcDate(from);
      const toDate = parseIsoDateToUtcDate(to);
      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        return res.status(400).json({ message: "Data inicial nao pode ser maior que data final." });
      }
    }

    const category = categoryRaw === "all" ? "all" : normalizeExpenseCategory(categoryRaw);
    if (!category) {
      return res.status(400).json({ message: "Categoria de despesa invalida." });
    }
    const payeeType = ["all", "manager", "entity"].includes(payeeTypeRaw) ? payeeTypeRaw : null;
    if (!payeeType) {
      return res.status(400).json({ message: "Filtro de entidade invalido." });
    }
    const workflowStatus = normalizeExpenseWorkflowStatus(workflowStatusRaw);
    if (!workflowStatus) {
      return res.status(400).json({ message: "Filtro de workflow invalido." });
    }
    const outflowSource = outflowSourceRaw === "all" ? "all" : normalizeOutflowSource(outflowSourceRaw);
    if (!outflowSource) {
      return res.status(400).json({ message: "Filtro de origem de saida invalido." });
    }

    let costCenterFilterMode = "all";
    let costCenterFilterId = null;
    if (costCenterIdRaw === "all") {
      costCenterFilterMode = "all";
    } else if (costCenterIdRaw === "none") {
      costCenterFilterMode = "none";
    } else {
      const parsedCostCenterId = Number(costCenterIdRaw);
      if (!Number.isInteger(parsedCostCenterId) || parsedCostCenterId <= 0) {
        return res.status(400).json({ message: "Filtro de centro de custo invalido." });
      }
      costCenterFilterMode = "specific";
      costCenterFilterId = parsedCostCenterId;
    }

    const page = parsePositiveInt(req.query.page, 1, { min: 1, max: 100000 });
    const pageSize = parsePositiveInt(req.query.pageSize, 100, { min: 1, max: 500 });
    const whereParts = [
      "ce.company_id = $1",
      "($2::date IS NULL OR ce.expense_date >= $2::date)",
      "($3::date IS NULL OR ce.expense_date <= $3::date)",
    ];
    const params = [scope.companyId, from, to];
    if (category !== "all") {
      params.push(category);
      whereParts.push(`ce.category = $${params.length}`);
    }
    if (payeeType !== "all") {
      params.push(payeeType);
      whereParts.push(`ce.payee_type = $${params.length}`);
    }
    if (workflowStatus !== "all") {
      params.push(workflowStatus);
      whereParts.push(`ce.workflow_status = $${params.length}`);
    }
    if (outflowSource !== "all") {
      params.push(outflowSource);
      whereParts.push(`ce.outflow_source = $${params.length}`);
    }
    if (costCenterFilterMode === "specific") {
      params.push(costCenterFilterId);
      whereParts.push(`ce.cost_center_id = $${params.length}`);
    } else if (costCenterFilterMode === "none") {
      whereParts.push("ce.cost_center_id IS NULL");
    }
    const whereSql = `WHERE ${whereParts.join(" AND ")}`;

    const countResult = await query(
      `
      SELECT
        COUNT(*)::INT AS total,
        COALESCE(SUM(ce.amount), 0)::NUMERIC AS total_amount
      FROM cash_expenses ce
      ${whereSql}
      `,
      params,
    );

    const total = Number(countResult.rows[0]?.total || 0);
    const totalAmount = round2(Number(countResult.rows[0]?.total_amount || 0));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    const listParams = [...params, pageSize, offset];
    const limitPlaceholder = `$${listParams.length - 1}`;
    const offsetPlaceholder = `$${listParams.length}`;
    const listResult = await query(
      `
      SELECT
        ce.id,
        ce.expense_date,
        ce.category,
        ce.amount,
        ce.description,
        ce.payee_type,
        ce.manager_user_id,
        ce.entity_name,
        ce.note,
        ce.outflow_source,
        ce.workflow_status,
        ce.required_approval_role,
        ce.approved_by_name,
        ce.approved_at,
        ce.rejected_by_name,
        ce.rejected_at,
        ce.rejection_reason,
        ce.accounting_entry_id,
        ce.cost_center_id,
        ce.created_by_name,
        ce.created_at,
        u.full_name AS manager_name,
        cc.code AS cost_center_code,
        cc.name AS cost_center_name,
        COALESCE(att.attachments_count, 0)::INT AS attachments_count
      FROM cash_expenses ce
      LEFT JOIN users u ON u.id = ce.manager_user_id
      LEFT JOIN cash_cost_centers cc ON cc.id = ce.cost_center_id
      LEFT JOIN (
        SELECT cash_expense_id, COUNT(*)::INT AS attachments_count
        FROM cash_expense_attachments
        WHERE company_id = $1
        GROUP BY cash_expense_id
      ) att ON att.cash_expense_id = ce.id
      ${whereSql}
      ORDER BY ce.expense_date DESC, ce.id DESC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
      `,
      listParams,
    );

    const totalsByCategoryResult = await query(
      `
      SELECT
        ce.category,
        COUNT(*)::INT AS count,
        COALESCE(SUM(ce.amount), 0)::NUMERIC AS total
      FROM cash_expenses ce
      ${whereSql}
      GROUP BY ce.category
      ORDER BY ce.category ASC
      `,
      params,
    );

    const totalsByCostCenterResult = await query(
      `
      SELECT
        COALESCE(cc.id, 0)::INT AS id,
        COALESCE(cc.code, 'SEM') AS code,
        COALESCE(cc.name, 'Sem centro') AS name,
        COUNT(*)::INT AS count,
        COALESCE(SUM(ce.amount), 0)::NUMERIC AS total
      FROM cash_expenses ce
      LEFT JOIN cash_cost_centers cc ON cc.id = ce.cost_center_id
      ${whereSql}
      GROUP BY COALESCE(cc.id, 0), COALESCE(cc.code, 'SEM'), COALESCE(cc.name, 'Sem centro')
      ORDER BY COALESCE(cc.code, 'SEM') ASC
      `,
      params,
    );

    const costCentersResult = await query(
      `
      SELECT id, code, name, is_active
      FROM cash_cost_centers
      WHERE company_id = $1
      ORDER BY code ASC, id ASC
      `,
      [scope.companyId],
    );

    return res.json({
      filters: {
        from,
        to,
        category,
        payeeType,
        workflowStatus,
        outflowSource,
        costCenterId: costCenterFilterMode === "specific" ? String(costCenterFilterId) : costCenterFilterMode,
      },
      pagination: { page: safePage, pageSize, total, totalPages },
      totals: {
        total,
        totalAmount,
      },
      rows: listResult.rows.map((row) => ({
        id: Number(row.id),
        expenseDate: row.expense_date,
        category: row.category,
        categoryLabel: getExpenseCategoryLabel(row.category),
        amount: round2(Number(row.amount || 0)),
        description: row.description || "",
        payeeType: row.payee_type,
        managerUserId: row.manager_user_id ? Number(row.manager_user_id) : null,
        managerName: row.manager_name || "",
        entityName: row.entity_name || "",
        payeeName: row.payee_type === "manager" ? (row.manager_name || "Gestor") : (row.entity_name || "Entidade"),
        note: row.note || "",
        outflowSource: row.outflow_source || "caixa_geral",
        outflowSourceLabel: getOutflowSourceLabel(row.outflow_source),
        workflowStatus: row.workflow_status,
        requiredApprovalRole: row.required_approval_role || null,
        approvedByName: row.approved_by_name || "",
        approvedAt: row.approved_at || null,
        rejectedByName: row.rejected_by_name || "",
        rejectedAt: row.rejected_at || null,
        rejectionReason: row.rejection_reason || "",
        accountingEntryId: row.accounting_entry_id ? Number(row.accounting_entry_id) : null,
        costCenterId: row.cost_center_id ? Number(row.cost_center_id) : null,
        costCenterCode: row.cost_center_code || "",
        costCenterName: row.cost_center_name || "",
        attachmentsCount: Number(row.attachments_count || 0),
        createdByName: row.created_by_name || "Sistema",
        createdAt: row.created_at,
      })),
      totalsByCategory: totalsByCategoryResult.rows.map((row) => ({
        category: row.category,
        categoryLabel: getExpenseCategoryLabel(row.category),
        count: Number(row.count || 0),
        total: round2(Number(row.total || 0)),
      })),
      totalsByCostCenter: totalsByCostCenterResult.rows.map((row) => ({
        id: Number(row.id || 0),
        code: row.code || "SEM",
        name: row.name || "Sem centro",
        count: Number(row.count || 0),
        total: round2(Number(row.total || 0)),
      })),
      costCenters: costCentersResult.rows.map((row) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name,
        isActive: Boolean(row.is_active),
      })),
      expenseCategories: CASH_EXPENSE_CATEGORIES.map((value) => ({
        value,
        label: getExpenseCategoryLabel(value),
      })),
      outflowSources: CASH_OUTFLOW_SOURCES.map((source) => ({
        value: source,
        label: getOutflowSourceLabel(source),
      })),
      managerLinkedCategories: Array.from(MANAGER_LINKED_EXPENSE_CATEGORIES),
      workflowStatuses: [
        { value: "all", label: "Todos" },
        { value: "pending_admin", label: "Pendente Admin" },
        { value: "executed", label: "Executado" },
        { value: "rejected", label: "Rejeitado" },
      ],
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.post("/cash-flow/expenses", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para registar despesas." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!(isAdminRole(role) || isManagerRole(role))) {
      return res.status(403).json({ message: "Apenas admin ou manager podem registar despesas." });
    }

    const expenseDateRaw = String(req.body?.expenseDate || "").trim();
    const expenseDate = expenseDateRaw ? parseIsoDate(expenseDateRaw) : new Date().toISOString().slice(0, 10);
    if (!expenseDate) return res.status(400).json({ message: "Data da despesa invalida." });

    const category = normalizeExpenseCategory(req.body?.category);
    if (!category) return res.status(400).json({ message: "Categoria de despesa invalida." });

    const outflowSource = normalizeOutflowSource(req.body?.outflowSource);
    if (!outflowSource) {
      return res.status(400).json({ message: "Origem de saida invalida." });
    }

    const description = String(req.body?.description || "").trim();
    const note = String(req.body?.note || "").trim();
    const costCenterIdRaw = req.body?.costCenterId;
    const actorUserId = Number(req.user?.sub) || null;
    const actorName = req.user?.name || null;
    const managerCategory = isManagerLinkedExpenseCategory(category);
    const isAdmin = isAdminRole(role);
    const requestedAmount = Number(req.body?.amount);

    const rawManagerAllocations = Array.isArray(req.body?.managerAllocations) ? req.body.managerAllocations : [];
    const managerAllocationMap = new Map();
    for (const item of rawManagerAllocations) {
      const managerUserId = Number(item?.managerUserId);
      const allocationAmount = round2(Number(item?.amount || 0));
      if (!Number.isInteger(managerUserId) || managerUserId <= 0) continue;
      if (!Number.isFinite(allocationAmount) || allocationAmount <= 0) continue;
      managerAllocationMap.set(managerUserId, round2((managerAllocationMap.get(managerUserId) || 0) + allocationAmount));
    }
    const managerAllocations = Array.from(managerAllocationMap.entries()).map(([managerUserId, amount]) => ({
      managerUserId: Number(managerUserId),
      amount: round2(Number(amount || 0)),
    }));

    const result = await withTransaction(async (dbClient) => {
      const policy = await loadCashFlowPolicy(dbClient, scope.companyId);
      const costCenterSelection = await resolveExpenseCostCenterId(dbClient, {
        companyId: scope.companyId,
        costCenterId: costCenterIdRaw,
      });
      if (costCenterSelection?.error) {
        return costCenterSelection;
      }

      let costCenterCode = "";
      let costCenterName = "";
      if (costCenterSelection?.id) {
        const centerResult = await dbClient.query(
          `
          SELECT id, code, name
          FROM cash_cost_centers
          WHERE id = $1 AND company_id = $2
          LIMIT 1
          `,
          [costCenterSelection.id, scope.companyId],
        );
        if (centerResult.rows[0]) {
          costCenterCode = centerResult.rows[0].code || "";
          costCenterName = centerResult.rows[0].name || "";
        }
      }

      const createExpense = async ({ amount, payeeType, managerUserId = null, managerName = "", entityName = "" }) => {
        const workflow = resolveExpenseWorkflow({ actorRole: role, amount, category, policy });
        const insertedExpense = await dbClient.query(
          `
          INSERT INTO cash_expenses (
            company_id,
            expense_date,
            category,
            amount,
            description,
            payee_type,
            manager_user_id,
            entity_name,
            note,
            outflow_source,
            workflow_status,
            required_approval_role,
            cost_center_id,
            created_by_user_id,
            created_by_name
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING
            id,
            expense_date,
            category,
            amount,
            description,
            payee_type,
            manager_user_id,
            entity_name,
            note,
            outflow_source,
            workflow_status,
            required_approval_role,
            approved_by_name,
            approved_at,
            rejected_by_name,
            rejected_at,
            rejection_reason,
            accounting_entry_id,
            cost_center_id,
            created_by_name,
            created_at
          `,
          [
            scope.companyId,
            expenseDate,
            category,
            round2(amount),
            description || null,
            payeeType,
            managerUserId,
            entityName || null,
            note || null,
            outflowSource,
            workflow.workflowStatus,
            workflow.requiredApprovalRole,
            costCenterSelection.id,
            actorUserId,
            actorName,
          ],
        );

        const expenseRow = insertedExpense.rows[0];
        const payeeDisplay = payeeType === "manager" ? managerName : entityName;

        await insertCashExpenseAudit(dbClient, {
          companyId: scope.companyId,
          cashExpenseId: Number(expenseRow.id),
          action: "created",
          actorUserId,
          actorName,
          payload: {
            amount: round2(amount),
            category,
            payeeType,
            payeeName: payeeDisplay,
            outflowSource,
            workflowStatus: workflow.workflowStatus,
            requiredApprovalRole: workflow.requiredApprovalRole,
            costCenterId: costCenterSelection.id,
          },
        });

        if (workflow.requiresApproval) {
          await insertCashExpenseAudit(dbClient, {
            companyId: scope.companyId,
            cashExpenseId: Number(expenseRow.id),
            action: "submitted_for_approval",
            actorUserId,
            actorName,
            payload: {
              reason: workflow.reason,
              requiredApprovalRole: workflow.requiredApprovalRole,
              policy: {
                managerAutoApprovalLimit: policy.managerAutoApprovalLimit,
                categoriesRequireAdmin: policy.categoriesRequireAdmin,
              },
            },
          });
        } else {
          const accountingEntryId = await postExpenseAccountingEntry(dbClient, {
            companyId: scope.companyId,
            expenseId: Number(expenseRow.id),
            expenseDate,
            category,
            amount: round2(amount),
            description,
            payeeName: payeeDisplay,
            outflowSource,
            actorUserId,
            actorName,
          });

          if (isAdmin) {
            await dbClient.query(
              `
              UPDATE cash_expenses
              SET approved_by_user_id = $1,
                  approved_by_name = $2,
                  approved_at = COALESCE(approved_at, NOW()),
                  updated_at = NOW()
              WHERE id = $3 AND company_id = $4
              `,
              [actorUserId, actorName, Number(expenseRow.id), scope.companyId],
            );
            await insertCashExpenseAudit(dbClient, {
              companyId: scope.companyId,
              cashExpenseId: Number(expenseRow.id),
              action: "approved",
              actorUserId,
              actorName,
              payload: { accountingEntryId },
            });
          }

          await insertCashExpenseAudit(dbClient, {
            companyId: scope.companyId,
            cashExpenseId: Number(expenseRow.id),
            action: "executed",
            actorUserId,
            actorName,
            payload: { accountingEntryId },
          });
        }

        const refreshed = await dbClient.query(
          `
          SELECT
            ce.id,
            ce.expense_date,
            ce.category,
            ce.amount,
            ce.description,
            ce.payee_type,
            ce.manager_user_id,
            ce.entity_name,
            ce.note,
            ce.outflow_source,
            ce.workflow_status,
            ce.required_approval_role,
            ce.approved_by_name,
            ce.approved_at,
            ce.rejected_by_name,
            ce.rejected_at,
            ce.rejection_reason,
            ce.accounting_entry_id,
            ce.cost_center_id,
            ce.created_by_name,
            ce.created_at
          FROM cash_expenses ce
          WHERE ce.id = $1
            AND ce.company_id = $2
          LIMIT 1
          `,
          [Number(expenseRow.id), scope.companyId],
        );
        const currentRow = refreshed.rows[0] || expenseRow;

        return {
          expense: {
            id: Number(currentRow.id),
            expenseDate: currentRow.expense_date,
            category: currentRow.category,
            categoryLabel: getExpenseCategoryLabel(currentRow.category),
            amount: round2(Number(currentRow.amount || 0)),
            description: currentRow.description || "",
            payeeType: currentRow.payee_type,
            managerUserId: currentRow.manager_user_id ? Number(currentRow.manager_user_id) : null,
            managerName: managerName || "",
            entityName: currentRow.entity_name || "",
            payeeName: payeeType === "manager" ? managerName : (currentRow.entity_name || ""),
            note: currentRow.note || "",
            outflowSource: currentRow.outflow_source || "caixa_geral",
            outflowSourceLabel: getOutflowSourceLabel(currentRow.outflow_source),
            workflowStatus: currentRow.workflow_status,
            requiredApprovalRole: currentRow.required_approval_role || null,
            approvedByName: currentRow.approved_by_name || "",
            approvedAt: currentRow.approved_at || null,
            rejectedByName: currentRow.rejected_by_name || "",
            rejectedAt: currentRow.rejected_at || null,
            rejectionReason: currentRow.rejection_reason || "",
            accountingEntryId: currentRow.accounting_entry_id ? Number(currentRow.accounting_entry_id) : null,
            costCenterId: currentRow.cost_center_id ? Number(currentRow.cost_center_id) : null,
            costCenterCode,
            costCenterName,
            attachmentsCount: 0,
            createdByName: currentRow.created_by_name || "Sistema",
            createdAt: currentRow.created_at,
          },
          pendingApproval: workflow.requiresApproval,
        };
      };

      const createdExpenses = [];

      if (managerCategory) {
        let allocationsToCreate = managerAllocations;
        if (allocationsToCreate.length === 0) {
          if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
            return { error: { status: 400, message: "Valor da despesa invalido." } };
          }
          const requestedManagerId = Number(req.body?.managerUserId);
          if (!Number.isInteger(requestedManagerId) || requestedManagerId <= 0) {
            return { error: { status: 400, message: "Selecione o gestor para esta despesa." } };
          }
          allocationsToCreate = [{ managerUserId: requestedManagerId, amount: round2(requestedAmount) }];
        } else if (rawManagerAllocations.length > 0 && allocationsToCreate.length === 0) {
          return { error: { status: 400, message: "Informe valores validos para os gestores." } };
        }

        const managerIds = allocationsToCreate.map((item) => item.managerUserId);
        const managersResult = await dbClient.query(
          `
          SELECT id, full_name
          FROM users
          WHERE company_id = $1
            AND is_active = true
            AND LOWER(role) IN ('manager', 'agent')
            AND id = ANY($2::int[])
          `,
          [scope.companyId, managerIds],
        );
        const managerMap = new Map(managersResult.rows.map((row) => [Number(row.id), row.full_name || "Gestor"]));
        const missingManager = allocationsToCreate.find((item) => !managerMap.has(item.managerUserId));
        if (missingManager) {
          return { error: { status: 404, message: "Um ou mais gestores informados nao foram encontrados na empresa ativa." } };
        }

        for (const allocation of allocationsToCreate) {
          const created = await createExpense({
            amount: allocation.amount,
            payeeType: "manager",
            managerUserId: allocation.managerUserId,
            managerName: managerMap.get(allocation.managerUserId) || "Gestor",
            entityName: "",
          });
          createdExpenses.push(created);
        }
      } else {
        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
          return { error: { status: 400, message: "Valor da despesa invalido." } };
        }
        const entityName = String(req.body?.entityName || "").trim();
        if (!entityName) {
          return { error: { status: 400, message: "Informe a entidade da despesa (ex: EDM, fornecedor)." } };
        }
        const created = await createExpense({
          amount: round2(requestedAmount),
          payeeType: "entity",
          managerUserId: null,
          managerName: "",
          entityName,
        });
        createdExpenses.push(created);
      }

      const pendingApprovalCount = createdExpenses.filter((item) => item.pendingApproval).length;
      return {
        expenses: createdExpenses.map((item) => item.expense),
        pendingApprovalCount,
      };
    });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    const createdCount = Array.isArray(result.expenses) ? result.expenses.length : 0;
    const pendingApprovalCount = Number(result.pendingApprovalCount || 0);
    const singleExpense = createdCount === 1 ? result.expenses[0] : null;

    return res.status(201).json({
      message: pendingApprovalCount > 0
        ? createdCount > 1
          ? `${createdCount} despesas registadas (${pendingApprovalCount} pendentes de aprovacao).`
          : "Despesa registada e enviada para aprovacao de admin."
        : createdCount > 1
          ? `${createdCount} despesas registadas com sucesso.`
          : "Despesa registada com sucesso.",
      expense: singleExpense,
      expenses: result.expenses || [],
      pendingApproval: pendingApprovalCount > 0,
      pendingApprovalCount,
      batchCreated: createdCount,
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/cash-flow/policy", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar politica de fluxo de caixa." });

    const policy = await withTransaction(async (dbClient) => loadCashFlowPolicy(dbClient, scope.companyId));
    return res.json({
      policy: {
        managerAutoApprovalLimit: round2(policy.managerAutoApprovalLimit),
        categoriesRequireAdmin: policy.categoriesRequireAdmin,
      },
      expenseCategories: CASH_EXPENSE_CATEGORIES.map((category) => ({
        value: category,
        label: getExpenseCategoryLabel(category),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.put("/cash-flow/policy", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar politica de fluxo de caixa." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!isAdminRole(role)) {
      return res.status(403).json({ message: "Apenas admin pode atualizar politica de alcada." });
    }

    const limitRaw = Number(req.body?.managerAutoApprovalLimit);
    if (!Number.isFinite(limitRaw) || limitRaw <= 0) {
      return res.status(400).json({ message: "Limite automatico do manager invalido." });
    }
    const categories = normalizeStringArray(req.body?.categoriesRequireAdmin)
      .filter((category) => CASH_EXPENSE_CATEGORIES.includes(category));

    await query(
      `
      INSERT INTO cash_flow_policies (
        company_id,
        manager_auto_approval_limit,
        categories_require_admin,
        updated_at
      )
      VALUES ($1, $2, $3::text[], NOW())
      ON CONFLICT (company_id)
      DO UPDATE SET
        manager_auto_approval_limit = EXCLUDED.manager_auto_approval_limit,
        categories_require_admin = EXCLUDED.categories_require_admin,
        updated_at = NOW()
      `,
      [scope.companyId, round2(limitRaw), categories],
    );

    return res.json({
      message: "Politica de aprovacao atualizada com sucesso.",
      policy: {
        managerAutoApprovalLimit: round2(limitRaw),
        categoriesRequireAdmin: categories,
      },
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/cash-flow/cost-centers", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar centros de custo." });

    const centers = await query(
      `
      SELECT id, code, name, is_active, created_at, updated_at
      FROM cash_cost_centers
      WHERE company_id = $1
      ORDER BY code ASC, id ASC
      `,
      [scope.companyId],
    );

    return res.json({
      rows: centers.rows.map((row) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.post("/cash-flow/cost-centers", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para registar centro de custo." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!(isAdminRole(role) || isManagerRole(role))) {
      return res.status(403).json({ message: "Apenas admin ou manager podem registar centros de custo." });
    }

    const code = String(req.body?.code || "").trim().toUpperCase();
    const name = String(req.body?.name || "").trim();
    if (!/^[A-Z0-9_-]{2,12}$/.test(code)) {
      return res.status(400).json({ message: "Codigo do centro de custo invalido. Use 2-12 caracteres alfanumericos." });
    }
    if (!name || name.length > 80) {
      return res.status(400).json({ message: "Nome do centro de custo invalido." });
    }

    const inserted = await query(
      `
      INSERT INTO cash_cost_centers (company_id, code, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (company_id, code) DO NOTHING
      RETURNING id, code, name, is_active, created_at, updated_at
      `,
      [scope.companyId, code, name],
    );
    if (!inserted.rows[0]) {
      return res.status(409).json({ message: "Ja existe centro de custo com este codigo." });
    }

    const row = inserted.rows[0];
    return res.status(201).json({
      message: "Centro de custo registado com sucesso.",
      costCenter: {
        id: Number(row.id),
        code: row.code,
        name: row.name,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/cash-flow/expenses/approvals", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar aprovacoes." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!isAdminRole(role)) {
      return res.status(403).json({ message: "Apenas admin pode aprovar despesas pendentes." });
    }

    const fromRaw = String(req.query.from || "").trim();
    const toRaw = String(req.query.to || "").trim();
    const from = fromRaw ? parseIsoDate(fromRaw) : null;
    const to = toRaw ? parseIsoDate(toRaw) : null;
    if ((fromRaw && !from) || (toRaw && !to)) {
      return res.status(400).json({ message: "Intervalo de datas invalido. Use formato YYYY-MM-DD." });
    }

    const rows = await query(
      `
      SELECT
        ce.id,
        ce.expense_date,
        ce.category,
        ce.amount,
        ce.description,
        ce.payee_type,
        ce.manager_user_id,
        ce.entity_name,
        ce.note,
        ce.outflow_source,
        ce.workflow_status,
        ce.required_approval_role,
        ce.created_by_name,
        ce.created_at,
        u.full_name AS manager_name,
        cc.id AS cost_center_id,
        cc.code AS cost_center_code,
        cc.name AS cost_center_name,
        COALESCE(att.attachments_count, 0)::INT AS attachments_count
      FROM cash_expenses ce
      LEFT JOIN users u ON u.id = ce.manager_user_id
      LEFT JOIN cash_cost_centers cc ON cc.id = ce.cost_center_id
      LEFT JOIN (
        SELECT cash_expense_id, COUNT(*)::INT AS attachments_count
        FROM cash_expense_attachments
        WHERE company_id = $1
        GROUP BY cash_expense_id
      ) att ON att.cash_expense_id = ce.id
      WHERE ce.company_id = $1
        AND ce.workflow_status = 'pending_admin'
        AND ($2::date IS NULL OR ce.expense_date >= $2::date)
        AND ($3::date IS NULL OR ce.expense_date <= $3::date)
      ORDER BY ce.expense_date DESC, ce.id DESC
      `,
      [scope.companyId, from, to],
    );

    return res.json({
      filters: { from, to },
      total: rows.rows.length,
      rows: rows.rows.map((row) => ({
        id: Number(row.id),
        expenseDate: row.expense_date,
        category: row.category,
        categoryLabel: getExpenseCategoryLabel(row.category),
        amount: round2(Number(row.amount || 0)),
        description: row.description || "",
        payeeType: row.payee_type,
        managerUserId: row.manager_user_id ? Number(row.manager_user_id) : null,
        managerName: row.manager_name || "",
        entityName: row.entity_name || "",
        payeeName: row.payee_type === "manager" ? (row.manager_name || "Gestor") : (row.entity_name || "Entidade"),
        note: row.note || "",
        outflowSource: row.outflow_source || "caixa_geral",
        outflowSourceLabel: getOutflowSourceLabel(row.outflow_source),
        workflowStatus: row.workflow_status,
        requiredApprovalRole: row.required_approval_role || null,
        costCenterId: row.cost_center_id ? Number(row.cost_center_id) : null,
        costCenterCode: row.cost_center_code || "",
        costCenterName: row.cost_center_name || "",
        attachmentsCount: Number(row.attachments_count || 0),
        createdByName: row.created_by_name || "Sistema",
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.patch("/cash-flow/expenses/:id/decision", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para decidir aprovacao." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!isAdminRole(role)) {
      return res.status(403).json({ message: "Apenas admin pode aprovar/rejeitar despesas pendentes." });
    }

    const expenseId = Number(req.params.id);
    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return res.status(400).json({ message: "ID de despesa invalido." });
    }

    const decision = String(req.body?.decision || "").trim().toLowerCase();
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ message: "Decisao invalida. Use approve ou reject." });
    }
    const rejectionReason = String(req.body?.rejectionReason || "").trim();
    if (decision === "reject" && !rejectionReason) {
      return res.status(400).json({ message: "Informe o motivo da rejeicao." });
    }

    const actorUserId = Number(req.user?.sub) || null;
    const actorName = String(req.user?.name || "").trim() || "Sistema";

    const result = await withTransaction(async (dbClient) => {
      const expenseResult = await dbClient.query(
        `
        SELECT
          ce.id,
          ce.expense_date,
          ce.category,
          ce.amount,
          ce.description,
          ce.payee_type,
          ce.manager_user_id,
          ce.entity_name,
          ce.note,
          ce.outflow_source,
          ce.workflow_status,
          ce.required_approval_role,
          ce.cost_center_id,
          ce.created_by_name,
          ce.created_at,
          u.full_name AS manager_name,
          cc.code AS cost_center_code,
          cc.name AS cost_center_name
        FROM cash_expenses ce
        LEFT JOIN users u ON u.id = ce.manager_user_id
        LEFT JOIN cash_cost_centers cc ON cc.id = ce.cost_center_id
        WHERE ce.id = $1
          AND ce.company_id = $2
        FOR UPDATE
        `,
        [expenseId, scope.companyId],
      );
      const expense = expenseResult.rows[0];
      if (!expense) return { error: { status: 404, message: "Despesa nao encontrada." } };
      if (expense.workflow_status !== "pending_admin") {
        return { error: { status: 400, message: "Apenas despesas pendentes podem ser aprovadas/rejeitadas." } };
      }

      if (decision === "reject") {
        await dbClient.query(
          `
          UPDATE cash_expenses
          SET workflow_status = 'rejected',
              required_approval_role = NULL,
              rejected_by_user_id = $1,
              rejected_by_name = $2,
              rejected_at = NOW(),
              rejection_reason = $3,
              updated_at = NOW()
          WHERE id = $4 AND company_id = $5
          `,
          [actorUserId, actorName, rejectionReason, expenseId, scope.companyId],
        );
        await insertCashExpenseAudit(dbClient, {
          companyId: scope.companyId,
          cashExpenseId: expenseId,
          action: "rejected",
          actorUserId,
          actorName,
          payload: { reason: rejectionReason },
        });

        return {
          expense: {
            id: Number(expense.id),
            expenseDate: expense.expense_date,
            category: expense.category,
            categoryLabel: getExpenseCategoryLabel(expense.category),
            amount: round2(Number(expense.amount || 0)),
            description: expense.description || "",
            payeeType: expense.payee_type,
            managerUserId: expense.manager_user_id ? Number(expense.manager_user_id) : null,
            managerName: expense.manager_name || "",
            entityName: expense.entity_name || "",
            payeeName: expense.payee_type === "manager" ? (expense.manager_name || "Gestor") : (expense.entity_name || "Entidade"),
            note: expense.note || "",
            outflowSource: expense.outflow_source || "caixa_geral",
            outflowSourceLabel: getOutflowSourceLabel(expense.outflow_source),
            workflowStatus: "rejected",
            requiredApprovalRole: null,
            approvedByName: "",
            approvedAt: null,
            rejectedByName: actorName,
            rejectedAt: new Date().toISOString(),
            rejectionReason,
            accountingEntryId: null,
            costCenterId: expense.cost_center_id ? Number(expense.cost_center_id) : null,
            costCenterCode: expense.cost_center_code || "",
            costCenterName: expense.cost_center_name || "",
            attachmentsCount: 0,
            createdByName: expense.created_by_name || "Sistema",
            createdAt: expense.created_at,
          },
          decision,
        };
      }

      const payeeName = expense.payee_type === "manager"
        ? (expense.manager_name || "Gestor")
        : (expense.entity_name || "Entidade");
      const accountingEntryId = await postExpenseAccountingEntry(dbClient, {
        companyId: scope.companyId,
        expenseId,
        expenseDate: expense.expense_date,
        category: expense.category,
        amount: round2(Number(expense.amount || 0)),
        description: expense.description || "",
        payeeName,
        outflowSource: expense.outflow_source || "caixa_geral",
        actorUserId,
        actorName,
      });

      await dbClient.query(
        `
        UPDATE cash_expenses
        SET workflow_status = 'executed',
            required_approval_role = NULL,
            approved_by_user_id = $1,
            approved_by_name = $2,
            approved_at = NOW(),
            rejected_by_user_id = NULL,
            rejected_by_name = NULL,
            rejected_at = NULL,
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = $3 AND company_id = $4
        `,
        [actorUserId, actorName, expenseId, scope.companyId],
      );

      await insertCashExpenseAudit(dbClient, {
        companyId: scope.companyId,
        cashExpenseId: expenseId,
        action: "approved",
        actorUserId,
        actorName,
        payload: { accountingEntryId },
      });
      await insertCashExpenseAudit(dbClient, {
        companyId: scope.companyId,
        cashExpenseId: expenseId,
        action: "executed",
        actorUserId,
        actorName,
        payload: { accountingEntryId },
      });

      return {
        expense: {
          id: Number(expense.id),
          expenseDate: expense.expense_date,
          category: expense.category,
          categoryLabel: getExpenseCategoryLabel(expense.category),
          amount: round2(Number(expense.amount || 0)),
          description: expense.description || "",
          payeeType: expense.payee_type,
          managerUserId: expense.manager_user_id ? Number(expense.manager_user_id) : null,
          managerName: expense.manager_name || "",
          entityName: expense.entity_name || "",
          payeeName,
          note: expense.note || "",
          outflowSource: expense.outflow_source || "caixa_geral",
          outflowSourceLabel: getOutflowSourceLabel(expense.outflow_source),
          workflowStatus: "executed",
          requiredApprovalRole: null,
          approvedByName: actorName,
          approvedAt: new Date().toISOString(),
          rejectedByName: "",
          rejectedAt: null,
          rejectionReason: "",
          accountingEntryId,
          costCenterId: expense.cost_center_id ? Number(expense.cost_center_id) : null,
          costCenterCode: expense.cost_center_code || "",
          costCenterName: expense.cost_center_name || "",
          attachmentsCount: 0,
          createdByName: expense.created_by_name || "Sistema",
          createdAt: expense.created_at,
        },
        decision,
      };
    });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.json({
      message: decision === "approve" ? "Despesa aprovada e executada com sucesso." : "Despesa rejeitada com sucesso.",
      expense: result.expense,
      decision: result.decision,
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/cash-flow/expenses/:id/attachments", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar anexos." });
    const expenseId = Number(req.params.id);
    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return res.status(400).json({ message: "ID de despesa invalido." });
    }

    const exists = await query(
      "SELECT id FROM cash_expenses WHERE id = $1 AND company_id = $2 LIMIT 1",
      [expenseId, scope.companyId],
    );
    if (!exists.rows[0]) {
      return res.status(404).json({ message: "Despesa nao encontrada." });
    }

    const attachments = await query(
      `
      SELECT id, file_name, mime_type, file_size_bytes, uploaded_by_user_id, uploaded_by_name, uploaded_at
      FROM cash_expense_attachments
      WHERE company_id = $1
        AND cash_expense_id = $2
      ORDER BY uploaded_at DESC, id DESC
      `,
      [scope.companyId, expenseId],
    );

    return res.json({
      expenseId,
      rows: attachments.rows.map((row) => ({
        id: Number(row.id),
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSizeBytes: Number(row.file_size_bytes || 0),
        uploadedByUserId: row.uploaded_by_user_id ? Number(row.uploaded_by_user_id) : null,
        uploadedByName: row.uploaded_by_name || "Sistema",
        uploadedAt: row.uploaded_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.post("/cash-flow/expenses/:id/attachments", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para carregar anexos." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!(isAdminRole(role) || isManagerRole(role))) {
      return res.status(403).json({ message: "Apenas admin ou manager podem anexar comprovativos." });
    }

    const expenseId = Number(req.params.id);
    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return res.status(400).json({ message: "ID de despesa invalido." });
    }

    const expenseExists = await query(
      "SELECT id FROM cash_expenses WHERE id = $1 AND company_id = $2 LIMIT 1",
      [expenseId, scope.companyId],
    );
    if (!expenseExists.rows[0]) {
      return res.status(404).json({ message: "Despesa nao encontrada." });
    }

    const mimeType = String(req.body?.mimeType || "").trim().toLowerCase();
    if (!ALLOWED_EXPENSE_ATTACHMENT_MIME.has(mimeType)) {
      return res.status(400).json({ message: "Tipo de ficheiro invalido. Use PDF, PNG ou JPG." });
    }

    const base64Data = normalizeBase64Input(req.body?.fileBase64);
    if (!base64Data) return res.status(400).json({ message: "Ficheiro nao informado." });

    let fileBuffer;
    try {
      fileBuffer = Buffer.from(base64Data, "base64");
    } catch {
      return res.status(400).json({ message: "Ficheiro em base64 invalido." });
    }
    if (!fileBuffer || fileBuffer.length === 0) return res.status(400).json({ message: "Ficheiro vazio." });
    if (fileBuffer.length > CASH_EXPENSE_ATTACHMENT_MAX_BYTES) {
      return res.status(400).json({ message: "Ficheiro excede o limite de 10MB." });
    }

    const sourceFileName = safeFileName(String(req.body?.fileName || "comprovativo"));
    const ext = mimeExtension(mimeType);
    const actorName = String(req.user?.name || "").trim() || "Sistema";
    const actorId = Number(req.user?.sub) || null;

    const folder = path.join(CASH_EXPENSE_ATTACHMENTS_ROOT, `company-${scope.companyId}`, `expense-${expenseId}`);
    await fs.mkdir(folder, { recursive: true });
    const stampedName = `${Date.now()}-${sourceFileName.replace(/\.[^.]+$/, "")}.${ext}`;
    const absolutePath = path.join(folder, stampedName);
    await fs.writeFile(absolutePath, fileBuffer);

    const inserted = await withTransaction(async (dbClient) => {
      const result = await dbClient.query(
        `
        INSERT INTO cash_expense_attachments (
          company_id,
          cash_expense_id,
          file_name,
          mime_type,
          file_size_bytes,
          storage_path,
          uploaded_by_user_id,
          uploaded_by_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, file_name, mime_type, file_size_bytes, uploaded_by_user_id, uploaded_by_name, uploaded_at
        `,
        [
          scope.companyId,
          expenseId,
          sourceFileName,
          mimeType,
          fileBuffer.length,
          absolutePath,
          actorId,
          actorName,
        ],
      );

      await insertCashExpenseAudit(dbClient, {
        companyId: scope.companyId,
        cashExpenseId: expenseId,
        action: "attachment_uploaded",
        actorUserId: actorId,
        actorName,
        payload: {
          attachmentId: Number(result.rows[0].id),
          fileName: sourceFileName,
          mimeType,
          fileSizeBytes: fileBuffer.length,
        },
      });
      return result.rows[0];
    });

    return res.status(201).json({
      message: "Comprovativo anexado com sucesso.",
      attachment: {
        id: Number(inserted.id),
        fileName: inserted.file_name,
        mimeType: inserted.mime_type,
        fileSizeBytes: Number(inserted.file_size_bytes || 0),
        uploadedByUserId: inserted.uploaded_by_user_id ? Number(inserted.uploaded_by_user_id) : null,
        uploadedByName: inserted.uploaded_by_name || "Sistema",
        uploadedAt: inserted.uploaded_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

accountingRouter.get("/cash-flow/expenses/:id/attachments/:attachmentId/download", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para descarregar anexos." });
    const expenseId = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(expenseId) || expenseId <= 0 || !Number.isInteger(attachmentId) || attachmentId <= 0) {
      return res.status(400).json({ message: "Identificadores invalidos." });
    }

    const result = await query(
      `
      SELECT id, file_name, mime_type, storage_path
      FROM cash_expense_attachments
      WHERE id = $1
        AND company_id = $2
        AND cash_expense_id = $3
      LIMIT 1
      `,
      [attachmentId, scope.companyId, expenseId],
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: "Anexo nao encontrado." });

    const resolvedRoot = path.resolve(CASH_EXPENSE_ATTACHMENTS_ROOT);
    const resolvedFile = path.resolve(String(row.storage_path || ""));
    if (!resolvedFile.startsWith(resolvedRoot)) {
      return res.status(400).json({ message: "Caminho de ficheiro invalido." });
    }

    try {
      await fs.access(resolvedFile);
    } catch {
      return res.status(404).json({ message: "Ficheiro do anexo nao encontrado no armazenamento." });
    }

    res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
    return res.download(resolvedFile, row.file_name || `anexo-${attachmentId}`);
  } catch (error) {
    return next(error);
  }
});

accountingRouter.post("/mora/accrue", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para apropriar mora." });
    const userRole = String(req.user?.role || "").trim().toLowerCase();
    const isPrivileged = userRole === "admin" || userRole === "manager";
    if (!isPrivileged) {
      return res.status(403).json({ message: "Apenas manager ou admin podem apropriar mora contabil." });
    }
    const loanIdRaw = req.body?.loanId;
    const loanId = loanIdRaw !== undefined && loanIdRaw !== null && loanIdRaw !== "" ? Number(loanIdRaw) : null;
    if (loanIdRaw !== undefined && (!Number.isInteger(loanId) || Number(loanId) <= 0)) {
      return res.status(400).json({ message: "loanId invalido." });
    }

    const result = await withTransaction(async (dbClient) => {
      const policyResult = await dbClient.query(
        `
        SELECT mora_monthly_enabled, mora_weekly_enabled, mora_daily_enabled
        FROM loan_approval_policies
        WHERE company_id = $1
        LIMIT 1
        `,
        [scope.companyId],
      );
      const moraPolicy = normalizeMoraPolicySettings(policyResult.rows[0] || {});
      const loanWhere = loanId ? "AND id = $2" : "";
      const params = loanId ? [scope.companyId, loanId] : [scope.companyId];
      const loansResult = await dbClient.query(
        `
        SELECT id, contract_no, balance, payment_frequency, daily_penalty_rate, days_overdue, disbursed_on, mora_waived_total, mora_accrued_posted
        FROM loans
        WHERE company_id = $1
          ${loanWhere}
          AND days_overdue > 0
        FOR UPDATE
        `,
        params,
      );

      let postedEntries = 0;
      let totalAmount = 0;
      const affectedLoans = [];

      for (const loan of loansResult.rows) {
        const netMora = calculateNetMora(
          Number(loan.balance),
          Number(loan.daily_penalty_rate || 0),
          Number(loan.days_overdue),
          Number(loan.mora_waived_total || 0),
          {
            moraEnabled: isMoraEnabledForFrequency(loan.payment_frequency, moraPolicy),
            policySettings: moraPolicy,
            disbursedDate: loan.disbursed_on,
            referenceDate: new Date().toISOString().slice(0, 10),
          },
        );
        const alreadyPosted = Number(loan.mora_accrued_posted || 0);
        const delta = round2(netMora - alreadyPosted);
        if (delta <= 0) continue;

        await dbClient.query(
          `
          UPDATE loans
          SET mora_accrued_posted = $1
          WHERE id = $2 AND company_id = $3
          `,
          [netMora, Number(loan.id), scope.companyId],
        );

        const eventInserted = await dbClient.query(
          `
          INSERT INTO loan_financial_events (
            company_id, loan_id, event_type, amount, note, payload, before_snapshot, after_snapshot, created_by_user_id, created_by_name
          )
          VALUES ($1,$2,'mora',$3,$4,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,$5,$6)
          RETURNING id
          `,
          [
            scope.companyId,
            Number(loan.id),
            delta,
            "Apropriacao contabil automatica de mora.",
            Number(req.user?.sub) || null,
            req.user?.name || null,
          ],
        );

        await postDoubleEntry(dbClient, {
          companyId: scope.companyId,
          entryDate: new Date().toISOString().slice(0, 10),
          eventType: "mora",
          description: `Apropriacao de mora do contrato ${loan.contract_no}`,
          referenceType: "loan_financial_event",
          referenceId: Number(eventInserted.rows[0].id),
          loanId: Number(loan.id),
          actorUserId: Number(req.user?.sub) || null,
          actorName: req.user?.name || null,
          lines: [
            { accountCode: "1220", debit: delta, credit: 0, memo: "Mora a receber" },
            { accountCode: "4110", debit: 0, credit: delta, memo: "Receita de mora" },
          ],
        });

        postedEntries += 1;
        totalAmount = round2(totalAmount + delta);
        affectedLoans.push({ loanId: Number(loan.id), contractNo: loan.contract_no, amount: delta });
      }

      return { postedEntries, totalAmount, affectedLoans };
    });

    return res.json({
      message: result.postedEntries > 0 ? "Apropriacao de mora contabilizada com sucesso." : "Sem nova mora para apropriar.",
      postedEntries: result.postedEntries,
      totalAmount: result.totalAmount,
      affectedLoans: result.affectedLoans,
    });
  } catch (error) {
    return next(error);
  }
});
