import express from "express";
import rateLimit from "express-rate-limit";
import { query, withTransaction } from "../config/db.js";
import { requirePortalAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { comparePassword, hashPassword, signToken } from "../utils/security.js";
import { validatePasswordAgainstPolicy } from "../utils/password-policy.js";
import { advanceToState, listTimeline } from "../services/process-log-service.js";
import { publishAppEvent } from "../services/event-bus.js";
import { applicationSchema, loginSchema, registerSchema, simulateSchema } from "../validators/portal.js";
import { buildInstallments, getApprovalPolicy, normalizeRatePercent, resolveRiskEvaluation } from "./loan-routes.js";

export const portalRouter = express.Router();

// Fase 2.2 — Portal Público do Cliente: registo/login/simulação/pedidos públicos.
const PORTAL_TOKEN_EXPIRES_IN = "7d";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados registos. Tente novamente mais tarde." },
});
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas tentativas de login. Tente novamente em 15 minutos." },
});
const simulateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas simulacoes. Aguarde alguns minutos e tente novamente." },
});
const applicationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados pedidos submetidos. Aguarde alguns minutos e tente novamente." },
});

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Constrói datas (desembolso/vencimento/1ª prestação) e cronograma do portal,
 * espelhando as regras internas do simulador de `loan-routes.js`.
 */
function buildPortalSchedule({ amount, rate, paymentFrequency, periodMonths }) {
  const today = new Date();
  const disbursed = today.toISOString().slice(0, 10);
  const maturityDate = new Date(today);
  maturityDate.setMonth(maturityDate.getMonth() + periodMonths);
  const maturity = maturityDate.toISOString().slice(0, 10);
  const nextPaymentDate = new Date(today);
  nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
  const nextPayment = nextPaymentDate.toISOString().slice(0, 10);

  const schedule = buildInstallments({
    amount,
    rate,
    amortizationMethod: "price",
    paymentFrequency,
    paymentDays: [],
    disbursed,
    maturity,
    nextPayment,
  });
  if (!schedule.valid) return schedule;

  const rows = schedule.rows || [];
  const totalPayment = round2(rows.reduce((sum, row) => sum + Number(row.paymentAmount || 0), 0));
  const totalPrincipal = round2(rows.reduce((sum, row) => sum + Number(row.principalAmount || 0), 0));
  const totalInterest = round2(rows.reduce((sum, row) => sum + Number(row.interestAmount || 0), 0));

  return {
    valid: true,
    dates: { disbursed, maturity, nextPayment },
    rows,
    summary: {
      installments: rows.length,
      firstPayment: Number(rows[0]?.paymentAmount || 0),
      lastPayment: Number(rows[rows.length - 1]?.paymentAmount || 0),
      totalPayment,
      totalPrincipal,
      totalInterest,
    },
  };
}

async function registerFailedPortalAttempt(account) {
  const nextAttempts = Number(account.failed_login_attempts || 0) + 1;
  if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
    await query(
      `UPDATE portal_accounts
       SET failed_login_attempts = 0, locked_until = NOW() + ($2::text || ' minutes')::interval, updated_at = NOW()
       WHERE id = $1`,
      [account.id, String(LOCKOUT_MINUTES)],
    );
    return true;
  }
  await query(
    "UPDATE portal_accounts SET failed_login_attempts = $2, updated_at = NOW() WHERE id = $1",
    [account.id, nextAttempts],
  );
  return false;
}

// ---------------------------------------------------------------------------
// Acesso público (sem token)
// ---------------------------------------------------------------------------

portalRouter.get("/companies", async (req, res, next) => {
  try {
    const result = await query(
      "SELECT id, name, nuit FROM companies WHERE is_active = true ORDER BY name ASC",
    );
    return res.json({
      companies: result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        nuit: row.nuit || "",
      })),
    });
  } catch (error) {
    return next(error);
  }
});

