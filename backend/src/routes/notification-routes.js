import express from "express";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import {
  getNotificationSettings,
  getClientCreditProfile,
  listNotifications,
  markNotificationsRead,
  upsertNotificationSettings,
} from "../services/notification-service.js";

export const notificationRouter = express.Router();

notificationRouter.use(requireAuth);

notificationRouter.get("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const userId = Number(req.user?.sub) || null;
    const unreadOnly = String(req.query.unreadOnly || "").toLowerCase() === "true";
    const limit = Number(req.query.limit || 50);
    const payload = await listNotifications(scope.companyId, { userId, unreadOnly, limit });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

notificationRouter.post("/mark-read", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const userId = Number(req.user?.sub) || null;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id) => id > 0) : null;
    await markNotificationsRead(scope.companyId, userId, ids);
    const payload = await listNotifications(scope.companyId, { userId, unreadOnly: true, limit: 1 });
    return res.json({ message: "Notificacoes marcadas como lidas.", unreadCount: payload.unreadCount });
  } catch (error) {
    return next(error);
  }
});

notificationRouter.get("/settings", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const settings = await getNotificationSettings(scope.companyId);
    return res.json({ settings });
  } catch (error) {
    return next(error);
  }
});

notificationRouter.put("/settings", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const settings = await upsertNotificationSettings(scope.companyId, req.body || {});
    return res.json({ message: "Configuracoes de notificacao atualizadas.", settings });
  } catch (error) {
    return next(error);
  }
});

notificationRouter.get("/client-credit/:clientId", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const clientId = Number(req.params.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ message: "Cliente invalido." });
    }
    const profile = await getClientCreditProfile(scope.companyId, clientId);
    if (!profile) return res.status(404).json({ message: "Cliente nao encontrado." });
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
});
