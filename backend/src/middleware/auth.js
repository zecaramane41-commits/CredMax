import { verifyToken } from "../utils/security.js";
import { query } from "../config/db.js";

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const queryToken = typeof req.query?.token === "string" ? req.query.token : null;
  const token = (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) || queryToken;

  if (!token) {
    return res.status(401).json({ message: "Token ausente." });
  }

  try {
    const decoded = verifyToken(token);
    const userId = decoded.userId || decoded.id || decoded.sub;
    if (!userId) {
      return res.status(401).json({ message: "Token invalido ou expirado." });
    }

    const result = await query(
      `SELECT id, email, full_name, role, company_id, permissions_json, is_active
       FROM users
       WHERE id = $1`,
      [Number(userId)],
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Token invalido ou expirado." });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Conta suspensa ou inativa." });
    }

    req.user = {
      sub: user.id,
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      companyId: user.company_id,
      permissions: user.permissions_json,
      status: user.is_active ? "active" : "inactive",
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Token invalido ou expirado." });
  }
}

export function isCentralAdmin(req) {
  return req.user?.role === "admin" && !req.user?.companyId;
}

export function resolveCompanyScope(req) {
  if (isCentralAdmin(req)) {
    const header = Number(req.headers["x-company-id"]);
    if (Number.isInteger(header) && header > 0) {
      return { companyId: header, centralAdmin: true };
    }
    return { companyId: null, centralAdmin: true };
  }
  const companyId = Number(req.user?.companyId);
  return { companyId: Number.isInteger(companyId) && companyId > 0 ? companyId : null, centralAdmin: false };
}

/**
 * Tokens do portal público (Fase 2.2) carregam `kind: "portal"` e NÃO
 * transportam `userId`/`id`/`sub`, pelo que `requireAuth` (interno) rejeita-os.
 */
export function isPortalToken(decoded) {
  if (!decoded || decoded.kind !== "portal") return false;
  const portalId = Number(decoded.portalId);
  return Number.isInteger(portalId) && portalId > 0;
}

/**
 * Autenticação do portal público do cliente. Diferente de `requireAuth`:
 * valida o token de portal e carrega a conta em `req.portal`.
 */
export async function requirePortalAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Token ausente." });
  }

  try {
    const decoded = verifyToken(token);
    if (!isPortalToken(decoded)) {
      return res.status(401).json({ message: "Token invalido ou expirado." });
    }

    const result = await query(
      `SELECT id, company_id, client_id, full_name, email, document_number, is_active
       FROM portal_accounts
       WHERE id = $1`,
      [Number(decoded.portalId)],
    );
    const account = result.rows[0];
    if (!account) {
      return res.status(401).json({ message: "Token invalido ou expirado." });
    }
    if (!account.is_active) {
      return res.status(403).json({ message: "Conta suspensa ou inativa." });
    }

    req.portal = {
      id: Number(account.id),
      companyId: Number(account.company_id),
      clientId: Number(account.client_id),
      fullName: account.full_name,
      email: account.email,
      documentNumber: account.document_number || "",
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Token invalido ou expirado." });
  }
}