import express from "express";
import { query, withTransaction } from "../config/db.js";
import { isCentralAdmin, requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireFinanceSessionPermission } from "../middleware/permissions.js";
import { notifyCaixaMovement } from "../services/notification-service.js";
import { publishAppEvent } from "../services/event-bus.js";

export const financeSessionRouter = express.Router();

financeSessionRouter.use(requireAuth);
financeSessionRouter.use(requireFinanceSessionPermission);

const ALLOWED_ROLES = new Set(["admin", "manager", "agent", "operator", "assistant", "accountant"]);

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

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

function parseNonNegative(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return round2(parsed);
}

async function appendFinanceAudit(dbClient, {
  companyId,
  sessionId = null,
  businessDate,
  actionType,
  actorUserId = null,
  actorName = "Sistema",
  note = null,
  payload = {},
}) {
  await dbClient.query(
    `
    INSERT INTO finance_day_session_audit (
      company_id,
      session_id,
      business_date,
      action_type,
      actor_user_id,
      actor_name,
      note,
      payload_json,
      created_at
    )
    VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8::jsonb, NOW())
    `,
    [
      companyId,
      sessionId,
      businessDate,
      actionType,
      actorUserId,
      actorName || "Sistema",
      note,
      JSON.stringify(payload || {}),
    ],
  );
  publishAppEvent(companyId, "FINANCE_SESSION_CHANGED", {
    sessionId,
    businessDate,
    actionType,
    actorName: actorName || "Sistema",
    payload,
  });
}

async function appendFinanceReopenAudit(dbClient, {
  companyId,
  sessionId,
  businessDate,
  previousStatus,
  previousClosedAt = null,
  previousClosedByName = null,
  previousClosingBalance = null,
  reopenedByUserId = null,
  reopenedByName = "Sistema",
  reopenReason,
}) {
  await dbClient.query(
    `
    INSERT INTO finance_day_reopen_audit (
      company_id,
      session_id,
      business_date,
      previous_status,
      previous_closed_at,
      previous_closed_by_name,
      previous_closing_balance,
      reopened_by_user_id,
      reopened_by_name,
      reopen_reason,
      reopened_at
    )
    VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, NOW())
    `,
    [
      companyId,
      sessionId,
      businessDate,
      previousStatus,
      previousClosedAt,
      previousClosedByName,
      previousClosingBalance,
      reopenedByUserId,
      reopenedByName,
      reopenReason,
    ],
  );
}

async function getCurrentBusinessDate(dbClient) {
  const result = await dbClient.query("SELECT CURRENT_DATE::text AS business_date");
  return result.rows[0]?.business_date;
}

async function loadPreviousClosingBalance(dbClient, companyId, businessDate) {
  const previous = await dbClient.query(
    `
    SELECT closing_balance
    FROM finance_day_sessions
    WHERE company_id = $1
      AND business_date < $2::date
      AND status IN ('closed', 'auto_closed')
      AND closing_balance IS NOT NULL
    ORDER BY business_date DESC, id DESC
    LIMIT 1
    `,
    [companyId, businessDate],
  );
  return round2(Number(previous.rows[0]?.closing_balance || 0));
}

async function loadDailyFlows(dbClient, companyId, businessDate) {
  const result = await dbClient.query(
    `
    WITH disbursements AS (
      SELECT COALESCE(SUM(disbursement_net_amount), 0)::NUMERIC(14,2) AS total
      FROM loans
      WHERE company_id = $1
        AND disbursement_status = 'disbursed'
        AND disbursed_on = $2::date
    ),
    reimbursements AS (
      SELECT COALESCE(SUM(amount_received), 0)::NUMERIC(14,2) AS total
      FROM loan_repayments
      WHERE company_id = $1
        AND payment_date = $2::date
    ),
    expenses AS (
      SELECT COALESCE(SUM(amount), 0)::NUMERIC(14,2) AS total
      FROM cash_expenses
      WHERE company_id = $1
        AND workflow_status = 'executed'
        AND expense_date = $2::date
    )
    SELECT
      disbursements.total AS disbursements,
      reimbursements.total AS reimbursements,
      expenses.total AS expenses
    FROM disbursements
    CROSS JOIN reimbursements
    CROSS JOIN expenses
    `,
    [companyId, businessDate],
  );
  const row = result.rows[0] || {};
  return {
    disbursements: round2(Number(row.disbursements || 0)),
    reimbursements: round2(Number(row.reimbursements || 0)),
    expenses: round2(Number(row.expenses || 0)),
  };
}

