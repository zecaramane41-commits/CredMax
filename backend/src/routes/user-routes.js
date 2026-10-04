import express from "express";
import { query } from "../config/db.js";
import { isCentralAdmin, requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireUserRoutePermission } from "../middleware/permissions.js";
import { hashPassword } from "../utils/security.js";
import { normalizePasswordPolicy, validatePasswordAgainstPolicy } from "../utils/password-policy.js";
import { defaultPermissionsForRole, normalizePermissions, permissionCatalog } from "../utils/permissions.js";

export const userRouter = express.Router();

userRouter.use(requireAuth);
userRouter.use(requireUserRoutePermission);

function normalizeRole(value, fallback = "operator") {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (["admin", "manager", "agent", "operator", "assistant", "accountant"].includes(normalized)) return normalized;
  return fallback;
}

function normalizePortfolioRole(value) {
  const normalized = normalizeRole(value, "manager");
  return normalized === "agent" ? "agent" : "manager";
}

function randomString(size = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function toAsciiSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
}

function buildPortfolioEmail(fullName, companyId) {
  const slug = toAsciiSlug(fullName) || "carteira";
  const stamp = Date.now().toString(36);
  const companyPart = Number.isInteger(companyId) && companyId > 0 ? `c${companyId}` : "cx";
  return `${slug}.${companyPart}.${stamp}@portfolio.local`;
}

async function loadCompanyPasswordPolicy(companyId) {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return normalizePasswordPolicy({});
  }
  const result = await query(
    `
    SELECT
      auth_password_min_length,
      auth_password_require_upper,
      auth_password_require_lower,
      auth_password_require_number,
      auth_password_require_special,
      auth_password_expiry_days
    FROM companies
    WHERE id = $1
    LIMIT 1
    `,
    [companyId],
  );

  const row = result.rows[0];
  return normalizePasswordPolicy({
    minLength: row?.auth_password_min_length,
    requireUpper: row?.auth_password_require_upper,
    requireLower: row?.auth_password_require_lower,
    requireNumber: row?.auth_password_require_number,
    requireSpecial: row?.auth_password_require_special,
    expiryDays: row?.auth_password_expiry_days,
  });
}

function resolveTargetCompanyId({ centralAdmin, scopeCompanyId, requestedCompanyId, role }) {
  if (!centralAdmin) return scopeCompanyId;
  const parsedRequested = Number(requestedCompanyId);
  if (Number.isInteger(parsedRequested) && parsedRequested > 0) return parsedRequested;
  if (role === "admin") return null;
  return null;
}

async function ensureCompanyAdminUniqueness(companyId, ignoreUserId = null) {
  if (!Number.isInteger(companyId) || companyId <= 0) return;
  const params = [companyId];
  let ignoreClause = "";
  if (Number.isInteger(ignoreUserId) && ignoreUserId > 0) {
    params.push(ignoreUserId);
    ignoreClause = `AND id <> $${params.length}`;
  }
  const result = await query(
    `
    SELECT id
    FROM users
    WHERE company_id = $1
      AND LOWER(role) = 'admin'
      AND is_portfolio_only = false
      ${ignoreClause}
    LIMIT 1
    `,
    params,
  );
  if (result.rows[0]) {
    const error = new Error("Cada empresa pode ter apenas 1 administrador.");
    error.statusCode = 409;
    throw error;
  }
}

function mapUserRow(row, { centralAdmin = false } = {}) {
  const role = String(row.role || "").trim().toLowerCase();
  const companyId = row.company_id ? Number(row.company_id) : null;
  const permissions = normalizePermissions(row.permissions_json, {
    role,
    centralAdmin: centralAdmin || (role === "admin" && !companyId),
  });
  return {
    id: Number(row.id),
    fullName: row.full_name,
    email: row.email,
    role,
    companyId,
    companyName: row.company_name || "",
    isActive: Boolean(row.is_active),
    isPortfolioOnly: Boolean(row.is_portfolio_only),
    permissions,
    createdAt: row.created_at,
  };
}

function parsePermissionsInput(input, role, centralAdmin) {
  return normalizePermissions(input, { role, centralAdmin });
}

userRouter.get("/permissions/catalog", async (req, res) => {
  const role = normalizeRole(req.query?.role || req.user?.role || "operator");
  const centralAdmin = isCentralAdmin(req);
  return res.json({
    catalog: permissionCatalog(),
    defaults: defaultPermissionsForRole(role, { centralAdmin }),
  });
});

