import express from "express";
import { query } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const financialCalendarRouter = express.Router();

financialCalendarRouter.use(requireAuth);
financialCalendarRouter.use(requireReadWrite("alterar.parametros.negocio"));

function normalizeDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function mapRow(row) {
  return {
    id: Number(row.id),
    date: row.calendar_date,
    description: row.description,
    type: row.day_type,
    isWorkingDay: Boolean(row.is_working_day),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

financialCalendarRouter.get("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const from = normalizeDate(req.query.from) || null;
    const to = normalizeDate(req.query.to) || null;
    const result = await query(
      `SELECT id, calendar_date, description, day_type, is_working_day, created_at, updated_at
       FROM financial_calendar_days
       WHERE company_id = $1
         AND ($2::date IS NULL OR calendar_date >= $2::date)
         AND ($3::date IS NULL OR calendar_date <= $3::date)
       ORDER BY calendar_date ASC`,
      [scope.companyId, from, to],
    );
    return res.json({ days: result.rows.map(mapRow) });
  } catch (error) {
    return next(error);
  }
});

financialCalendarRouter.post("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const date = normalizeDate(req.body?.date);
    const description = String(req.body?.description || "").trim();
    const type = String(req.body?.type || "feriado").trim().toLowerCase();
    const isWorkingDay = type === "dia_util";
    if (!date) return res.status(400).json({ message: "Data invalida." });
    if (!description) return res.status(400).json({ message: "Descricao obrigatoria." });
    if (!["feriado", "nao_util", "dia_util"].includes(type)) return res.status(400).json({ message: "Tipo de calendario invalido." });

    const result = await query(
      `INSERT INTO financial_calendar_days
        (company_id, calendar_date, description, day_type, is_working_day, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       RETURNING id, calendar_date, description, day_type, is_working_day, created_at, updated_at`,
      [scope.companyId, date, description, type, isWorkingDay],
    );
    return res.status(201).json({ day: mapRow(result.rows[0]) });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "Já existe uma configuração para esta data." });
    return next(error);
  }
});

financialCalendarRouter.put("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const id = Number(req.params.id);
    const date = normalizeDate(req.body?.date);
    const description = String(req.body?.description || "").trim();
    const type = String(req.body?.type || "feriado").trim().toLowerCase();
    const isWorkingDay = type === "dia_util";
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID invalido." });
    if (!date || !description) return res.status(400).json({ message: "Data e descricao sao obrigatorias." });
    if (!["feriado", "nao_util", "dia_util"].includes(type)) return res.status(400).json({ message: "Tipo de calendario invalido." });

    const result = await query(
      `UPDATE financial_calendar_days
       SET calendar_date = $1, description = $2, day_type = $3, is_working_day = $4, updated_at = NOW()
       WHERE id = $5 AND company_id = $6
       RETURNING id, calendar_date, description, day_type, is_working_day, created_at, updated_at`,
      [date, description, type, isWorkingDay, id, scope.companyId],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Dia de calendario nao encontrado." });
    return res.json({ day: mapRow(result.rows[0]) });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "Já existe uma configuração para esta data." });
    return next(error);
  }
});

financialCalendarRouter.delete("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID invalido." });
    const result = await query(
      "DELETE FROM financial_calendar_days WHERE id = $1 AND company_id = $2 RETURNING id",
      [id, scope.companyId],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Dia de calendario nao encontrado." });
    return res.json({ message: "Dia removido do calendario." });
  } catch (error) {
    return next(error);
  }
});
