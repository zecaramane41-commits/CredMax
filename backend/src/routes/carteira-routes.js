/**
 * Carteiras API (Carteira → Subcarteira → Gestores/Subgestores → Clientes → Créditos)
 *
 * Cada carteira tem um gestor responsável. Uma carteira (raiz) pode conter várias
 * subcarteiras (sub-direcção). Clientes, empréstimos e reembolsos carregam carteira_id
 * para que todo movimento esteja atrelado a uma carteira/gestor. As transferências
 * permitem mover um cliente (e seus créditos) de gestor/carteira.
 */
import express from "express";
import { query, withTransaction } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";
import { notifyTransferApprovedEmail, createSystemNotification } from "../services/notification-service.js";
import { buildRiskRatios, buildRecoveryRate, buildAutomaticAlerts } from "../services/risk-metrics-service.js";

export const carteiraRouter = express.Router();

carteiraRouter.use(requireAuth);
carteiraRouter.use(requireReadWrite("visualizar.carteiras", "gerir.carteiras"));

function normalizeRole(value, fallback = "manager") {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (["admin", "manager", "agent", "operator", "assistant", "accountant"].includes(normalized)) return normalized;
  return fallback;
}

function toAsciiSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function findCarteiraById(scope, id) {
  const result = await query(
    `
    SELECT p.*,
      p_parent.name AS parent_name,
      u.full_name AS gestor_user_name,
      u.email AS gestor_user_email
    FROM portfolios p
    LEFT JOIN portfolios p_parent ON p_parent.id = p.parent_id AND p_parent.company_id = p.company_id
    LEFT JOIN users u ON u.id = p.gestor_user_id
    WHERE p.id = $1 AND p.company_id = $2
    LIMIT 1
    `,
    [Number(id), scope.companyId],
  );
  return result.rows[0] || null;
}

async function findCarteiraByCode(scope, code) {
  const result = await query(
    `
    SELECT p.*,
      p_parent.name AS parent_name,
      u.full_name AS gestor_user_name,
      u.email AS gestor_user_email
    FROM portfolios p
    LEFT JOIN portfolios p_parent ON p_parent.id = p.parent_id AND p_parent.company_id = p.company_id
    LEFT JOIN users u ON u.id = p.gestor_user_id
    WHERE p.code = $1 AND p.company_id = $2
    LIMIT 1
    `,
    [code, scope.companyId],
  );
  return result.rows[0] || null;
}

async function resolveGestor(scope, body) {
  const gestorUserId = body.gestorUserId ? Number(body.gestorUserId) : null;
  const gestorName = String(body.gestorName || body.gestor_name || "").trim();
  if (!gestorUserId && !gestorName) {
    throw { statusCode: 400, message: "Nome da carteira e Gestor responsavel sao obrigatorios." };
  }
  if (!String(body.name || "").trim()) {
    throw { statusCode: 400, message: "Nome da carteira e obrigatorio." };
  }
  let resolvedName = gestorName;
  if (gestorUserId) {
    const userRes = await query(
      `SELECT id, full_name, email, role FROM users WHERE id = $1 AND is_active = true AND (company_id = $2 OR role = 'admin')`,
      [gestorUserId, scope.companyId],
    );
    const user = userRes.rows[0];
    if (!user) throw { statusCode: 400, message: "Gestor responsavel invalido para esta empresa." };
    if (!["manager", "admin", "agent"].includes(normalizeRole(user.role))) {
      throw { statusCode: 400, message: "O gestor responsavel deve ser um gestor ou agente." };
    }
    resolvedName = user.full_name;
  }
  return { gestorUserId, gestorName: resolvedName };
}