userRouter.get("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    const centralAdmin = isCentralAdmin(req);
    const showAll = centralAdmin && String(req.query?.all || "") === "1";
    const includePortfolio = String(req.query?.includePortfolio || "0") === "1";
    const companyFilter = Number(req.query?.companyId);
    const roleFilterRaw = String(req.query?.role || "all").trim().toLowerCase();
    const roleFilter = ["all", "admin", "manager", "agent", "operator", "assistant", "accountant", "portfolio"].includes(roleFilterRaw)
      ? roleFilterRaw
      : "all";

    if (!scope.companyId && !centralAdmin) {
      return res.status(400).json({ message: "Utilizador sem empresa associada." });
    }

    const params = [];
    const whereClauses = [];

    if (showAll && Number.isInteger(companyFilter) && companyFilter > 0) {
      params.push(companyFilter);
      whereClauses.push(`u.company_id = $${params.length}`);
    } else if (!showAll && scope.companyId) {
      params.push(scope.companyId);
      whereClauses.push(`u.company_id = $${params.length}`);
    }

    if (roleFilter === "portfolio") {
      whereClauses.push(`LOWER(u.role) IN ('manager', 'agent')`);
    } else if (roleFilter !== "all") {
      params.push(roleFilter);
      whereClauses.push(`LOWER(u.role) = $${params.length}`);
    }

    if (!includePortfolio && roleFilter !== "portfolio") {
      whereClauses.push("u.is_portfolio_only = false");
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const result = await query(
      `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.role,
        u.permissions_json,
        u.is_portfolio_only,
        u.is_active,
        u.created_at,
        u.company_id,
        c.name AS company_name
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      ${whereSql}
      ORDER BY u.created_at DESC
      `,
      params,
    );
    return res.json({
      users: result.rows.map((row) => mapUserRow(row, { centralAdmin })),
    });
  } catch (error) {
    return next(error);
  }
});

userRouter.post("/portfolios", async (req, res, next) => {
  try {
    const requesterRole = normalizeRole(req.user?.role);
    if (requesterRole !== "admin") {
      return res.status(403).json({ message: "Apenas admin pode gerir carteiras." });
    }

    const scope = resolveCompanyScope(req);
    const centralAdmin = isCentralAdmin(req);
    const fullName = String(req.body?.fullName || "").trim();
    const role = normalizePortfolioRole(req.body?.role || "manager");
    const isActive = Boolean(req.body?.isActive ?? true);
    const explicitEmail = String(req.body?.email || "").trim().toLowerCase();
    const companyId = resolveTargetCompanyId({
      centralAdmin,
      scopeCompanyId: scope.companyId,
      requestedCompanyId: req.body?.companyId,
      role,
    });

    if (!fullName) return res.status(400).json({ message: "Nome da carteira e obrigatorio." });
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({ message: "Carteira deve estar vinculada a uma empresa." });
    }

    const email = explicitEmail || buildPortfolioEmail(fullName, companyId);
    const passwordHash = await hashPassword(randomString(16));
    const inserted = await query(
      `
      INSERT INTO users (
        full_name, email, password_hash, role, company_id, is_active, is_portfolio_only, permissions_json, password_changed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, '[]'::jsonb, NOW())
      RETURNING id, full_name, email, role, company_id, is_active, is_portfolio_only, permissions_json, created_at
      `,
      [fullName, email, passwordHash, role, companyId, isActive],
    );

    const companyResult = await query("SELECT name FROM companies WHERE id = $1", [companyId]);
    return res.status(201).json({
      message: "Carteira criada com sucesso.",
      user: mapUserRow({ ...inserted.rows[0], company_name: companyResult.rows[0]?.name || "" }, { centralAdmin }),
    });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "Email interno da carteira ja existe." });
    return next(error);
  }
});