async function autoCloseStaleSessions(dbClient, companyId, currentBusinessDate) {
  await dbClient.query(
    `
    WITH stale_sessions AS (
      SELECT id, company_id, business_date, opening_balance, opening_capital, reinforcement_total, notes_close
      FROM finance_day_sessions
      WHERE company_id = $1
        AND status = 'open'
        AND business_date < $2::date
    ),
    disbursements AS (
      SELECT ss.id AS session_id, COALESCE(SUM(l.disbursement_net_amount), 0)::NUMERIC(14,2) AS total
      FROM stale_sessions ss
      LEFT JOIN loans l
        ON l.company_id = ss.company_id
       AND l.disbursement_status = 'disbursed'
       AND l.disbursed_on = ss.business_date
      GROUP BY ss.id
    ),
    reimbursements AS (
      SELECT ss.id AS session_id, COALESCE(SUM(rp.amount_received), 0)::NUMERIC(14,2) AS total
      FROM stale_sessions ss
      LEFT JOIN loan_repayments rp
        ON rp.company_id = ss.company_id
       AND rp.payment_date = ss.business_date
      GROUP BY ss.id
    ),
    expenses AS (
      SELECT ss.id AS session_id, COALESCE(SUM(e.amount), 0)::NUMERIC(14,2) AS total
      FROM stale_sessions ss
      LEFT JOIN cash_expenses e
        ON e.company_id = ss.company_id
       AND e.workflow_status = 'executed'
       AND e.expense_date = ss.business_date
      GROUP BY ss.id
    ),
    updated AS (
      UPDATE finance_day_sessions s
      SET
        status = 'auto_closed',
        closed_at = (ss.business_date + INTERVAL '1 day')::timestamptz,
        closed_by_name = 'AUTO-00:00',
        closing_disbursements = COALESCE(d.total, 0),
        closing_reimbursements = COALESCE(r.total, 0),
        closing_expenses = COALESCE(x.total, 0),
        closing_balance = ROUND(
          (
            COALESCE(ss.opening_balance, 0)
            + COALESCE(ss.opening_capital, 0)
            + COALESCE(ss.reinforcement_total, 0)
            + COALESCE(r.total, 0)
            - COALESCE(d.total, 0)
            - COALESCE(x.total, 0)
          )::numeric,
          2
        ),
        notes_close = COALESCE(NULLIF(BTRIM(ss.notes_close), ''), 'Fecho automatico de seguranca as 00:00.'),
        updated_at = NOW()
      FROM stale_sessions ss
      LEFT JOIN disbursements d ON d.session_id = ss.id
      LEFT JOIN reimbursements r ON r.session_id = ss.id
      LEFT JOIN expenses x ON x.session_id = ss.id
      WHERE s.id = ss.id
      RETURNING s.id, ss.company_id, ss.business_date
    )
    INSERT INTO finance_day_session_audit (
      company_id,
      session_id,
      business_date,
      action_type,
      actor_user_id,
      actor_name,
      note,
      payload_json,
      created_at
    )
    SELECT
      u.company_id,
      u.id,
      u.business_date,
      'auto_close',
      NULL,
      'AUTO-00:00',
      'Fecho automatico de seguranca as 00:00.',
      '{"source":"auto_00:00"}'::jsonb,
      NOW()
    FROM updated u
    `,
    [companyId, currentBusinessDate],
  );
}