// ─── LISTAGEM / ÁRVORE (tree) + GESTORES (?include=gestores) ───────────────
carteiraRouter.get("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const { include, gestorId } = req.query;

    if (include === "gestores") {
      const result = await query(
        `
        SELECT id, full_name AS fullName, email, role
        FROM users
        WHERE company_id = $1
          AND is_active = true
          AND role IN ('manager', 'admin', 'agent')
        ORDER BY full_name ASC
        `,
        [scope.companyId],
      );
      return res.json({ gestores: result.rows });
    }

    const gestorFilter = gestorId && Number.isInteger(Number(gestorId)) ? Number(gestorId) : null;
    const roots = await query(
      `
      SELECT p.*,
        COALESCE((SELECT COUNT(*) FROM clients WHERE carteira_id = p.id), 0) AS client_count,
        COALESCE((SELECT COUNT(*) FROM loans WHERE carteira_id = p.id AND status IN ('active','overdue','delayed')), 0) AS active_loans,
        COALESCE((SELECT COALESCE(SUM(balance),0) FROM loans WHERE carteira_id = p.id), 0) AS outstanding_balance,
        COALESCE((SELECT COALESCE(SUM(principal),0) FROM loans WHERE carteira_id = p.id), 0) AS total_disbursed
      FROM portfolios p
      WHERE p.company_id = $1 AND p.parent_id IS NULL AND p.is_active = true
      ${gestorFilter ? "AND p.gestor_user_id = $2" : ""}
      ORDER BY p.name ASC
      `,
      gestorFilter ? [scope.companyId, gestorFilter] : [scope.companyId],
    );

    const carteiras = [];
    for (const root of roots.rows) {
      const children = await query(
        `
        SELECT p.*,
          COALESCE((SELECT COUNT(*) FROM clients WHERE carteira_id = p.id), 0) AS client_count,
          COALESCE((SELECT COUNT(*) FROM loans WHERE carteira_id = p.id AND status IN ('active','overdue','delayed')), 0) AS active_loans,
          COALESCE((SELECT COALESCE(SUM(balance),0) FROM loans WHERE carteira_id = p.id), 0) AS outstanding_balance
        FROM portfolios p
        WHERE p.parent_id = $1 AND p.company_id = $2 AND p.is_active = true
        ORDER BY p.name ASC
        `,
        [root.id, scope.companyId],
      );
      carteiras.push({ ...root, children: children.rows });
    }

    return res.json({ carteiras });
  } catch (error) {
    return next(error);
  }
});

// ─── ESTATÍSTICAS POR GESTOR / CARTEIRA (relatório) ──────────────────────────
// Registada ANTES de "/:id" para evitar conflito de rota (segmento simples).
carteiraRouter.get("/stats", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const { gestorId, carteiraId } = req.query;
    const gestorFilter = gestorId && Number.isInteger(Number(gestorId)) ? Number(gestorId) : null;
    const carteiraFilter = carteiraId && Number.isInteger(Number(carteiraId)) ? Number(carteiraId) : null;

    const params = [scope.companyId];
    let joinCond = "";
    if (gestorFilter) {
      params.push(gestorFilter);
      joinCond += ` AND p.gestor_user_id = $${params.length}`;
    }
    if (carteiraFilter) {
      params.push(carteiraFilter);
      const idx = params.length;
      joinCond += ` AND (p.id = $${idx} OR p.parent_id = $${idx})`;
    }

    const result = await query(
      `
      SELECT
        p.id AS carteira_id,
        p.code AS carteira_code,
        p.name AS carteira_name,
        p.parent_id,
        p.gestor_name,
        p.gestor_user_id,
        u.full_name AS gestor_user_name,
        COUNT(DISTINCT c.id) AS total_clientes,
        COUNT(DISTINCT l.id) AS total_creditos,
        COUNT(DISTINCT CASE WHEN l.status IN ('active','overdue','delayed') THEN l.id END) AS creditos_activos,
        COALESCE(SUM(l.principal), 0)::numeric(14,2) AS total_desembolsado,
        COALESCE(SUM(l.balance), 0)::numeric(14,2) AS saldo_devido,
        COALESCE(SUM(CASE WHEN l.status IN ('active','overdue','delayed') THEN l.balance ELSE 0 END), 0)::numeric(14,2) AS saldo_activo,
        COALESCE(SUM(rp.amount_applied), 0)::numeric(14,2) AS total_reembolsado,
        COUNT(DISTINCT rp.id) AS total_reembolsos,
        COUNT(DISTINCT CASE WHEN c.created_at >= date_trunc('month', CURRENT_DATE) THEN c.id END) AS clientes_novos_mes,
        COALESCE(SUM(GREATEST(COALESCE(l.mora_accrued_posted, 0) - COALESCE(l.mora_waived_total, 0), 0)), 0)::numeric(14,2) AS mora_acumulada
      FROM portfolios p
      LEFT JOIN clients c ON c.carteira_id = p.id AND c.company_id = p.company_id
      LEFT JOIN loans l ON l.carteira_id = p.id AND l.company_id = p.company_id
      LEFT JOIN loan_repayments rp ON rp.carteira_id = p.id AND rp.company_id = p.company_id
      LEFT JOIN users u ON u.id = p.gestor_user_id
      WHERE p.company_id = $1${joinCond}
      GROUP BY p.id, p.code, p.name, p.parent_id, p.gestor_name, p.gestor_user_id, u.full_name
      ORDER BY p.name ASC
      `,
      params,
    );
    return res.json({ stats: result.rows });
  } catch (error) {
    return next(error);
  }
});