portalRouter.post("/register", registerRateLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { fullName, email, phone, documentNumber, password, companyId } = req.body;

    const passwordCheck = validatePasswordAgainstPolicy(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ message: passwordCheck.errors[0], errors: passwordCheck.errors });
    }

    const companyResult = await query(
      "SELECT id, name FROM companies WHERE id = $1 AND is_active = true",
      [companyId],
    );
    if (!companyResult.rows[0]) {
      return res.status(400).json({ message: "Empresa selecionada indisponivel para registo." });
    }

    const existingAccount = await query(
      "SELECT id FROM portal_accounts WHERE company_id = $1 AND LOWER(email) = $2",
      [companyId, email],
    );
    if (existingAccount.rows[0]) {
      return res.status(409).json({ message: "Ja existe uma conta de portal com este email nesta empresa." });
    }

    // Liga a um cliente existente (email/documento/NUIT) ou cria registo novo em `clients`.
    const linked = await query(
      `SELECT id FROM clients
       WHERE company_id = $1
         AND (LOWER(COALESCE(email, '')) = $2 OR document_number = $3 OR nuit = $3)
       ORDER BY id ASC
       LIMIT 1`,
      [companyId, email, documentNumber],
    );

    let clientId;
    if (linked.rows[0]) {
      clientId = Number(linked.rows[0].id);
    } else {
      const insertedClient = await query(
        `INSERT INTO clients (name, client_type, nuit, phone, email, document_number, company_id, status, created_by_name)
         VALUES ($1, 'singular', $2, $3, $4, $5, $6, 'active', 'Portal Publico')
         RETURNING id`,
        [fullName, documentNumber, phone, email, documentNumber, companyId],
      );
      clientId = Number(insertedClient.rows[0].id);
    }

    const passwordHash = await hashPassword(password);
    let accountResult;
    try {
      accountResult = await query(
        `INSERT INTO portal_accounts (company_id, client_id, full_name, email, phone, document_number, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [companyId, clientId, fullName, email, phone, documentNumber, passwordHash],
      );
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "Ja existe uma conta de portal com este email nesta empresa." });
      }
      throw error;
    }

    const portalId = Number(accountResult.rows[0].id);
    const token = signToken({ kind: "portal", portalId, companyId, clientId }, PORTAL_TOKEN_EXPIRES_IN);

    return res.status(201).json({
      token,
      account: {
        id: portalId,
        fullName,
        email,
        phone,
        documentNumber,
        companyId,
        clientId,
      },
    });
  } catch (error) {
    return next(error);
  }
});

portalRouter.post("/login", loginRateLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const companyId = Number(req.body.companyId) > 0 ? Number(req.body.companyId) : null;

    const params = companyId ? [email, companyId] : [email];
    const accounts = await query(
      `SELECT id, company_id, client_id, full_name, email, phone, document_number, password_hash,
              is_active, failed_login_attempts, locked_until
       FROM portal_accounts
       WHERE LOWER(email) = $1 ${companyId ? "AND company_id = $2" : ""}
       ORDER BY id ASC`,
      params,
    );

    if (accounts.rows.length === 0) {
      return res.status(401).json({ message: "Credenciais invalidas." });
    }
    if (accounts.rows.length > 1 && !companyId) {
      return res.status(400).json({ message: "Multiplos registos encontrados. Selecione a empresa para aceder." });
    }

    const account = accounts.rows[0];
    if (!account.is_active) {
      return res.status(403).json({ message: "Conta suspensa ou inativa." });
    }
    if (account.locked_until && new Date(account.locked_until) > new Date()) {
      return res.status(423).json({ message: "Conta bloqueada por tentativas invalidas. Tente novamente mais tarde." });
    }

    const validPassword = await comparePassword(password, account.password_hash);
    if (!validPassword) {
      const lockedNow = await registerFailedPortalAttempt(account);
      if (lockedNow) {
        return res.status(423).json({ message: "Conta bloqueada por tentativas invalidas. Tente novamente mais tarde." });
      }
      return res.status(401).json({ message: "Credenciais invalidas." });
    }

    await query(
      "UPDATE portal_accounts SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW() WHERE id = $1",
      [account.id],
    );

    const portalId = Number(account.id);
    const token = signToken(
      { kind: "portal", portalId, companyId: Number(account.company_id), clientId: Number(account.client_id) },
      PORTAL_TOKEN_EXPIRES_IN,
    );

    return res.json({
      token,
      account: {
        id: portalId,
        fullName: account.full_name,
        email: account.email,
        phone: account.phone,
        documentNumber: account.document_number || "",
        companyId: Number(account.company_id),
        clientId: Number(account.client_id),
      },
    });
  } catch (error) {
    return next(error);
  }
});

portalRouter.post("/simulate", simulateRateLimiter, validateBody(simulateSchema), async (req, res, next) => {
  try {
    const { companyId, amount, periodMonths, paymentFrequency } = req.body;

    const companyResult = await query(
      "SELECT id FROM companies WHERE id = $1 AND is_active = true",
      [companyId],
    );
    if (!companyResult.rows[0]) {
      return res.status(400).json({ message: "Empresa indisponivel para simulacao." });
    }

    const policy = await getApprovalPolicy(companyId);
    if (periodMonths > policy.maxLoanTermMonths) {
      return res.status(400).json({
        message: `O prazo maximo para simulacao e de ${policy.maxLoanTermMonths} meses.`,
      });
    }

    const rate =
      req.body.monthlyRatePercent !== undefined
        ? normalizeRatePercent(req.body.monthlyRatePercent)
        : Number(policy.defaultInterestRate || 0);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ message: "Taxa de juro invalida." });
    }

    const schedule = buildPortalSchedule({ amount, rate, paymentFrequency, periodMonths });
    if (!schedule.valid) {
      return res.status(400).json({ message: schedule.message });
    }

    return res.json({
      simulation: {
        companyId,
        amount,
        periodMonths,
        paymentFrequency,
        rate,
        amortizationMethod: "price",
        dates: schedule.dates,
        summary: schedule.summary,
        schedule: schedule.rows.map((row) => ({
          installmentNo: Number(row.installmentNo),
          dueDate: row.dueDate,
          paymentAmount: Number(row.paymentAmount || 0),
          principalAmount: Number(row.principalAmount || 0),
          interestAmount: Number(row.interestAmount || 0),
          balanceAfter: Number(row.balanceAfter || 0),
        })),
      },
      disclaimer:
        "Simulacao nao vinculativa: os valores finais dependem da analise e aprovacao do pedido de credito.",
    });
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------------------
// Pedidos autenticados (token do portal)
// ---------------------------------------------------------------------------

portalRouter.post(
  "/applications",
  requirePortalAuth,
  applicationRateLimiter,
  validateBody(applicationSchema),
  async (req, res, next) => {
    try {
      const portal = req.portal;
      const policy = await getApprovalPolicy(portal.companyId);

      const clientResult = await query(
        `
        SELECT
          c.id,
          c.name,
          c.client_type,
          c.status,
          c.score,
          c.carteira_id,
          p.name AS carteira_name,
          p.gestor_name,
          p.gestor_user_id,
          COALESCE(SUM(l.balance), 0)::numeric(14,2) AS debt
        FROM clients c
        LEFT JOIN portfolios p ON p.id = c.carteira_id AND p.company_id = c.company_id
        LEFT JOIN loans l ON l.client_id = c.id AND l.company_id = c.company_id
        WHERE c.id = $1 AND c.company_id = $2
        GROUP BY c.id, p.name, p.gestor_name, p.gestor_user_id
        `,
        [portal.clientId, portal.companyId],
      );
      const client = clientResult.rows[0];
      if (!client) {
        return res.status(401).json({ message: "Conta de portal sem cliente associado." });
      }

      const { amount, periodMonths, paymentFrequency, purpose } = req.body;
      if (periodMonths > policy.maxLoanTermMonths) {
        return res.status(400).json({
          message: `O prazo maximo para pedido e de ${policy.maxLoanTermMonths} meses.`,
        });
      }

      // Regra de negócio: bloquear novo pedido com crédito activo ou pedido em curso.
      const activeLoanCheck = await query(
        `
        SELECT id, contract_no, balance
        FROM loans
        WHERE client_id = $1 AND company_id = $2 AND status IN ('active', 'late', 'defaulted') AND balance > 0.01
        ORDER BY id DESC LIMIT 1
        `,
        [portal.clientId, portal.companyId],
      );
      if (activeLoanCheck.rows[0]) {
        const debtRow = activeLoanCheck.rows[0];
        return res.status(409).json({
          message: `O cliente possui um credito pendente activo (Contrato no ${debtRow.contract_no}, Saldo: ${Number(debtRow.balance).toLocaleString("pt-MZ", { minimumFractionDigits: 2 })} MT). E necessario liquidar o credito anterior antes de abrir um novo pedido.`,
        });
      }

      const pendingReqCheck = await query(
        `
        SELECT id, status, payload
        FROM loan_approval_requests
        WHERE client_id = $1 AND company_id = $2 AND status IN ('pending_analyst', 'pending_manager', 'pending_final', 'approved')
        ORDER BY id DESC LIMIT 1
        `,
        [portal.clientId, portal.companyId],
      );
      if (pendingReqCheck.rows[0]) {
        const pRow = pendingReqCheck.rows[0];
        const reqRef = pRow.payload?.contractNo || `#REQ-${pRow.id}`;
        return res.status(409).json({
          message: `O cliente ja possui uma solicitacao de credito em andamento (Processo ${reqRef}). Conclua ou finalize o processo anterior antes de criar outro.`,
        });
      }

      const rate =
        req.body.monthlyRatePercent !== undefined
          ? normalizeRatePercent(req.body.monthlyRatePercent)
          : Number(policy.defaultInterestRate || 0);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ message: "Taxa de juro invalida." });
      }

      const schedule = buildPortalSchedule({ amount, rate, paymentFrequency, periodMonths });
      if (!schedule.valid) {
        return res.status(400).json({ message: schedule.message });
      }

      const risk = resolveRiskEvaluation({ client, policy });

      const today = new Date();
      const payload = {
        clientId: portal.clientId,
        amount,
        balance: amount,
        product: "Credito Normal",
        applicantType: client.client_type || "singular",
        periodMonths,
        rate,
        monthlyRatePercent: rate,
        dailyPenaltyRate: policy.defaultDailyPenaltyRate || 0.02,
        paymentFrequency,
        amortizationMethod: "price",
        carteiraId: Number(client.carteira_id || 0) || null,
        carteiraNome: String(client.carteira_name || ""),
        managerUserId: Number(client.gestor_user_id || 0) || null,
        gestorName: String(client.gestor_name || ""),
        purpose: purpose || "Capital de Giro",
        disbursementChannel: "mpesa",
        disbursementAccount: "",
        guarantorName: "",
        guarantorPhone: "",
        guarantorNuit: "",
        collateralDescription: "",
        collateralValue: 0,
        contractNo: `REQ-${today.getFullYear()}-${Date.now().toString().slice(-5)}`,
        disbursed: schedule.dates.disbursed,
        maturity: schedule.dates.maturity,
        nextPayment: schedule.dates.nextPayment,
        daysOverdue: 0,
        status: "active",
        groupMemberCount: 0,
        groupMembers: [],
        source: "portal",
        simulator: { summary: schedule.summary },
      };

      const inserted = await withTransaction(async (dbClient) => {
        const result = await dbClient.query(
          `
          INSERT INTO loan_approval_requests (
            company_id, client_id, requested_amount, payload, status, risk_level, risk_reasons,
            created_by_user_id, created_by_name
          )
          VALUES ($1, $2, $3, $4::jsonb, 'pending_analyst', $5, $6::jsonb, NULL, $7)
          RETURNING id, status, requested_amount, created_at
          `,
          [
            portal.companyId,
            portal.clientId,
            amount,
            JSON.stringify(payload),
            risk.riskLevel,
            JSON.stringify(risk.reasons),
            `Portal: ${portal.fullName}`,
          ],
        );
        // Fase 2.2 — trilha de processo: pedido criado e submetido pelo portal.
        await advanceToState(
          {
            companyId: portal.companyId,
            entityType: "application",
            entityId: Number(result.rows[0].id),
            clientId: portal.clientId,
            toState: "SUBMITTED",
            reason: "Pedido de credito submetido pelo portal do cliente",
            note: `Valor solicitado: ${amount} MT`,
            actor: { userId: null, name: `Portal: ${portal.fullName}` },
          },
          dbClient,
        );
        return result;
      });

      const row = inserted.rows[0];
      publishAppEvent(portal.companyId, "LOAN_REQUEST_CREATED", {
        id: Number(row.id),
        clientId: portal.clientId,
        amount,
        status: row.status,
      });

      return res.status(201).json({
        message: "Pedido de credito submetido com sucesso para analise.",
        id: Number(row.id),
        status: row.status,
        requestedAmount: amount,
        contractNo: payload.contractNo,
      });
    } catch (error) {
      return next(error);
    }
  },
);