async function autoCloseAllStaleSessions(dbClient, currentBusinessDate) {
  await dbClient.query(
    `
    WITH stale_sessions AS (
      SELECT id, company_id, business_date, opening_balance, opening_capital, reinforcement_total, notes_close
      FROM finance_day_sessions
      WHERE status = 'open'
        AND business_date < $1::date
    ),
    disbursements AS (
      SELECT ss.id AS session_id, COALESCE(SUM(l.disbursement_net_amount), 0)::NUMERIC(14,2) AS total
      FROM stale_sessions ss
      LEFT JOIN loans l
        ON l.company_id = ss.company_id
       AND l.disbursement_status = 'disbursed'
       AND l.disbursed_on = ss.business_date
      GROUP BY ss.id
    ),
    reimbursements AS (
      SELECT ss.id AS session_id, COALESCE(SUM(rp.amount_received), 0)::NUMERIC(14,2) AS total
      FROM stale_sessions ss
      LEFT JOIN loan_repayments rp
        ON rp.company_id = ss.company_id
       AND rp.payment_date = ss.business_date
      GROUP BY ss.id
    ),
    expenses AS (
      SELECT ss.id AS session_id, COALESCE(SUM(e.amount), 0)::NUMERIC(14,2) AS total
      FROM stale_sessions ss
      LEFT JOIN cash_expenses e
        ON e.company_id = ss.company_id
       AND e.workflow_status = 'executed'
       AND e.expense_date = ss.business_date
      GROUP BY ss.id
    ),
    updated AS (
      UPDATE finance_day_sessions s
      SET
        status = 'auto_closed',
        closed_at = (ss.business_date + INTERVAL '1 day')::timestamptz,
        closed_by_name = 'AUTO-00:00',
        closing_disbursements = COALESCE(d.total, 0),
        closing_reimbursements = COALESCE(r.total, 0),
        closing_expenses = COALESCE(x.total, 0),
        closing_balance = ROUND(
          (
            COALESCE(ss.opening_balance, 0)
            + COALESCE(ss.opening_capital, 0)
            + COALESCE(ss.reinforcement_total, 0)
            + COALESCE(r.total, 0)
            - COALESCE(d.total, 0)
            - COALESCE(x.total, 0)
          )::numeric,
          2
        ),
        notes_close = COALESCE(NULLIF(BTRIM(ss.notes_close), ''), 'Fecho automatico de seguranca as 00:00.'),
        updated_at = NOW()
      FROM stale_sessions ss
      LEFT JOIN disbursements d ON d.session_id = ss.id
      LEFT JOIN reimbursements r ON r.session_id = ss.id
      LEFT JOIN expenses x ON x.session_id = ss.id
      WHERE s.id = ss.id
      RETURNING s.id, ss.company_id, ss.business_date
    )
    INSERT INTO finance_day_session_audit (
      company_id,
      session_id,
      business_date,
      action_type,
      actor_user_id,
      actor_name,
      note,
      payload_json,
      created_at
    )
    SELECT
      u.company_id,
      u.id,
      u.business_date,
      'auto_close',
      NULL,
      'AUTO-00:00',
      'Fecho automatico de seguranca as 00:00.',
      '{"source":"auto_00:00"}'::jsonb,
      NOW()
    FROM updated u
    `,
    [currentBusinessDate],
  );
}

function mapSessionRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    businessDate: row.business_date,
    status: row.status,
    openedAt: row.opened_at,
    openedByName: row.opened_by_name || "",
    openingBalance: round2(Number(row.opening_balance || 0)),
    openingCapital: round2(Number(row.opening_capital || 0)),
    reinforcementTotal: round2(Number(row.reinforcement_total || 0)),
    notesOpen: row.notes_open || "",
    closedAt: row.closed_at,
    closedByName: row.closed_by_name || "",
    closingBalance: row.closing_balance === null ? null : round2(Number(row.closing_balance || 0)),
    closingDisbursements: round2(Number(row.closing_disbursements || 0)),
    closingReimbursements: round2(Number(row.closing_reimbursements || 0)),
    closingExpenses: round2(Number(row.closing_expenses || 0)),
    notesClose: row.notes_close || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditRow(row) {
  return {
    id: Number(row.id),
    sessionId: row.session_id ? Number(row.session_id) : null,
    businessDate: row.business_date,
    actionType: String(row.action_type || ""),
    actorUserId: row.actor_user_id ? Number(row.actor_user_id) : null,
    actorName: row.actor_name || "",
    note: row.note || "",
    payload: row.payload_json || {},
    createdAt: row.created_at,
  };
}

function mapReopenAuditRow(row) {
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    businessDate: row.business_date,
    previousStatus: row.previous_status,
    previousClosedAt: row.previous_closed_at,
    previousClosedByName: row.previous_closed_by_name || "",
    previousClosingBalance: row.previous_closing_balance === null ? null : round2(Number(row.previous_closing_balance || 0)),
    reopenedByUserId: row.reopened_by_user_id ? Number(row.reopened_by_user_id) : null,
    reopenedByName: row.reopened_by_name || "",
    reopenReason: row.reopen_reason || "",
    reopenedAt: row.reopened_at,
  };
}

function computeAvailableBalance(session, flows, previousClosingBalance) {
  if (!session) return round2(previousClosingBalance || 0);
  if (session.status === "open") {
    return round2(
      Number(session.opening_balance || 0)
        + Number(session.opening_capital || 0)
        + Number(session.reinforcement_total || 0)
        + Number(flows.reimbursements || 0)
        - Number(flows.disbursements || 0)
        - Number(flows.expenses || 0),
    );
  }
  return round2(Number(session.closing_balance || 0));
}

async function buildStatePayload(dbClient, companyId, requestedBusinessDate = null) {
  const currentBusinessDate = await getCurrentBusinessDate(dbClient);
  const businessDate = requestedBusinessDate || currentBusinessDate;

  await autoCloseStaleSessions(dbClient, companyId, currentBusinessDate);

  const sessionResult = await dbClient.query(
    `
    SELECT *
    FROM finance_day_sessions
    WHERE company_id = $1
      AND business_date = $2::date
    LIMIT 1
    `,
    [companyId, businessDate],
  );
  const sessionRow = sessionResult.rows[0] || null;
  const flows = await loadDailyFlows(dbClient, companyId, businessDate);
  const previousClosingBalance = await loadPreviousClosingBalance(dbClient, companyId, businessDate);
  const availableBalance = computeAvailableBalance(sessionRow, flows, previousClosingBalance);
  const isCurrentBusinessDate = businessDate === currentBusinessDate;
  const requiresOpening = !sessionRow || sessionRow.status !== "open";

  return {
    currentBusinessDate,
    businessDate,
    isCurrentBusinessDate,
    previousClosingBalance,
    availableBalance,
    formula: "Saldo = Saldo Abertura + Capital Inicial + Reforcos + Reembolsos - Desembolsos - Despesas",
    todayFlows: flows,
    session: mapSessionRow(sessionRow),
    requiresOpening,
    systemLocked: isCurrentBusinessDate && requiresOpening,
  };
}

function ensureRoleAllowed(req, res) {
  const role = String(req.user?.role || "").trim().toLowerCase();
  if (!ALLOWED_ROLES.has(role)) {
    res.status(403).json({ message: "Perfil sem permissao para operar sessao financeira." });
    return false;
  }
  return true;
}

function isCompanyAdminForScope(req, companyId) {
  const role = String(req.user?.role || "").trim().toLowerCase();
  return role === "admin" && Number(req.user?.companyId) === Number(companyId);
}

