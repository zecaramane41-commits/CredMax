import express from "express";
import { isCentralAdmin, requireAuth } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";
import { query } from "../config/db.js";
import {
  getAllCompaniesSubscriptionStatus,
  getCompanySubscriptionStatus,
  createCompanyPayment,
  getCompanyPayments,
  getAllPayments,
  generateCompanyStatement,
  getPaymentStats,
} from "../services/company-payment-service.js";

export const companyPaymentRouter = express.Router();

companyPaymentRouter.use(requireAuth);
companyPaymentRouter.use((req, res, next) => {
  if (!isCentralAdmin(req)) {
    return res.status(403).json({ message: "Acesso restrito ao Administrador Central." });
  }
  return next();
});
companyPaymentRouter.use(requireReadWrite("admin_companies.view", "admin_companies.manage"));

/**
 * GET /api/admin/payments/stats - Dashboard statistics
 */
companyPaymentRouter.get("/stats", async (_req, res, next) => {
  try {
    const stats = await getPaymentStats();
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/admin/payments/companies - All companies with subscription status
 */
companyPaymentRouter.get("/companies", async (_req, res, next) => {
  try {
    const companies = await getAllCompaniesSubscriptionStatus();
    return res.json({ companies });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/admin/payments/companies/:id/subscription - Company subscription details
 */
companyPaymentRouter.get("/companies/:id/subscription", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });
    const subscription = await getCompanySubscriptionStatus(id);
    if (!subscription) return res.status(404).json({ message: "Empresa nao encontrada." });
    return res.json(subscription);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/admin/payments/companies/:id/payments - Payment history for a company
 */
companyPaymentRouter.get("/companies/:id/payments", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const result = await getCompanyPayments(id, { limit, offset });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/admin/payments/companies/:id/statement - Payment statement/extract
 */
companyPaymentRouter.get("/companies/:id/statement", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;
    const statement = await generateCompanyStatement(id, { dateFrom, dateTo });
    return res.json(statement);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/admin/payments/companies/:id/payments - Create a payment
 */
companyPaymentRouter.post("/companies/:id/payments", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });

    const { paymentType, amount, paymentDate, daysPurchased, paymentMethod, referenceNo, notes } = req.body || {};

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valor do pagamento e obrigatorio e deve ser maior que zero." });
    }

    const validPaymentTypes = ["daily", "weekly", "monthly", "quarterly", "annual"];
    const normalizedType = validPaymentTypes.includes(paymentType) ? paymentType : "monthly";

    let defaultDays = 30;
    if (normalizedType === "daily") defaultDays = 1;
    else if (normalizedType === "weekly") defaultDays = 7;
    else if (normalizedType === "monthly") defaultDays = 30;
    else if (normalizedType === "quarterly") defaultDays = 90;
    else if (normalizedType === "annual") defaultDays = 365;

    const days = Number(daysPurchased) || defaultDays;

    const actorUserId = req.user?.id || null;
    const actorName = req.user?.fullName || req.user?.full_name || "Admin Central";

    const payment = await createCompanyPayment(
      id,
      {
        paymentType: normalizedType,
        amount: Number(amount),
        paymentDate,
        daysPurchased: days,
        paymentMethod: paymentMethod || "cash",
        referenceNo: referenceNo || "",
        notes: notes || "",
      },
      actorUserId,
      actorName,
    );

    return res.status(201).json({
      message: "Pagamento registado com sucesso.",
      payment,
    });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  }
});

/**
 * GET /api/admin/payments - All payments across companies
 */
companyPaymentRouter.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const status = req.query.status || null;
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    const result = await getAllPayments({ limit, offset, status, companyId });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/admin/payments/companies/:id/grant-days - Grant access days without payment
 */
companyPaymentRouter.post("/companies/:id/grant-days", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });

    const { days, notes } = req.body || {};
    const daysNum = Number(days);

    if (!daysNum || !Number.isInteger(daysNum) || daysNum <= 0 || daysNum > 3650) {
      return res.status(400).json({ message: "Numero de dias invalido (1-3650)." });
    }

    const now = new Date();
    const validFrom = now.toISOString().slice(0, 10);

    // Check current subscription status
    const companyResult = await query(
      `SELECT subscription_expires_at, total_paid FROM companies WHERE id = $1`,
      [id],
    );
    const company = companyResult.rows[0];
    if (!company) return res.status(404).json({ message: "Empresa nao encontrada." });

    let actualValidFrom = validFrom;
    let actualValidUntil;

    if (company.subscription_expires_at) {
      const currentExpiry = new Date(company.subscription_expires_at);
      if (currentExpiry > now) {
        // Subscription still active — extend from current expiry
        actualValidFrom = currentExpiry.toISOString().slice(0, 10);
        actualValidUntil = new Date(currentExpiry.getTime() + daysNum * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      } else {
        // Expired — start from today
        actualValidUntil = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      }
    } else {
      // Never paid — start from today
      actualValidUntil = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }

    await query(
      `
      UPDATE companies
      SET
        subscription_status = 'active',
        subscription_expires_at = $1::timestamptz,
        is_active = true,
        last_payment_at = NOW()
      WHERE id = $2
      `,
      [actualValidUntil, id],
    );

    const actorName = req.user?.fullName || req.user?.name || "Administrador Central";

    return res.json({
      message: `${daysNum} dia(s) de acesso concedido com sucesso.`,
      companyId: id,
      validFrom: actualValidFrom,
      validUntil: actualValidUntil,
      daysGranted: daysNum,
      grantedBy: actorName,
    });
  } catch (error) {
    return next(error);
  }
});
