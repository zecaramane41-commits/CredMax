import express from "express";
import { query } from "../config/db.js";
import { isCentralAdmin, requireAuth } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const adminMonitoringRouter = express.Router();

adminMonitoringRouter.use(requireAuth);
adminMonitoringRouter.use((req, res, next) => {
  if (!isCentralAdmin(req)) return res.status(403).json({ message: "Acesso restrito ao Administrador Central." });
  return next();
});
adminMonitoringRouter.use(requireReadWrite("admin_monitoring.view"));

// GET / - Company usage overview
adminMonitoringRouter.get("/", async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT
        c.id, c.name, c.nuit, c.is_active, c.created_at,
        c.last_payment_at,
        COALESCE(u.last_login_at, NULL) AS last_login_at,
        COALESCE(u.last_login_ip, NULL) AS last_login_ip,
        (SELECT COUNT(*)::int FROM users WHERE company_id = c.id) AS users_count,
        (SELECT COUNT(*)::int FROM clients WHERE company_id = c.id) AS clients_count,
        (SELECT COUNT(*)::int FROM loans WHERE company_id = c.id) AS loans_count,
        CASE WHEN c.is_active THEN 'active' ELSE 'inactive' END AS status
      FROM companies c
      LEFT JOIN LATERAL (
        SELECT last_login_at, last_login_ip FROM users WHERE company_id = c.id ORDER BY last_login_at DESC NULLS LAST LIMIT 1
      ) u ON true
      ORDER BY c.created_at DESC
    `);
    return res.json({ companies: result.rows });
  } catch (error) { return next(error); }
});

// GET /summary - Aggregated stats
adminMonitoringRouter.get("/summary", async (_req, res, next) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*)::int AS total_companies,
        COUNT(CASE WHEN is_active THEN 1 END)::int AS active_companies,
        COUNT(CASE WHEN NOT is_active THEN 1 END)::int AS inactive_companies,
        COUNT(CASE WHEN subscription_status = 'active' THEN 1 END)::int AS active_subscriptions,
        COUNT(CASE WHEN subscription_status = 'grace' THEN 1 END)::int AS grace_subscriptions,
        COUNT(CASE WHEN subscription_status = 'expired' THEN 1 END)::int AS expired_subscriptions
      FROM companies
    `);
    return res.json(stats.rows[0] || {});
  } catch (error) { return next(error); }
});