function parseReportRange(req) {
  const fromRaw = String(req.query.from || "").trim();
  const toRaw = String(req.query.to || "").trim();
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  if (fromRaw && !isoRe.test(fromRaw)) return { error: "Data inicial inválida." };
  if (toRaw && !isoRe.test(toRaw)) return { error: "Data final inválida." };
  return { from: fromRaw || null, to: toRaw || null };
}

function carteiraScopeExpr(idx) {
  return `(SELECT id FROM portfolios WHERE company_id = $1 AND (id = $${idx} OR parent_id = $${idx}))`;
}

// ─── EXTRATO DA CARTEIRA (relatório fechado por período) ──────────────────────
carteiraRouter.get("/extrato", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const carteiraId = Number(req.query.carteiraId);
    if (!Number.isInteger(carteiraId) || carteiraId <= 0) {
      return res.status(400).json({ message: "Indique a carteira para gerar o extrato." });
    }
    const range = parseReportRange(req);
    if (range.error) return res.status(400).json({ message: range.error });

    const root = await query(
      `SELECT id, code, name, gestor_name, gestor_user_id FROM portfolios WHERE id = $1 AND company_id = $2`,
      [carteiraId, scope.companyId],
    );
    const info = root.rows[0];
    if (!info) return res.status(404).json({ message: "Carteira não encontrada." });

    const baseParams = [scope.companyId, carteiraId];
    const fromP = range.from || null;
    const toP = range.to || null;

    const [desembolsos, reembolsos, saldo, clientesNovos] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(l.principal),0)::numeric(14,2) AS valor
         FROM loans l
         WHERE l.company_id = $1 AND l.carteira_id IN ${carteiraScopeExpr(2)}
           AND l.disbursement_status = 'disbursed'
           AND (($3::date IS NULL) OR l.disbursed_on >= $3::date)
           AND (($4::date IS NULL) OR l.disbursed_on <= $4::date)`,
        [scope.companyId, carteiraId, fromP, toP],
      ),
      query(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(rp.amount_applied),0)::numeric(14,2) AS valor
         FROM loan_repayments rp
         WHERE rp.company_id = $1 AND rp.carteira_id IN ${carteiraScopeExpr(2)}
           AND (($3::date IS NULL) OR rp.payment_date >= $3::date)
           AND (($4::date IS NULL) OR rp.payment_date <= $4::date)`,
        [scope.companyId, carteiraId, fromP, toP],
      ),
      query(
        `SELECT
            COALESCE(SUM(l.balance),0)::numeric(14,2) AS saldo_final,
            COALESCE(SUM(CASE WHEN l.status IN ('active','overdue','delayed') THEN l.balance ELSE 0 END),0)::numeric(14,2) AS saldo_activo,
            COALESCE(SUM(GREATEST(COALESCE(l.mora_accrued_posted,0) - COALESCE(l.mora_waived_total,0),0)),0)::numeric(14,2) AS mora,
            COUNT(DISTINCT l.id) AS creditos_total,
            COUNT(DISTINCT CASE WHEN l.days_overdue >= 30 THEN l.id END) AS creditos_mora_30
         FROM loans l
         WHERE l.company_id = $1 AND l.carteira_id IN ${carteiraScopeExpr(2)}`,
        baseParams,
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM clients c
         WHERE c.company_id = $1 AND c.carteira_id IN ${carteiraScopeExpr(2)}
           AND (($3::date IS NULL) OR COALESCE(c.registration_date, c.created_at::date) >= $3::date)
           AND (($4::date IS NULL) OR COALESCE(c.registration_date, c.created_at::date) <= $4::date)`,
        [scope.companyId, carteiraId, fromP, toP],
      ),
    ]);

    const d = saldo.rows[0] || {};
    const desp = Number(desembolsos.rows[0]?.valor || 0);
    const reemb = Number(reembolsos.rows[0]?.valor || 0);
    const saldoFinal = Number(d.saldo_final || 0);
    const saldoActivo = Number(d.saldo_activo || 0);
    const mora = Number(d.mora || 0);

    return res.json({
      carteira: {
        id: Number(info.id),
        code: info.code || "",
        name: info.name || "",
        gestorName: info.gestor_name || "—",
        gestorUserId: info.gestor_user_id ? Number(info.gestor_user_id) : null,
      },
      periodo: { from: range.from, to: range.to },
      extrato: {
        desembolsos: { total: Number(desembolsos.rows[0]?.total || 0), valor: desp },
        reembolsos: { total: Number(reembolsos.rows[0]?.total || 0), valor: reemb },
        mora,
        saldoFinal,
        saldoInicial: Math.round((saldoFinal - desp + reemb) * 100) / 100,
        creditoTotal: Number(d.creditos_total || 0),
        creditosMora30: Number(d.creditos_mora_30 || 0),
        clientesNovos: Number(clientesNovos.rows[0]?.total || 0),
        taxaMora: saldoActivo > 0 ? Math.round((mora / saldoActivo) * 10000) / 100 : 0,
      },
      assinatura: {
        gestor: info.gestor_name || "—",
        data: new Date().toISOString().slice(0, 10),
      },
    });
  } catch (error) {
    return next(error);
  }
});

// ─── RELATÓRIO CONSOLIDADO DA EMPRESA COM DRILL-DOWN POR CARTEIRA ─────────────
carteiraRouter.get("/consolidado", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const range = parseReportRange(req);
    if (range.error) return res.status(400).json({ message: range.error });

    const rows = await query(
      `
      SELECT
        p.id AS carteira_id,
        p.code AS carteira_code,
        p.name AS carteira_name,
        p.parent_id,
        p.gestor_name,
        COUNT(DISTINCT c.id) AS total_clientes,
        COUNT(DISTINCT CASE WHEN COALESCE(c.registration_date, c.created_at::date) >= COALESCE($2::date, '1900-01-01')
                            AND COALESCE(c.registration_date, c.created_at::date) <= COALESCE($3::date, '9999-12-31') THEN c.id END) AS clientes_novos,
        COUNT(DISTINCT CASE WHEN l.disbursement_status = 'disbursed'
                            AND l.disbursed_on >= COALESCE($2::date, '1900-01-01')
                            AND l.disbursed_on <= COALESCE($3::date, '9999-12-31') THEN l.id END) AS desembolsos,
        COALESCE(SUM(CASE WHEN l.disbursement_status = 'disbursed'
                          AND l.disbursed_on >= COALESCE($2::date, '1900-01-01')
                          AND l.disbursed_on <= COALESCE($3::date, '9999-12-31') THEN l.principal ELSE 0 END),0)::numeric(14,2) AS desembolsado_valor,
        COUNT(DISTINCT CASE WHEN rp.payment_date >= COALESCE($2::date, '1900-01-01')
                            AND rp.payment_date <= COALESCE($3::date, '9999-12-31') THEN rp.id END) AS reembolsos,
        COALESCE(SUM(CASE WHEN rp.payment_date >= COALESCE($2::date, '1900-01-01')
                          AND rp.payment_date <= COALESCE($3::date, '9999-12-31') THEN rp.amount_applied ELSE 0 END),0)::numeric(14,2) AS reembolsado_valor,
        COALESCE(SUM(CASE WHEN l.status IN ('active','overdue','delayed') THEN l.balance ELSE 0 END),0)::numeric(14,2) AS saldo_activo,
        COALESCE(SUM(GREATEST(COALESCE(l.mora_accrued_posted,0) - COALESCE(l.mora_waived_total,0),0)),0)::numeric(14,2) AS mora
      FROM portfolios p
      LEFT JOIN clients c ON c.carteira_id = p.id AND c.company_id = p.company_id
      LEFT JOIN loans l ON l.carteira_id = p.id AND l.company_id = p.company_id
      LEFT JOIN loan_repayments rp ON rp.carteira_id = p.id AND rp.company_id = p.company_id
      WHERE p.company_id = $1
      GROUP BY p.id, p.code, p.name, p.parent_id, p.gestor_name
      ORDER BY p.parent_id NULLS FIRST, p.name ASC
      `,
      [scope.companyId, range.from || null, range.to || null],
    );

    const carteiras = rows.rows.map((row) => {
      const m = Number(row.mora || 0);
      const saldo = Number(row.saldo_activo || 0);
      return {
        carteiraId: Number(row.carteira_id),
        code: row.carteira_code || "",
        name: row.carteira_name || "",
        parentId: row.parent_id ? Number(row.parent_id) : null,
        gestorName: row.gestor_name || "—",
        totalClientes: Number(row.total_clientes || 0),
        clientesNovos: Number(row.clientes_novos || 0),
        desembolsos: Number(row.desembolsos || 0),
        desembolsadoValor: Number(row.desembolsado_valor || 0),
        reembolsos: Number(row.reembolsos || 0),
        reembolsadoValor: Number(row.reembolsado_valor || 0),
        saldoAtual: saldo,
        mora: m,
        taxaMora: saldo > 0 ? Math.round((m / saldo) * 10000) / 100 : 0,
      };
    });

    const totals = carteiras.reduce(
      (acc, cw) => {
        acc.totalClientes += cw.totalClientes;
        acc.clientesNovos += cw.clientesNovos;
        acc.desembolsos += cw.desembolsos;
        acc.desembolsadoValor += cw.desembolsadoValor;
        acc.reembolsos += cw.reembolsos;
        acc.reembolsadoValor += cw.reembolsadoValor;
        acc.saldoAtual += cw.saldoAtual;
        acc.mora += cw.mora;
        return acc;
      },
      { totalClientes: 0, clientesNovos: 0, desembolsos: 0, desembolsadoValor: 0, reembolsos: 0, reembolsadoValor: 0, saldoAtual: 0, mora: 0 },
    );
    totals.taxaMora = totals.saldoAtual > 0 ? Math.round((totals.mora / totals.saldoAtual) * 10000) / 100 : 0;

    return res.json({ periodo: { from: range.from, to: range.to }, totals, carteiras });
  } catch (error) {
    return next(error);
  }
});

// ─── RÁCIOS DE RISCO POR CARTEIRA (Fase 5.4) ──────────────────────────────────
carteiraRouter.get("/risco", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const range = parseReportRange(req);
    if (range.error) return res.status(400).json({ message: range.error });

    const rows = await query(
      `
      SELECT
        p.id AS carteira_id,
        p.name AS carteira_name,
        p.gestor_name,
        COALESCE(SUM(CASE WHEN l.status IN ('active','overdue','delayed') THEN l.balance ELSE 0 END),0)::numeric(14,2) AS outstanding,
        COALESCE(SUM(CASE WHEN l.status IN ('active','overdue','delayed') AND l.days_overdue >= 30 THEN l.balance ELSE 0 END),0)::numeric(14,2) AS overdue30,
        COALESCE(SUM(CASE WHEN l.status IN ('active','overdue','delayed') AND l.days_overdue >= 90 THEN l.balance ELSE 0 END),0)::numeric(14,2) AS overdue90,
        COALESCE(SUM(CASE WHEN l.disbursement_status = 'disbursed' THEN l.principal ELSE 0 END),0)::numeric(14,2) AS disbursed_valor,
        COALESCE(SUM(GREATEST(COALESCE(l.mora_accrued_posted,0) - COALESCE(l.mora_waived_total,0),0)),0)::numeric(14,2) AS mora,
        COALESCE((SELECT SUM(pay.amount_applied) FROM loan_repayments pay
                  WHERE pay.company_id = $1 AND pay.carteira_id IN (
                    SELECT sub.id FROM portfolios sub WHERE sub.company_id = $1 AND (sub.id = p.id OR sub.parent_id = p.id)
                  )),0)::numeric(14,2) AS recovered
      FROM portfolios p
      LEFT JOIN loans l ON l.carteira_id = p.id AND l.company_id = p.company_id
      WHERE p.company_id = $1
        AND ($2::date IS NULL OR COALESCE(l.disbursed_on, l.created_at::date) >= $2::date)
      GROUP BY p.id, p.name, p.gestor_name
      ORDER BY p.name ASC
      `,
      [scope.companyId, range.from || null],
    );

    const items = rows.rows.map((row) => {
      const outstanding = Number(row.outstanding || 0);
      const ratios = buildRiskRatios({
        outstandingBalance: outstanding,
        overdueBalance30: Number(row.overdue30 || 0),
        overdueBalance90: Number(row.overdue90 || 0),
      });
      const recovery = buildRecoveryRate({
        disbursedPrincipal: Number(row.disbursed_valor || 0),
        recoveredPrincipal: Number(row.recovered || 0),
      });
      const mora = Number(row.mora || 0);
      return {
        carteiraId: Number(row.carteira_id),
        carteiraName: row.carteira_name || "",
        gestorName: row.gestor_name || "—",
        outstanding,
        par30: ratios.par30,
        npl90: ratios.npl90,
        recoveryRate: recovery,
        mora,
        taxaMora: outstanding > 0 ? Math.round((mora / outstanding) * 10000) / 100 : 0,
      };
    });

    const blob = items.length > 0
      ? {
          par30: items.reduce((s, i) => s + i.par30, 0) / items.length,
          npl90: items.reduce((s, i) => s + i.npl90, 0) / items.length,
          recoveryRate: items.reduce((s, i) => s + i.recoveryRate, 0) / items.length,
          managerRows: items.map((i) => ({ managerName: i.gestorName, par30: i.par30 })),
        }
      : { par30: 0, npl90: 0, recoveryRate: 0, managerRows: [] };
    const alerts = buildAutomaticAlerts(blob);

    return res.json({ items, alerts });
  } catch (error) {
    return next(error);
  }
});

// ─── CRIAR CARTEIRA / SUBCARTEIRA ─────────────────────────────────────────────
// Exige Nome da carteira + Gestor responsável. Se `parentId` for informado,
// cria uma subcarteira (sub-direcção) da carteira indicada.
carteiraRouter.post("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });

    const name = String(req.body.name || "").trim();
    const parentId = req.body.parentId ? Number(req.body.parentId) : null;
    const description = String(req.body.description || "").trim() || null;

    let gestor;
    try {
      gestor = await resolveGestor(scope, { ...req.body, name });
    } catch (e) {
      if (e && e.statusCode) return res.status(e.statusCode).json({ message: e.message });
      throw e;
    }

    // Valida parent (se subcarteira)
    if (parentId) {
      const parent = await findCarteiraById(scope, parentId);
      if (!parent) return res.status(404).json({ message: "Carteira principal não encontrada." });
    }

    // Código único dentro da empresa
    let code = toAsciiSlug(name) || `carteira-${Date.now()}`;
    const exists = await findCarteiraByCode(scope, code);
    if (exists) code = `${code}-${Date.now().toString(36)}`;

    // Subgestores (opcional): cada um recebe automaticamente uma subcarteira
    const subGestorIds = Array.isArray(req.body.subGestores)
      ? req.body.subGestores.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (parentId && subGestorIds.length > 0) {
      return res.status(400).json({ message: "Subgestores só podem ser definidos na carteira principal." });
    }

    const created = await withTransaction(async (tx) => {
      const insert = await tx.query(
        `
        INSERT INTO portfolios (company_id, code, name, description, parent_id, gestor_name, gestor_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [scope.companyId, code, name, description, parentId, gestor.gestorName, gestor.gestorUserId],
      );
      const carteira = insert.rows[0];

      for (const subUserId of subGestorIds) {
        if (subUserId === Number(gestor.gestorUserId)) continue; // gestor principal não duplica
        const u = await tx.query(
          `SELECT id, full_name FROM users WHERE id = $1 AND company_id = $2 AND is_active = true LIMIT 1`,
          [subUserId, scope.companyId],
        );
        const subUser = u.rows[0];
        if (!subUser) continue;
        let subCode = toAsciiSlug(`${name}-${subUser.full_name}`) || `sub-${Date.now()}`;
        const subExists = await findCarteiraByCode(scope, subCode);
        if (subExists) subCode = `${subCode}-${Date.now().toString(36)}`;
        await tx.query(
          `
          INSERT INTO portfolios (company_id, code, name, description, parent_id, gestor_name, gestor_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            scope.companyId,
            subCode,
            `${name} — ${subUser.full_name}`,
            description ? `${description} (subgestor)` : "Subcarteira de subgestor",
            carteira.id,
            subUser.full_name,
            subUser.id,
          ],
        );
      }
      return carteira;
    });

    return res.status(201).json({ carteira: created });
  } catch (error) {
    if (error && error.code === "23505") {
      return res.status(409).json({ message: "Já existe uma carteira com este nome ou código." });
    }
    return next(error);
  }
});

// ─── TRANSFERÊNCIAS: listar histórico ────────────────────────────────────────
// Registada ANTES de "/:id" para evitar conflito de rota (segmento simples).
carteiraRouter.get("/transfers", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const params = [scope.companyId];
    let where = "pt.company_id = $1";
    if (req.query.clientId && Number.isInteger(Number(req.query.clientId))) {
      params.push(Number(req.query.clientId));
      where += ` AND pt.client_id = $${params.length}`;
    }
    if (req.query.status && ["pending", "approved", "rejected", "cancelled"].includes(String(req.query.status))) {
      params.push(String(req.query.status));
      where += ` AND pt.status = $${params.length}`;
    }
    const result = await query(
      `
      SELECT pt.*,
        c.name AS client_name,
        lo.name AS origin_portfolio_name,
        ld.name AS dest_portfolio_name
      FROM portfolio_transfers pt
      LEFT JOIN clients c ON c.id = pt.client_id
      LEFT JOIN portfolios lo ON lo.id = pt.origin_portfolio_id
      LEFT JOIN portfolios ld ON ld.id = pt.dest_portfolio_id
      WHERE ${where}
      ORDER BY pt.created_at DESC
      LIMIT 200
      `,
      params,
    );
    return res.json({ transfers: result.rows });
  } catch (error) {
    return next(error);
  }
});

// ─── TRANSFERÊNCIAS: pedir transferência de cliente (e créditos) ──────────────
carteiraRouter.post("/transfers", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });

    const clientId = Number(req.body.clientId);
    const destPortfolioId = Number(req.body.destPortfolioId);
    const reason = String(req.body.reason || "").trim() || null;
    const autoApprove = req.body.autoApprove === true;

    if (!Number.isInteger(clientId)) return res.status(400).json({ message: "Cliente é obrigatório." });
    if (!Number.isInteger(destPortfolioId)) return res.status(400).json({ message: "Carteira de destino é obrigatória." });

    const transfer = await withTransaction(async (tx) => {
      const clientRes = await tx.query(
        `SELECT id, name, carteira_id FROM clients WHERE id = $1 AND company_id = $2 LIMIT 1`,
        [clientId, scope.companyId],
      );
      const client = clientRes.rows[0];
      if (!client) throw { statusCode: 404, message: "Cliente não encontrado." };
      if (client.carteira_id === destPortfolioId) {
        throw { statusCode: 400, message: "O cliente já pertence a esta carteira." };
      }

      const destRes = await tx.query(
        `SELECT id FROM portfolios WHERE id = $1 AND company_id = $2 AND is_active = true LIMIT 1`,
        [destPortfolioId, scope.companyId],
      );
      if (!destRes.rows[0]) throw { statusCode: 404, message: "Carteira de destino não encontrada." };

      const transferRes = await tx.query(
        `
        INSERT INTO portfolio_transfers
          (company_id, client_id, origin_portfolio_id, dest_portfolio_id, reason, status,
           requested_by_user_id, requested_by_name, approved_by_user_id, approved_by_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [
          scope.companyId,
          clientId,
          client.carteira_id || null,
          destPortfolioId,
          reason,
          autoApprove ? "approved" : "pending",
          req.user?.id || null,
          req.user?.full_name || null,
          autoApprove ? req.user?.id || null : null,
          autoApprove ? req.user?.full_name || null : null,
        ],
      );

      if (autoApprove) {
        // Move cliente + créditos do cliente para a carteira destino
        await tx.query(`UPDATE clients SET carteira_id = $2 WHERE id = $1`, [clientId, destPortfolioId]);
        await tx.query(`UPDATE loans SET carteira_id = $2 WHERE client_id = $1`, [clientId, destPortfolioId]);
        await tx.query(
          `UPDATE loan_repayments rp SET carteira_id = l.carteira_id FROM loans l WHERE rp.loan_id = l.id AND l.client_id = $1`,
          [clientId],
        );
      }
      return transferRes.rows[0];
    });
    return res.status(201).json({ transfer });
  } catch (error) {
    if (error && error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  }
});