portalRouter.get("/applications", requirePortalAuth, async (req, res, next) => {
  try {
    const portal = req.portal;
    const result = await query(
      `
      SELECT ar.id, ar.requested_amount, ar.status, ar.risk_level, ar.payload, ar.created_at, ar.updated_at,
        (SELECT pl.to_state
         FROM process_log pl
         WHERE pl.company_id = ar.company_id AND pl.entity_type = 'application' AND pl.entity_id = ar.id
         ORDER BY pl.id DESC LIMIT 1) AS process_state
      FROM loan_approval_requests ar
      WHERE ar.company_id = $1 AND ar.client_id = $2
      ORDER BY ar.created_at DESC
      LIMIT 100
      `,
      [portal.companyId, portal.clientId],
    );

    return res.json({
      requests: result.rows.map((row) => ({
        id: Number(row.id),
        requestedAmount: Number(row.requested_amount),
        status: row.status,
        riskLevel: row.risk_level,
        periodMonths: Number(row.payload?.periodMonths || row.payload?.prazo || 1),
        paymentFrequency: row.payload?.paymentFrequency || "mensal",
        rate: Number(row.payload?.monthlyRatePercent || row.payload?.rate || 0),
        purpose: row.payload?.purpose || "",
        contractNo: row.payload?.contractNo || `#REQ-${row.id}`,
        processState: row.process_state || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

portalRouter.get("/applications/:id/timeline", requirePortalAuth, async (req, res, next) => {
  try {
    const portal = req.portal;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID invalido." });
    }

    const ownership = await query(
      `SELECT id FROM loan_approval_requests WHERE id = $1 AND company_id = $2 AND client_id = $3`,
      [id, portal.companyId, portal.clientId],
    );
    if (!ownership.rows[0]) {
      return res.status(404).json({ message: "Pedido nao encontrado." });
    }

    const items = await listTimeline({
      companyId: portal.companyId,
      entityType: "application",
      entityId: id,
    });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

portalRouter.get("/me", requirePortalAuth, (req, res) => {
  const portal = req.portal;
  return res.json({
    account: {
      id: portal.id,
      fullName: portal.fullName,
      email: portal.email,
      documentNumber: portal.documentNumber,
      companyId: portal.companyId,
      clientId: portal.clientId,
    },
  });
});






