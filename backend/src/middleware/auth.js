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