// ─── APROVAR / REJEITAR TRANSFERÊNCIA PENDENTE ────────────────────────────────
carteiraRouter.post("/transfers/:transferId/decision", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const transferId = Number(req.params.transferId);
    const decision = String(req.body.decision || "").toLowerCase(); // approve | reject
    if (!Number.isInteger(transferId)) return res.status(400).json({ message: "Transferência inválida." });
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ message: 'Decisão deve ser "approve" ou "reject".' });
    }

    const result = await withTransaction(async (tx) => {
      const tRes = await tx.query(
        `SELECT * FROM portfolio_transfers WHERE id = $1 AND company_id = $2 AND status = 'pending' LIMIT 1`,
        [transferId, scope.companyId],
      );
      const transfer = tRes.rows[0];
      if (!transfer) throw { statusCode: 404, message: "Transferência pendente não encontrada." };

      const newStatus = decision === "approve" ? "approved" : "rejected";
      await tx.query(
        `UPDATE portfolio_transfers SET status = $2, approved_by_user_id = $3, approved_by_name = $4, updated_at = now() WHERE id = $1`,
        [transferId, newStatus, req.user?.id || null, req.user?.full_name || null],
      );

      if (decision === "approve") {
        // Move cliente + créditos do cliente para a carteira destino
        await tx.query(`UPDATE clients SET carteira_id = $2 WHERE id = $1`, [transfer.client_id, transfer.dest_portfolio_id]);
        await tx.query(`UPDATE loans SET carteira_id = $2 WHERE client_id = $1`, [transfer.client_id, transfer.dest_portfolio_id]);
        await tx.query(
          `UPDATE loan_repayments rp SET carteira_id = l.carteira_id FROM loans l WHERE rp.loan_id = l.id AND l.client_id = $1`,
          [transfer.client_id],
        );
      }
      return { ...transfer, status: newStatus };
    });
    if (decision === "approve") {
      void (async () => {
        try {
          const extra = await query(
            `SELECT c.name AS client_name, c.email AS client_email,
                    op.gestor_name AS from_manager, dp.gestor_name AS to_manager, dp.name AS portfolio
             FROM portfolio_transfers t
             JOIN clients c ON c.id = t.client_id
             LEFT JOIN portfolios op ON op.id = t.origin_portfolio_id
             LEFT JOIN portfolios dp ON dp.id = t.dest_portfolio_id
             WHERE t.id = $1 AND t.company_id = $2`,
            [transferId, scope.companyId],
          ).then((r) => r.rows[0]).catch(() => null);
          if (!extra) return;
          await notifyTransferApprovedEmail({
            companyId: scope.companyId,
            clientId: Number(result.client_id),
            clientName: extra.client_name || "Cliente",
            clientEmail: extra.client_email || null,
            fromManager: extra.from_manager || "-",
            toManager: extra.to_manager || "-",
            portfolio: extra.portfolio || "-",
          });
          await createSystemNotification({
            companyId: scope.companyId,
            userId: null,
            category: "carteira",
            severity: "success",
            title: "Transferência aprovada",
            message: `${extra.client_name || "Cliente"} foi movido para a carteira ${extra.portfolio || "-"}.`,
            referenceType: "portfolio_transfer",
            referenceId: transferId,
          });
        } catch {
          /* best-effort */
        }
      })();
    }
    return res.json({ transfer: result });
  } catch (error) {
    if (error && error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  }
});

