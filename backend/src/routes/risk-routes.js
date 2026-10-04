import express from "express";
import { query, withTransaction } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const riskRouter = express.Router();

riskRouter.use(requireAuth);
riskRouter.use(requireReadWrite("consultar.risco", "gerir.regras.risco"));

const PRIORITIES = ["Alta", "Media", "Baixa"];

riskRouter.get("/rules", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const search = String(req.query.search || "").trim().toLowerCase();
    const rows = await query(
      `
      SELECT id, name, description, rule_limit, active, priority
      FROM risk_rules
      WHERE company_id = $1
      ORDER BY created_at ASC, id ASC
      `,
      [scope.companyId],
    );
    let items = rows.rows.map((row) => ({
      id: Number(row.id),
      nome: row.name,
      descricao: row.description || "",
      limite: row.rule_limit || "",
      ativa: Boolean(row.active),
      prioridade: row.priority || "Media",
    }));
    if (search) items = items.filter((i) => i.nome.toLowerCase().includes(search));
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

riskRouter.post("/rules", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const nome = String(req.body?.nome || "").trim();
    if (!nome) return res.status(400).json({ message: "Nome da regra e obrigatorio." });
    const descricao = String(req.body?.descricao || "").trim();
    const limite = String(req.body?.limite || "").trim();
    const priorityRaw = String(req.body?.prioridade || "Media").trim();
    const prioridade = PRIORITIES.includes(priorityRaw) ? priorityRaw : "Media";
    const result = await withTransaction(async (dbClient) =>
      dbClient.query(
        `INSERT INTO risk_rules (company_id, name, description, rule_limit, active, priority)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [scope.companyId, nome, descricao, limite, req.body?.ativa !== false, prioridade],
      ),
    );
    return res.status(201).json({ id: Number(result.rows[0].id), message: "Regra criada." });
  } catch (error) {
    return next(error);
  }
});

riskRouter.put("/rules/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Identificador invalido." });
    const sets = [];
    const params = [scope.companyId, id];
    const body = req.body || {};
    if (body.nome !== undefined) { params.push(String(body.nome).trim()); sets.push(`name = $${params.length}`); }
    if (body.descricao !== undefined) { params.push(String(body.descricao).trim()); sets.push(`description = $${params.length}`); }
    if (body.limite !== undefined) { params.push(String(body.limite).trim()); sets.push(`rule_limit = $${params.length}`); }
    if (body.ativa !== undefined) { params.push(Boolean(body.ativa)); sets.push(`active = $${params.length}`); }
    if (body.prioridade !== undefined && PRIORITIES.includes(String(body.prioridade))) {
      params.push(String(body.prioridade));
      sets.push(`priority = $${params.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ message: "Nada para atualizar." });
    const result = await withTransaction(async (dbClient) =>
      dbClient.query(
        `UPDATE risk_rules SET ${sets.join(", ")}, updated_at = NOW() WHERE company_id = $1 AND id = $2`,
        params,
      ),
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Regra nao encontrada." });
    return res.json({ message: "Regra atualizada." });
  } catch (error) {
    return next(error);
  }
});

riskRouter.delete("/rules/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const result = await withTransaction(async (dbClient) =>
      dbClient.query("DELETE FROM risk_rules WHERE company_id = $1 AND id = $2", [
        scope.companyId,
        Number(req.params.id),
      ]),
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Regra nao encontrada." });
    return res.json({ message: "Regra removida." });
  } catch (error) {
    return next(error);
  }
});