function canReopenFinanceDay(req, companyId) {
  return isCentralAdmin(req) || isCompanyAdminForScope(req, companyId);
}

financeSessionRouter.get("/state", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para consultar sessao financeira." });
    }
    if (!ensureRoleAllowed(req, res)) return undefined;
    const requestedDate = parseIsoDate(req.query?.date);
    if (String(req.query?.date || "").trim() && !requestedDate) {
      return res.status(400).json({ message: "Data invalida. Use formato YYYY-MM-DD." });
    }
    const payload = await withTransaction((dbClient) => buildStatePayload(dbClient, scope.companyId, requestedDate));
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

financeSessionRouter.post("/open", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para abrir o dia financeiro." });
    }
    if (!ensureRoleAllowed(req, res)) return undefined;

    const requestedDate = parseIsoDate(req.body?.businessDate);
    if (String(req.body?.businessDate || "").trim() && !requestedDate) {
      return res.status(400).json({ message: "Data invalida. Use formato YYYY-MM-DD." });
    }

    const openingCapital = parseNonNegative(req.body?.openingCapital, 0);
    const reinforcement = parseNonNegative(req.body?.reinforcement, 0);
    const openingBalanceInput = parseNonNegative(req.body?.openingBalance, null);
    if (openingCapital === null || reinforcement === null || openingBalanceInput === null && req.body?.openingBalance !== null && req.body?.openingBalance !== undefined && req.body?.openingBalance !== "") {
      return res.status(400).json({ message: "Valores financeiros invalidos. Use apenas numeros nao negativos." });
    }

    const notesOpen = String(req.body?.notesOpen || "").trim();
    const reopenReasonInput = String(req.body?.reopenReason || "").trim();
    const confirmReopen = Boolean(req.body?.confirmReopen);
    const actorUserId = Number(req.user?.id) || null;
    const actorName = String(req.user?.fullName || req.user?.email || "Sistema");

    const result = await withTransaction(async (dbClient) => {
      const baseState = await buildStatePayload(dbClient, scope.companyId, requestedDate);
      const businessDate = baseState.businessDate;

      if (baseState.session && baseState.session.status === "open") {
        const conflict = new Error("O dia financeiro ja esta aberto.");
        conflict.statusCode = 409;
        throw conflict;
      }
      if (baseState.session && baseState.session.status !== "open") {
        const reopenReason = reopenReasonInput || notesOpen;
        if (!confirmReopen) {
          const confirmation = new Error(
            "O dia ja foi fechado. Confirme a reabertura para prosseguir.",
          );
          confirmation.statusCode = 409;
          throw confirmation;
        }
        if (!canReopenFinanceDay(req, scope.companyId)) {
          const forbidden = new Error(
            "Reabertura no mesmo dia permitida apenas para Admin da empresa ou Central de Empresas.",
          );
          forbidden.statusCode = 403;
          throw forbidden;
        }
        if (!reopenReason) {
          const badRequest = new Error("Informe o motivo da reabertura.");
          badRequest.statusCode = 400;
          throw badRequest;
        }

        await dbClient.query(
          `
          UPDATE finance_day_sessions
          SET
            status = 'open',
            opened_at = NOW(),
            opened_by_user_id = $1,
            opened_by_name = $2,
            closed_at = NULL,
            closed_by_user_id = NULL,
            closed_by_name = NULL,
            closing_balance = NULL,
            closing_disbursements = 0,
            closing_reimbursements = 0,
            closing_expenses = 0,
            notes_close = NULL,
            notes_open = CASE
              WHEN $3::text IS NULL OR BTRIM($3::text) = '' THEN notes_open
              WHEN notes_open IS NULL OR BTRIM(notes_open) = '' THEN $3::text
              ELSE CONCAT(notes_open, E'\\n', $3::text)
            END,
            updated_at = NOW()
          WHERE id = $4
          `,
          [
            actorUserId,
            actorName,
            reopenReason,
            baseState.session.id,
          ],
        );

        await appendFinanceAudit(dbClient, {
          companyId: scope.companyId,
          sessionId: baseState.session.id,
          businessDate,
          actionType: "reopen",
          actorUserId,
          actorName,
          note: reopenReason,
          payload: {
            previousStatus: baseState.session.status,
          },
        });
        await appendFinanceReopenAudit(dbClient, {
          companyId: scope.companyId,
          sessionId: baseState.session.id,
          businessDate,
          previousStatus: String(baseState.session.status || "closed"),
          previousClosedAt: baseState.session.closedAt || null,
          previousClosedByName: baseState.session.closedByName || null,
          previousClosingBalance: baseState.session.closingBalance,
          reopenedByUserId: actorUserId,
          reopenedByName: actorName,
          reopenReason,
        });

        const newState = await buildStatePayload(dbClient, scope.companyId, businessDate);
        return { state: newState, reopened: true };
      }

      const openingBalance = openingBalanceInput === null ? baseState.previousClosingBalance : openingBalanceInput;
      const insertResult = await dbClient.query(
        `
        INSERT INTO finance_day_sessions (
          company_id,
          business_date,
          status,
          opened_at,
          opened_by_user_id,
          opened_by_name,
          opening_balance,
          opening_capital,
          reinforcement_total,
          notes_open,
          created_at,
          updated_at
        )
        VALUES ($1, $2::date, 'open', NOW(), $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id
        `,
        [
          scope.companyId,
          businessDate,
          actorUserId,
          actorName,
          round2(openingBalance),
          round2(openingCapital || 0),
          round2(reinforcement || 0),
          notesOpen || null,
        ],
      );
      await appendFinanceAudit(dbClient, {
        companyId: scope.companyId,
        sessionId: Number(insertResult.rows[0]?.id || 0) || null,
        businessDate,
        actionType: "open",
        actorUserId,
        actorName,
        note: notesOpen || null,
        payload: {
          openingBalance: round2(openingBalance),
          openingCapital: round2(openingCapital || 0),
          openingReinforcement: round2(reinforcement || 0),
        },
      });
      const newState = await buildStatePayload(dbClient, scope.companyId, businessDate);
      return { state: newState, reopened: false };
    });

    void notifyCaixaMovement({
      companyId: scope.companyId,
      actionType: result.reopened ? "reopen_day" : "open_day",
      actorName: String(req.user?.fullName || req.user?.email || "Sistema"),
      amount: Number(req.body?.openingBalance || 0),
      note: String(req.body?.notesOpen || "").trim() || null,
      sessionId: result.state?.session?.id || null,
    }).catch(() => undefined);

    return res.status(201).json({
      message: result.reopened
        ? "Dia financeiro reaberto com sucesso."
        : "Abertura do dia financeiro registada com sucesso.",
      state: result.state,
    });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Ja existe sessao financeira para esta data." });
    }
    return next(error);
  }
});

