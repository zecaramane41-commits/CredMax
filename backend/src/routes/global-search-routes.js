import express from "express";
import { z } from "zod";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { validateQuery } from "../middleware/validate.js";
import { globalSearch } from "../services/global-search-service.js";

export const globalSearchRouter = express.Router();

globalSearchRouter.use(requireAuth);

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

// GET /api/search?q=joao — pesquisa global isolada por empresa.
globalSearchRouter.get(
  "/",
  requirePermission(
    "dashboard.view",
    "solicitar.credito",
    "analisar.credito",
    "aprovar.credito",
    "consultar.risco",
    "consultar.auditoria",
    "registrar.pagamento",
    "visualizar.financeiro",
  ),
  validateQuery(searchQuerySchema),
  async (req, res, next) => {
    try {
      const scope = resolveCompanyScope(req);
      if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
      const groups = await globalSearch({
        companyId: scope.companyId,
        term: req.query.q,
        limit: req.query.limit,
      });
      const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
      return res.json({ query: String(req.query.q), total, groups });
    } catch (error) {
      return next(error);
    }
  },
);