// ─── DETALHE DA CARTEIRA ──────────────────────────────────────────────────────
carteiraRouter.get("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const carteira = await findCarteiraById(scope, req.params.id);
    if (!carteira) return res.status(404).json({ message: "Carteira não encontrada." });

    const children = await query(
      `SELECT id, code, name FROM portfolios WHERE parent_id = $1 AND company_id = $2 AND is_active = true ORDER BY name ASC`,
      [carteira.id, scope.companyId],
    );
    const resumo = await query(
      `
      SELECT
        COUNT(DISTINCT c.id) AS total_clientes,
        COUNT(DISTINCT l.id) AS total_creditos,
        COUNT(DISTINCT CASE WHEN l.status IN ('active','overdue','delayed') THEN l.id END) AS creditos_activos,
        COALESCE(SUM(l.principal), 0)::numeric(14,2) AS total_desembolsado,
        COALESCE(SUM(l.balance), 0)::numeric(14,2) AS saldo_devido
      FROM portfolios p
      LEFT JOIN clients c ON c.carteira_id = p.id
      LEFT JOIN loans l ON l.carteira_id = p.id
      WHERE p.company_id = $2 AND (p.id = $1 OR p.parent_id = $1)
      `,
      [carteira.id, scope.companyId],
    );
    return res.json({
      carteira: { ...carteira, children: children.rows, resumo: resumo.rows[0] || null },
    });
  } catch (error) {
    return next(error);
  }
});

