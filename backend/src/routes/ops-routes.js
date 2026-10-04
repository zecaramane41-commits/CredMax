import express from "express";
import { query } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

export const opsRouter = express.Router();

opsRouter.use(requireAuth);
opsRouter.use(requirePermission("alterar.configuracoes.sistema"));

opsRouter.get("/readiness", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });

    const dbCheck = await query("SELECT NOW() AS now");
    const backlog = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'running')::INT AS running_reconciliations,
        COUNT(*) FILTER (WHERE status = 'error')::INT AS failed_connectors
      FROM integration_connectors
      WHERE company_id = $1
      `,
      [scope.companyId],
    );

    const row = backlog.rows[0] || {};
    const ready = Boolean(dbCheck.rows[0]?.now) && Number(row.failed_connectors || 0) === 0;
    return res.json({
      ready,
      checkedAt: new Date().toISOString(),
      details: {
        database: "ok",
        runningReconciliations: Number(row.running_reconciliations || 0),
        failedConnectors: Number(row.failed_connectors || 0),
      },
    });
  } catch (error) {
    return next(error);
  }
});

opsRouter.get("/continuity", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const backup = await query(
      `
      SELECT id, job_type, status, started_at, finished_at, details_json
      FROM system_backup_jobs
      WHERE company_id = $1
      ORDER BY started_at DESC
      LIMIT 20
      `,
      [scope.companyId],
    );
    return res.json({
      companyId: scope.companyId,
      continuityPlan: [
        "RPO alvo: 15 minutos (backup incremental).",
        "RTO alvo: 2 horas (restore + validacao funcional).",
        "Teste de restore completo: semanal.",
        "Fallback manual: operacao offline de cobranca e desembolso.",
      ],
      backups: backup.rows.map((row) => ({
        id: Number(row.id),
        jobType: row.job_type,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        details: row.details_json || {},
      })),
    });
  } catch (error) {
    return next(error);
  }
});

opsRouter.post("/backup-jobs", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const jobType = String(req.body?.jobType || "backup").trim().toLowerCase();
    const status = String(req.body?.status || "success").trim().toLowerCase();
    const allowedType = ["backup", "restore_test", "drill"];
    const allowedStatus = ["success", "failed", "running"];
    if (!allowedType.includes(jobType)) return res.status(400).json({ message: "jobType invalido." });
    if (!allowedStatus.includes(status)) return res.status(400).json({ message: "status invalido." });
    const details = typeof req.body?.details === "object" && req.body?.details ? req.body.details : {};

    const inserted = await query(
      `
      INSERT INTO system_backup_jobs (
        company_id, job_type, status, started_at, finished_at, details_json, created_by_user_id, created_by_name
      )
      VALUES ($1,$2,$3,NOW(),CASE WHEN $3 = 'running' THEN NULL ELSE NOW() END,$4::jsonb,$5,$6)
      RETURNING id, job_type, status, started_at, finished_at, details_json
      `,
      [scope.companyId, jobType, status, JSON.stringify(details), Number(req.user?.sub) || null, req.user?.name || null],
    );
    return res.status(201).json({
      message: "Job de continuidade registado.",
      job: inserted.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