financeSessionRouter.post("/reinforcement", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para registar reforco." });
    }
    if (!ensureRoleAllowed(req, res)) return undefined;

    const requestedDate = parseIsoDate(req.body?.businessDate);
    if (String(req.body?.businessDate || "").trim() && !requestedDate) {
      return res.status(400).json({ message: "Data invalida. Use formato YYYY-MM-DD." });
    }

    const reinforcementAmount = parseNonNegative(req.body?.amount, null);
    if (reinforcementAmount === null || reinforcementAmount <= 0) {
      return res.status(400).json({ message: "Informe um valor de reforco maior que zero." });
    }
    const note = String(req.body?.note || "").trim();

    const state = await withTransaction(async (dbClient) => {
      const baseState = await buildStatePayload(dbClient, scope.companyId, requestedDate);
      if (!baseState.session || baseState.session.status !== "open") {
        const err = new Error("Dia financeiro precisa estar aberto para receber reforco.");
        err.statusCode = 409;
        throw err;
      }
      await dbClient.query(
        `
        UPDATE finance_day_sessions
        SET
          reinforcement_total = ROUND((COALESCE(reinforcement_total, 0) + $1)::numeric, 2),
          notes_open = CASE
            WHEN $2::text IS NULL OR BTRIM($2::text) = '' THEN notes_open
            WHEN notes_open IS NULL OR BTRIM(notes_open) = '' THEN $2::text
            ELSE CONCAT(notes_open, E'\\n', $2::text)
          END,
          updated_at = NOW()
        WHERE id = $3
        `,
        [reinforcementAmount, note || null, baseState.session.id],
      );
      await appendFinanceAudit(dbClient, {
        companyId: scope.companyId,
        sessionId: baseState.session.id,
        businessDate: baseState.businessDate,
        actionType: "reinforcement",
        actorUserId: Number(req.user?.id) || null,
        actorName: String(req.user?.fullName || req.user?.email || "Sistema"),
        note: note || null,
        payload: {
          amount: round2(reinforcementAmount),
        },
      });
      return buildStatePayload(dbClient, scope.companyId, baseState.businessDate);
    });

    void notifyCaixaMovement({
      companyId: scope.companyId,
      actionType: "reinforcement",
      actorName: String(req.user?.fullName || req.user?.email || "Sistema"),
      amount: Number(req.body?.amount || 0),
      note: String(req.body?.note || "").trim() || null,
      sessionId: state?.session?.id || null,
    }).catch(() => undefined);

    return res.json({
      message: "Reforco registado com sucesso.",
      state,
    });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  }
});