userRouter.put("/portfolios/:id", async (req, res, next) => {
  try {
    const requesterRole = normalizeRole(req.user?.role);
    if (requesterRole !== "admin") {
      return res.status(403).json({ message: "Apenas admin pode gerir carteiras." });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID invalido." });

    const scope = resolveCompanyScope(req);
    const centralAdmin = isCentralAdmin(req);
    const fullName = String(req.body?.fullName || "").trim();
    const role = normalizePortfolioRole(req.body?.role || "manager");
    const isActive = Boolean(req.body?.isActive ?? true);
    const explicitEmail = String(req.body?.email || "").trim().toLowerCase();
    const companyId = resolveTargetCompanyId({
      centralAdmin,
      scopeCompanyId: scope.companyId,
      requestedCompanyId: req.body?.companyId,
      role,
    });

    if (!fullName) return res.status(400).json({ message: "Nome da carteira e obrigatorio." });
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({ message: "Carteira deve estar vinculada a uma empresa." });
    }

    const scopeWhere = centralAdmin ? "u.id = $4" : "u.id = $4 AND u.company_id = $5";
    const selectParams = centralAdmin ? [id] : [id, scope.companyId];
    const current = await query(
      `
      SELECT id, email
      FROM users u
      WHERE ${centralAdmin ? "u.id = $1" : "u.id = $1 AND u.company_id = $2"}
        AND u.is_portfolio_only = true
      LIMIT 1
      `,
      selectParams,
    );
    if (!current.rows[0]) return res.status(404).json({ message: "Carteira nao encontrada." });
    const email = explicitEmail || current.rows[0].email || buildPortfolioEmail(fullName, companyId);

    const updated = await query(
      `
      UPDATE users u
      SET
        full_name = $1,
        email = $2,
        role = $3,
        company_id = ${centralAdmin ? "$5" : "$6"},
        is_active = ${centralAdmin ? "$6" : "$7"}
      WHERE ${scopeWhere}
        AND u.is_portfolio_only = true
      RETURNING id, full_name, email, role, company_id, is_active, is_portfolio_only, permissions_json, created_at
      `,
      centralAdmin
        ? [fullName, email, role, id, companyId, isActive]
        : [fullName, email, role, id, scope.companyId, companyId, isActive],
    );

    if (!updated.rows[0]) return res.status(404).json({ message: "Carteira nao encontrada." });
    const companyResult = await query("SELECT name FROM companies WHERE id = $1", [updated.rows[0].company_id]);
    return res.json({
      message: "Carteira atualizada com sucesso.",
      user: mapUserRow({ ...updated.rows[0], company_name: companyResult.rows[0]?.name || "" }, { centralAdmin }),
    });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "Email interno da carteira ja existe." });
    return next(error);
  }
});

userRouter.delete("/portfolios/:id", async (req, res, next) => {
  try {
    const requesterRole = normalizeRole(req.user?.role);
    if (requesterRole !== "admin") {
      return res.status(403).json({ message: "Apenas admin pode gerir carteiras." });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID invalido." });
    const scope = resolveCompanyScope(req);
    const centralAdmin = isCentralAdmin(req);
    const removed = centralAdmin
      ? await query("DELETE FROM users WHERE id = $1 AND is_portfolio_only = true RETURNING id", [id])
      : await query("DELETE FROM users WHERE id = $1 AND company_id = $2 AND is_portfolio_only = true RETURNING id", [id, scope.companyId]);
    if (!removed.rows[0]) return res.status(404).json({ message: "Carteira nao encontrada." });
    return res.json({ message: "Carteira removida com sucesso." });
  } catch (error) {
    return next(error);
  }
});

userRouter.post("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    const centralAdmin = isCentralAdmin(req);
    const requesterRole = normalizeRole(req.user?.role);
    if (requesterRole !== "admin") {
      return res.status(403).json({ message: "Apenas admin pode gerir utilizadores." });
    }

    const fullName = String(req.body?.fullName || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const role = normalizeRole(req.body?.role, "operator");
    const password = String(req.body?.password || "").trim();
    const isActive = Boolean(req.body?.isActive ?? true);
    const companyId = resolveTargetCompanyId({
      centralAdmin,
      scopeCompanyId: scope.companyId,
      requestedCompanyId: req.body?.companyId,
      role,
    });

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "Nome, email e senha sao obrigatorios." });
    }
    if (!centralAdmin && role === "admin") {
      return res.status(403).json({ message: "Apenas administrador central pode criar outro admin central." });
    }
    if (role !== "admin" && (!Number.isInteger(companyId) || companyId <= 0)) {
      return res.status(400).json({ message: "Utilizador nao-admin deve estar associado a uma empresa." });
    }

    if (role === "admin" && Number.isInteger(companyId) && companyId > 0) {
      await ensureCompanyAdminUniqueness(companyId);
    }

    const passwordPolicy = await loadCompanyPasswordPolicy(companyId);
    const passwordValidation = validatePasswordAgainstPolicy(password, passwordPolicy);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.errors.join(" ") });
    }

    const permissions = parsePermissionsInput(req.body?.permissions, role, centralAdmin && !companyId);
    const passwordHash = await hashPassword(password);
    const inserted = await query(
      `
      INSERT INTO users (
        full_name, email, password_hash, role, company_id, is_active, is_portfolio_only, permissions_json, password_changed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, false, $7::jsonb, NOW())
      RETURNING id, full_name, email, role, company_id, is_active, is_portfolio_only, permissions_json, created_at
      `,
      [fullName, email, passwordHash, role, companyId, isActive, JSON.stringify(permissions)],
    );

    const companyResult = inserted.rows[0].company_id
      ? await query("SELECT name FROM companies WHERE id = $1", [inserted.rows[0].company_id])
      : { rows: [] };

    return res.status(201).json({
      message: "Utilizador criado com sucesso.",
      user: mapUserRow({ ...inserted.rows[0], company_name: companyResult.rows[0]?.name || "" }, { centralAdmin }),
    });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "Email ja existe." });
    return next(error);
  }
});