// ─── ACTUALIZAR CARTEIRA ──────────────────────────────────────────────────────
carteiraRouter.put("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const existing = await findCarteiraById(scope, req.params.id);
    if (!existing) return res.status(404).json({ message: "Carteira não encontrada." });

    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: "Nome da carteira é obrigatório." });
      updates.name = name;
    }
    if (req.body.description !== undefined) updates.description = String(req.body.description).trim() || null;
    if (req.body.isActive !== undefined) updates.is_active = Boolean(req.body.isActive);

    if (req.body.gestorUserId || req.body.gestorUserId === null || req.body.gestorName) {
      try {
        const gestor = await resolveGestor(scope, req.body);
        updates.gestor_user_id = gestor.gestorUserId;
        updates.gestor_name = gestor.gestorName;
      } catch (e) {
        if (e && e.statusCode) return res.status(e.statusCode).json({ message: e.message });
        throw e;
      }
    }

    const keys = Object.keys(updates);
    if (!keys.length) return res.json({ carteira: existing });
    const setSql = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
    const params = [existing.id, scope.companyId, ...keys.map((k) => updates[k])];
    const result = await query(
      `UPDATE portfolios SET ${setSql}, updated_at = now() WHERE id = $1 AND company_id = $2 RETURNING *`,
      params,
    );
    return res.json({ carteira: result.rows[0] });
  } catch (error) {
    if (error && error.code === "23505") {
      return res.status(409).json({ message: "Já existe uma carteira com este nome ou código." });
    }
    return next(error);
  }
});

// ─── REMOVER (soft delete) ────────────────────────────────────────────────────
carteiraRouter.delete("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const existing = await findCarteiraById(scope, req.params.id);
    if (!existing) return res.status(404).json({ message: "Carteira não encontrada." });

    const inUse = await query(`SELECT COUNT(*)::int AS n FROM clients WHERE carteira_id = $1`, [existing.id]);
    if (inUse.rows[0].n > 0) {
      return res.status(409).json({
        message: "Não é possível remover: existem clientes atribuídos a esta carteira. Transfira-os primeiro.",
      });
    }
    await query(`UPDATE portfolios SET is_active = false, updated_at = now() WHERE id = $1 AND company_id = $2`, [
      existing.id,
      scope.companyId,
    ]);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});








