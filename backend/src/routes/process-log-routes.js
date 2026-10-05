import express from "express";
import { z } from "zod";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { validateQuery } from "../middleware/validate.js";
import { listTimeline, PROCESS_ENTITY_TYPES } from "../services/process-log-service.js";

export const processLogRouter = express.Router();

processLogRouter.use(requireAuth);

const timelineQuerySchema = z
  .object({
    entityType: z.enum(PROCESS_ENTITY_TYPES).optional(),
    entityId: z.coerce.number().int().positive().optional(),
    clientId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .refine((q) => q.clientId != null || (q.entityType != null && q.entityId != null), {
    message: "Indique clientId ou entityType + entityId.",
  });

// Linha do tempo (leitura). As transições são registadas pelos serviços de domínio,
// nunca diretamente por clientes da API.
processLogRouter.get(
  "/timeline",
  requirePermission("solicitar.credito", "analisar.credito", "aprovar.credito", "consultar.risco", "consultar.auditoria"),
  validateQuery(timelineQuerySchema),
  async (req, res, next) => {
    try {
      const scope = resolveCompanyScope(req);
      if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
      const items = await listTimeline({
        companyId: scope.companyId,
        entityType: req.query.entityType ?? null,
        entityId: req.query.entityId ?? null,
        clientId: req.query.clientId ?? null,
        limit: req.query.limit,
      });
      return res.json({ items });
    } catch (error) {
      return next(error);
    }
  },
);
