import express from "express";
import { query } from "../config/db.js";
import { isCentralAdmin, requireAuth } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const adminSettingsRouter = express.Router();

adminSettingsRouter.use(requireAuth);
adminSettingsRouter.use((req, res, next) => {
  if (!isCentralAdmin(req)) return res.status(403).json({ message: "Acesso restrito." });
  return next();
});
adminSettingsRouter.use(requireReadWrite("admin_security.view", "admin_security.manage"));

adminSettingsRouter.get("/", async (_req, res, next) => {
  try {
    const result = await query(`SELECT * FROM platform_settings ORDER BY key ASC`);
    const settings = {};
    for (const row of result.rows) settings[row.key] = row.value;
    return res.json({ settings });
  } catch (error) { return next(error); }
});

adminSettingsRouter.put("/", async (req, res, next) => {
  try {
    const { settings } = req.body || {};
    if (!settings || typeof settings !== "object") return res.status(400).json({ message: "Settings object required." });
    for (const [key, value] of Object.entries(settings)) {
      await query(`INSERT INTO platform_settings (key, value, updated_by_user_id, updated_at) VALUES ($1,$2,$3,NOW())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_by_user_id = $3, updated_at = NOW()`,
        [key, String(value), req.user?.sub]);
    }
    return res.json({ message: "Configuracoes salvas com sucesso." });
  } catch (error) { return next(error); }
});