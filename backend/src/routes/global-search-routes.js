import express from "express";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";
import { globalSearch } from "../services/global-search-service.js";

export const globalSearchRouter = express.Router();

globalSearchRouter.use(requireAuth);
globalSearchRouter.use(requireReadWrite("clients.view", "loans.view"));

globalSearchRouter.get("/", async (req, res) => {
  try {
    const companyId = resolveCompanyScope(req);
    const term = String(req.query.q || "");
    const limit = Number(req.query.limit || 12);
    const payload = await globalSearch(companyId, term, limit);
    res.json(payload);
  } catch (error) {
    console.error("[global-search] GET /api/search", error);
    res.status(500).json({ message: "Falha ao efectuar a pesquisa global." });
  }
});
