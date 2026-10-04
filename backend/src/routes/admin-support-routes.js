import express from "express";
import { query } from "../config/db.js";
import { isCentralAdmin, requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const adminSupportRouter = express.Router();

adminSupportRouter.use(requireAuth);
adminSupportRouter.use((req, res, next) => {
  if (!isCentralAdmin(req)) return res.status(403).json({ message: "Acesso restrito ao Administrador Central." });
  return next();
});
adminSupportRouter.use(requireReadWrite("admin_support.view", "admin_support.manage"));

// GET / - List all tickets
adminSupportRouter.get("/", async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const category = req.query.category || null;
    const priority = req.query.priority || null;
    const search = String(req.query.search || "").trim();
    const params = [];
    const clauses = [];

    if (status && status !== "all") { params.push(status); clauses.push(`t.status = $${params.length}`); }
    if (category && category !== "all") { params.push(category); clauses.push(`t.category = $${params.length}`); }
    if (priority && priority !== "all") { params.push(priority); clauses.push(`t.priority = $${params.length}`); }
    if (search) { params.push(`%${search}%`); params.push(`%${search}%`); clauses.push(`(t.subject ILIKE $${params.length - 1} OR c.name ILIKE $${params.length})`); }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const result = await query(`
      SELECT t.*, c.name AS company_name,
        (SELECT COUNT(*)::int FROM support_ticket_messages WHERE ticket_id = t.id) AS message_count
      FROM support_tickets t
      JOIN companies c ON c.id = t.company_id
      ${whereSql}
      ORDER BY t.updated_at DESC
    `, params);

    const categories = await query(`SELECT DISTINCT category FROM support_tickets ORDER BY category`);

    return res.json({
      tickets: result.rows.map(row => ({
        id: row.id, companyId: row.company_id, companyName: row.company_name,
        subject: row.subject, description: row.description, category: row.category,
        priority: row.priority, status: row.status,
        assignedToUserId: row.assigned_to_user_id,
        createdByUserId: row.created_by_user_id, createdByName: row.created_by_name,
        resolvedAt: row.resolved_at, resolvedByUserId: row.resolved_by_user_id,
        resolutionNote: row.resolution_note,
        messageCount: Number(row.message_count || 0),
        createdAt: row.created_at, updatedAt: row.updated_at,
      })),
      categories: categories.rows.map(r => r.category),
    });
  } catch (error) { return next(error); }
});

// GET /stats - Dashboard stats (MUST be before /:id to avoid route conflict)
adminSupportRouter.get("/stats", async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(CASE WHEN status = 'open' THEN 1 END)::int AS open,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END)::int AS resolved,
        COUNT(CASE WHEN status = 'closed' THEN 1 END)::int AS closed
      FROM support_tickets
    `);
    return res.json(result.rows[0] || { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 });
  } catch (error) { return next(error); }
});

// GET /:id - Get ticket details + messages
adminSupportRouter.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });
    const ticket = await query(`
      SELECT t.*, c.name AS company_name FROM support_tickets t
      JOIN companies c ON c.id = t.company_id WHERE t.id = $1
    `, [id]);
    if (!ticket.rows[0]) return res.status(404).json({ message: "Ticket nao encontrado." });
    const messages = await query(`
      SELECT * FROM support_ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC
    `, [id]);
    return res.json({ ticket: ticket.rows[0], messages: messages.rows });
  } catch (error) { return next(error); }
});

// POST / - Create ticket
adminSupportRouter.post("/", async (req, res, next) => {
  try {
    const { companyId, subject, description, category, priority } = req.body || {};
    if (!companyId || !subject) return res.status(400).json({ message: "Empresa e assunto sao obrigatorios." });
    const result = await query(`
      INSERT INTO support_tickets (company_id, subject, description, category, priority, created_by_user_id, created_by_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [companyId, subject, description || "", category || "general", priority || "normal", req.user?.sub, req.user?.name || "Admin"]);
    return res.status(201).json({ ticket: result.rows[0] });
  } catch (error) { return next(error); }
});

// POST /:id/messages - Add message
adminSupportRouter.post("/:id/messages", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { message, isInternal } = req.body || {};
    if (!message) return res.status(400).json({ message: "Mensagem obrigatoria." });
    const result = await query(`
      INSERT INTO support_ticket_messages (ticket_id, user_id, user_name, message, is_internal)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [id, req.user?.sub, req.user?.name || "Admin", message, Boolean(isInternal)]);
    await query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [id]);
    await query(`UPDATE support_tickets SET status = 'in_progress' WHERE id = $1 AND status = 'open'`, [id]);
    return res.status(201).json({ message: result.rows[0] });
  } catch (error) { return next(error); }
});

// PUT /:id/status - Update status
adminSupportRouter.put("/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const validStatuses = ["open", "in_progress", "resolved", "closed"];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Status invalido." });
    let extraSql = "";
    const params = [status, id];
    if (status === "resolved") { extraSql = ", resolved_at = NOW(), resolved_by_user_id = $3"; params.push(req.user?.sub); }
    await query(`UPDATE support_tickets SET status = $1, updated_at = NOW() ${extraSql} WHERE id = $2`, params);
    const updated = await query(`SELECT * FROM support_tickets WHERE id = $1`, [id]);
    return res.json({ ticket: updated.rows[0] });
  } catch (error) { return next(error); }
});

// PUT /:id - Update ticket
adminSupportRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { subject, description, category, priority } = req.body || {};
    await query(`UPDATE support_tickets SET subject = COALESCE($1, subject), description = COALESCE($2, description), category = COALESCE($3, category), priority = COALESCE($4, priority), updated_at = NOW() WHERE id = $5`,
      [subject || null, description || null, category || null, priority || null, id]);
    const updated = await query(`SELECT * FROM support_tickets WHERE id = $1`, [id]);
    return res.json({ ticket: updated.rows[0] });
  } catch (error) { return next(error); }
});