financeSessionRouter.post("/close", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para fechar o dia financeiro." });
    }
    if (!ensureRoleAllowed(req, res)) return undefined;

    const requestedDate = parseIsoDate(req.body?.businessDate);
    if (String(req.body?.businessDate || "").trim() && !requestedDate) {
      return res.status(400).json({ message: "Data invalida. Use formato YYYY-MM-DD." });
    }
    const notesClose = String(req.body?.notesClose || "").trim();
    const actorUserId = Number(req.user?.id) || null;
    const actorName = String(req.user?.fullName || req.user?.email || "Sistema");

    const result = await withTransaction(async (dbClient) => {
      const state = await buildStatePayload(dbClient, scope.companyId, requestedDate);
      if (!state.session || state.session.status !== "open") {
        const err = new Error("Nao existe dia financeiro aberto para fechar.");
        err.statusCode = 409;
        throw err;
      }
      const session = state.session;
      const flows = state.todayFlows;
      const closingBalance = round2(
        Number(session.openingBalance || 0)
          + Number(session.openingCapital || 0)
          + Number(session.reinforcementTotal || 0)
          + Number(flows.reimbursements || 0)
          - Number(flows.disbursements || 0)
          - Number(flows.expenses || 0),
      );

      await dbClient.query(
        `
        UPDATE finance_day_sessions
        SET
          status = 'closed',
          closed_at = NOW(),
          closed_by_user_id = $1,
          closed_by_name = $2,
          closing_balance = $3,
          closing_disbursements = $4,
          closing_reimbursements = $5,
          closing_expenses = $6,
          notes_close = $7,
          updated_at = NOW()
        WHERE id = $8
        `,
        [
          actorUserId,
          actorName,
          closingBalance,
          round2(flows.disbursements),
          round2(flows.reimbursements),
          round2(flows.expenses),
          notesClose || null,
          session.id,
        ],
      );
      await appendFinanceAudit(dbClient, {
        companyId: scope.companyId,
        sessionId: session.id,
        businessDate: state.businessDate,
        actionType: "close",
        actorUserId,
        actorName,
        note: notesClose || null,
        payload: {
          closingBalance,
          disbursements: round2(flows.disbursements),
          reimbursements: round2(flows.reimbursements),
          expenses: round2(flows.expenses),
        },
      });

      const newState = await buildStatePayload(dbClient, scope.companyId, state.businessDate);
      return {
        businessDate: state.businessDate,
        closedSession: {
          ...session,
          closingBalance,
          closingDisbursements: round2(flows.disbursements),
          closingReimbursements: round2(flows.reimbursements),
          closingExpenses: round2(flows.expenses),
        },
        state: newState,
      };
    });

    void notifyCaixaMovement({
      companyId: scope.companyId,
      actionType: "close_day",
      actorName: String(req.user?.fullName || req.user?.email || "Sistema"),
      amount: result.closedSession?.closingBalance ?? null,
      note: String(req.body?.notesClose || "").trim() || null,
      sessionId: result.closedSession?.id || null,
    }).catch(() => undefined);

    return res.json({
      message: "Fecho do dia financeiro concluido com sucesso.",
      shouldLogout: true,
      ...result,
    });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  }
});