userRouter.put("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    const centralAdmin = isCentralAdmin(req);
    const requesterRole = normalizeRole(req.user?.role);
    if (requesterRole !== "admin") {
      return res.status(403).json({ message: "Apenas admin pode gerir utilizadores." });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID invalido." });

    const current = await query(
      `
      SELECT id, role, company_id, is_portfolio_only, permissions_json
      FROM users
      WHERE ${centralAdmin ? "id = $1" : "id = $1 AND company_id = $2"}
      LIMIT 1
      `,
      centralAdmin ? [id] : [id, scope.companyId],
    );
    const currentRow = current.rows[0];
    if (!currentRow) return res.status(404).json({ message: "Utilizador nao encontrado." });
    if (currentRow.is_portfolio_only) {
      return res.status(400).json({ message: "Este registo e uma carteira. Use o modulo de carteiras." });
    }

    const fullName = String(req.body?.fullName || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const role = normalizeRole(req.body?.role, "operator");
    const password = String(req.body?.password || "").trim();
    const isActive = Boolean(req.body?.isActive ?? true);
    const companyId = resolveTargetCompanyId({
      centralAdmin,
      scopeCompanyId: scope.companyId,
      requestedCompanyId: req.body?.companyId,
      role,
    });

    if (!fullName || !email) {
      return res.status(400).json({ message: "Nome e email sao obrigatorios." });
    }
    if (!centralAdmin && role === "admin") {
      return res.status(403).json({ message: "Apenas administrador central pode definir perfil admin central." });
    }
    if (role !== "admin" && (!Number.isInteger(companyId) || companyId <= 0)) {
      return res.status(400).json({ message: "Utilizador nao-admin deve estar associado a uma empresa." });
    }
    if (role === "admin" && Number.isInteger(companyId) && companyId > 0) {
      await ensureCompanyAdminUniqueness(companyId, id);
    }

    const permissions = Array.isArray(req.body?.permissions)
      ? parsePermissionsInput(req.body?.permissions, role, centralAdmin && !companyId)
      : normalizePermissions(currentRow.permissions_json, { role, centralAdmin: centralAdmin && !companyId });

    const params = [fullName, email, role, companyId, isActive, JSON.stringify(permissions)];
    let sql = `
      UPDATE users
      SET
        full_name = $1,
        email = $2,
        role = $3,
        company_id = $4,
        is_active = $5,
        permissions_json = $6::jsonb
    `;

    if (password) {
      const passwordPolicy = await loadCompanyPasswordPolicy(companyId);
      const passwordValidation = validatePasswordAgainstPolicy(password, passwordPolicy);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.errors.join(" ") });
      }
      const passwordHash = await hashPassword(password);
      params.push(passwordHash);
      sql += `,
        password_hash = $7,
        password_changed_at = NOW()
      `;
    }

    const idParam = params.length + 1;
    params.push(id);
    if (centralAdmin) {
      sql += ` WHERE id = $${idParam} AND is_portfolio_only = false`;
    } else {
      const scopeParam = params.length + 1;
      params.push(scope.companyId);
      sql += ` WHERE id = $${idParam} AND company_id = $${scopeParam} AND is_portfolio_only = false`;
    }
    sql += `
      RETURNING id, full_name, email, role, company_id, is_active, is_portfolio_only, permissions_json, created_at
    `;

    const updated = await query(sql, params);
    if (!updated.rows[0]) return res.status(404).json({ message: "Utilizador nao encontrado." });
    const companyResult = updated.rows[0].company_id
      ? await query("SELECT name FROM companies WHERE id = $1", [updated.rows[0].company_id])
      : { rows: [] };
    return res.json({
      message: "Utilizador atualizado com sucesso.",
      user: mapUserRow({ ...updated.rows[0], company_name: companyResult.rows[0]?.name || "" }, { centralAdmin }),
    });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "Email ja existe." });
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  }
});

userRouter.delete("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    const centralAdmin = isCentralAdmin(req);
    const requesterRole = normalizeRole(req.user?.role);
    if (requesterRole !== "admin") {
      return res.status(403).json({ message: "Apenas admin pode gerir utilizadores." });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID invalido." });
    const removed = centralAdmin
      ? await query("DELETE FROM users WHERE id = $1 AND is_portfolio_only = false RETURNING id", [id])
      : await query("DELETE FROM users WHERE id = $1 AND company_id = $2 AND is_portfolio_only = false RETURNING id", [id, scope.companyId]);
    if (!removed.rows[0]) return res.status(404).json({ message: "Utilizador nao encontrado." });
    return res.json({ message: "Utilizador removido com sucesso." });
  } catch (error) {
    return next(error);
  }
});
