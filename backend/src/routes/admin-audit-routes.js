import express from "express";
import { query } from "../config/db.js";
import { isCentralAdmin, requireAuth } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const adminAuditRouter = express.Router();

adminAuditRouter.use(requireAuth);
adminAuditRouter.use((req, res, next) => {
  if (!isCentralAdmin(req)) return res.status(403).json({ message: "Acesso restrito." });
  return next();
});
adminAuditRouter.use(requireReadWrite("admin_audit.view"));

adminAuditRouter.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const action = req.query.action || null;
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    const params = [limit, offset];
    const clauses = [];

    if (action && action !== "all") { params.push(action); clauses.push(`action_type = $${params.length}`); }
    if (companyId) { params.push(companyId); clauses.push(`company_id = $${params.length}`); }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const result = await query(`
      SELECT * FROM security_audit_log ${whereSql} ORDER BY happened_at DESC LIMIT $1 OFFSET $2
    `, params);
    const countResult = await query(`SELECT COUNT(*)::int AS total FROM security_audit_log ${whereSql}`, params.slice(0, -2));
    return res.json({ entries: result.rows, total: Number(countResult.rows[0]?.total || 0) });
  } catch (error) { return next(error); }
});

adminAuditRouter.get("/login-history", async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const result = await query(`
      SELECT al.*, u.full_name AS user_name FROM auth_login_audit al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.occurred_at DESC LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return res.json({ entries: result.rows });
  } catch (error) { return next(error); }
});