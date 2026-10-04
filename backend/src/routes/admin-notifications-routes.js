import express from "express";
import { query } from "../config/db.js";
import { isCentralAdmin, requireAuth } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const adminNotificationsRouter = express.Router();

adminNotificationsRouter.use(requireAuth);
adminNotificationsRouter.use((req, res, next) => {
  if (!isCentralAdmin(req)) return res.status(403).json({ message: "Acesso restrito." });
  return next();
});
adminNotificationsRouter.use(requireReadWrite("admin_notifications.view", "admin_notifications.manage"));

adminNotificationsRouter.get("/", async (req, res, next) => {
  try {
    const type = req.query.type || null;
    const params = [];
    let where = "";
    if (type && type !== "all") { params.push(type); where = `WHERE notification_type = $1`; }
    const result = await query(`SELECT * FROM platform_notifications ${where} ORDER BY created_at DESC`, params);
    return res.json({ notifications: result.rows });
  } catch (error) { return next(error); }
});

adminNotificationsRouter.post("/", async (req, res, next) => {
  try {
    const { title, message, notificationType, severity, targetCompanies, scheduledFor } = req.body || {};
    if (!title || !message) return res.status(400).json({ message: "Titulo e mensagem obrigatorios." });
    const result = await query(`
      INSERT INTO platform_notifications (title, message, notification_type, severity, target_companies, scheduled_for, created_by_user_id, created_by_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [title, message, notificationType || "general", severity || "info", targetCompanies || "all", scheduledFor || null, req.user?.sub, req.user?.name || "Admin"]);
    return res.status(201).json({ notification: result.rows[0] });
  } catch (error) { return next(error); }
});

adminNotificationsRouter.put("/:id/send", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await query(`UPDATE platform_notifications SET sent_at = NOW() WHERE id = $1`, [id]);
    return res.json({ message: "Notificacao enviada." });
  } catch (error) { return next(error); }
});