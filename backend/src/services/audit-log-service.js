import crypto from "crypto";
import { query } from "../config/db.js";

const CRITICAL_MUTATION_PREFIXES = [
  "/api/clients",
  "/api/loans",
  "/api/users",
  "/api/accounting",
  "/api/reports",
  "/api/admin/companies",
  "/api/company",
];

const HIDDEN_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "authorization",
  "mfaCode",
  "authMfaCode",
  "secret",
  "signature",
]);

function maskValue(input, depth = 0) {
  if (depth > 4) return "[max-depth]";
  if (Array.isArray(input)) return input.slice(0, 50).map((item) => maskValue(item, depth + 1));
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(
    Object.entries(input).slice(0, 100).map(([key, value]) => {
      if (HIDDEN_KEYS.has(String(key))) return [key, "[redacted]"];
      return [key, maskValue(value, depth + 1)];
    }),
  );
}

function resolveModuleName(path) {
  if (path.startsWith("/api/clients")) return "clients";
  if (path.startsWith("/api/loans")) return "loans";
  if (path.startsWith("/api/users")) return "users";
  if (path.startsWith("/api/accounting")) return "accounting";
  if (path.startsWith("/api/reports")) return "reports";
  if (path.startsWith("/api/admin/companies") || path.startsWith("/api/company")) return "companies";
  if (path.startsWith("/api/auth")) return "auth";
  return "system";
}

export function resolveIpAddress(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").trim();
  if (xff) return xff.split(",")[0].trim();
  return String(req.ip || req.socket?.remoteAddress || "");
}

export function resolveDeviceId(req) {
  return String(req.headers["x-device-id"] || req.headers["x-client-device"] || "").trim() || null;
}

function shouldAudit(req) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return false;
  return CRITICAL_MUTATION_PREFIXES.some((prefix) => req.path.startsWith(prefix));
}

export function buildAuditMiddleware() {
  return (req, res, next) => {
    if (!shouldAudit(req)) return next();

    const startedAt = new Date().toISOString();
    const actionType = `${req.method}:${req.path}`;
    const moduleName = resolveModuleName(req.path);
    const maskedBody = maskValue(req.body ?? {});
    const maskedQuery = maskValue(req.query ?? {});
    const ipAddress = resolveIpAddress(req);
    const userAgent = String(req.headers["user-agent"] || "");
    const deviceId = resolveDeviceId(req);

    res.on("finish", async () => {
      try {
        const actorUserId = Number(req.user?.sub);
        const companyId = Number(req.user?.companyId);
        const safeCompanyId = Number.isInteger(companyId) && companyId > 0 ? companyId : null;
        const safeActorUserId = Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null;
        const actorName = String(req.user?.name || "");
        const actorRole = String(req.user?.role || "");

        const previousHashResult = await query(
          `
          SELECT entry_hash
          FROM security_audit_log
          WHERE company_id IS NOT DISTINCT FROM $1
          ORDER BY id DESC
          LIMIT 1
          `,
          [safeCompanyId],
        );
        const previousHash = previousHashResult.rows[0]?.entry_hash || "";
        const payload = {
          companyId: safeCompanyId,
          actorUserId: safeActorUserId,
          actorName,
          actorRole,
          actionType,
          moduleName,
          resourceType: null,
          resourceId: null,
          requestMethod: req.method,
          requestPath: req.path,
          requestQuery: maskedQuery,
          requestBody: maskedBody,
          responseStatus: Number(res.statusCode || 0),
          ipAddress,
          userAgent,
          deviceId,
          happenedAt: startedAt,
          previousHash,
        };
        const entryHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(payload))
          .digest("hex");

        await query(
          `
          INSERT INTO security_audit_log (
            company_id, actor_user_id, actor_name, actor_role,
            action_type, module_name, resource_type, resource_id,
            request_method, request_path, request_query, request_body, response_status,
            ip_address, user_agent, device_id, happened_at, previous_hash, entry_hash
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19)
          `,
          [
            safeCompanyId,
            safeActorUserId,
            actorName || null,
            actorRole || null,
            actionType,
            moduleName,
            null,
            null,
            req.method,
            req.path,
            JSON.stringify(maskedQuery),
            JSON.stringify(maskedBody),
            Number(res.statusCode || 0),
            ipAddress || null,
            userAgent || null,
            deviceId,
            startedAt,
            previousHash || null,
            entryHash,
          ],
        );
      } catch (error) {
        console.error("audit-log error", error);
      }
    });

    return next();
  };
}

export async function insertLoginAudit({
  companyId = null,
  userId = null,
  email,
  success = false,
  failureReason = null,
  mfaRequired = false,
  mfaValidated = false,
  ipAddress = null,
  userAgent = null,
  deviceId = null,
}) {
  await query(
    `
    INSERT INTO auth_login_audit (
      company_id, user_id, email, success, failure_reason,
      mfa_required, mfa_validated, ip_address, user_agent, device_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [companyId, userId, email, success, failureReason, mfaRequired, mfaValidated, ipAddress, userAgent, deviceId],
  );
}