financeSessionRouter.get("/history", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para consultar historico financeiro." });
    }
    if (!ensureRoleAllowed(req, res)) return undefined;

    const limitRaw = Number(req.query?.limit || 15);
    const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(60, limitRaw)) : 15;
    const result = await query(
      `
      SELECT *
      FROM finance_day_sessions
      WHERE company_id = $1
      ORDER BY business_date DESC, id DESC
      LIMIT $2
      `,
      [scope.companyId, limit],
    );
    return res.json({
      sessions: result.rows.map((row) => mapSessionRow(row)),
    });
  } catch (error) {
    return next(error);
  }
});

financeSessionRouter.get("/audit", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para consultar auditoria financeira." });
    }
    if (!ensureRoleAllowed(req, res)) return undefined;

    const limitRaw = Number(req.query?.limit || 30);
    const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(120, limitRaw)) : 30;
    const result = await query(
      `
      SELECT
        id,
        session_id,
        business_date,
        action_type,
        actor_user_id,
        actor_name,
        note,
        payload_json,
        created_at
      FROM finance_day_session_audit
      WHERE company_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      `,
      [scope.companyId, limit],
    );

    return res.json({
      records: result.rows.map((row) => mapAuditRow(row)),
    });
  } catch (error) {
    return next(error);
  }
});

financeSessionRouter.get("/reopen-audit", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para consultar auditoria de reabertura." });
    }
    if (!ensureRoleAllowed(req, res)) return undefined;

    const limitRaw = Number(req.query?.limit || 30);
    const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(120, limitRaw)) : 30;
    const result = await query(
      `
      SELECT
        id,
        session_id,
        business_date,
        previous_status,
        previous_closed_at,
        previous_closed_by_name,
        previous_closing_balance,
        reopened_by_user_id,
        reopened_by_name,
        reopen_reason,
        reopened_at
      FROM finance_day_reopen_audit
      WHERE company_id = $1
      ORDER BY reopened_at DESC, id DESC
      LIMIT $2
      `,
      [scope.companyId, limit],
    );

    return res.json({
      records: result.rows.map((row) => mapReopenAuditRow(row)),
    });
  } catch (error) {
    return next(error);
  }
});

let financeAutoCloseSchedulerStarted = false;

export async function runFinanceAutoCloseSweep() {
  await withTransaction(async (dbClient) => {
    const currentBusinessDate = await getCurrentBusinessDate(dbClient);
    await autoCloseAllStaleSessions(dbClient, currentBusinessDate);
  });
}

export function startFinanceAutoCloseScheduler({ intervalMs = 60_000 } = {}) {
  if (financeAutoCloseSchedulerStarted) return;
  financeAutoCloseSchedulerStarted = true;

  const tick = async () => {
    try {
      await runFinanceAutoCloseSweep();
    } catch (error) {
      console.error("finance-auto-close-sweep-failed", error);
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
}
