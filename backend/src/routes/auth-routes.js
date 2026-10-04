import express from "express";
import rateLimit from "express-rate-limit";
import { query } from "../config/db.js";
import { comparePassword, hashPassword, signToken, verifyToken } from "../utils/security.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { insertLoginAudit, resolveDeviceId, resolveIpAddress } from "../services/audit-log-service.js";
import { validatePasswordAgainstPolicy } from "../utils/password-policy.js";
import { normalizePermissions } from "../utils/permissions.js";
import { changePasswordSchema, loginSchema } from "../validators/auth.js";

export const authRouter = express.Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas tentativas de login. Tente novamente em 15 minutos." },
});
const OTP_EXPIRES_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function parseTimeout(timeoutMinutes) {
  const timeoutMin = Number(timeoutMinutes || 0);
  return Number.isInteger(timeoutMin) && timeoutMin >= 5 && timeoutMin <= 1440 ? timeoutMin : null;
}

function resolveSessionExpiry(companyPolicy, role) {
  const normalizedRole = String(role || "").toLowerCase();
  const roleTimeout = normalizedRole === "admin"
    ? parseTimeout(companyPolicy?.auth_session_timeout_admin_min)
    : normalizedRole === "manager"
      ? parseTimeout(companyPolicy?.auth_session_timeout_manager_min)
      : parseTimeout(companyPolicy?.auth_session_timeout_operator_min);
  const baseTimeout = parseTimeout(companyPolicy?.auth_session_timeout_min);
  const effectiveTimeout = roleTimeout || baseTimeout || 720;
  return `${effectiveTimeout}m`;
}

function resolveLoginPolicy(companyPolicy) {
  const maxLoginAttempts = Number(companyPolicy?.auth_max_login_attempts);
  const lockoutMinutes = Number(companyPolicy?.auth_lockout_minutes);
  const passwordExpiryDays = Number(companyPolicy?.auth_password_expiry_days);
  return {
    maxLoginAttempts: Number.isInteger(maxLoginAttempts) && maxLoginAttempts >= 3 && maxLoginAttempts <= 20 ? maxLoginAttempts : 5,
    lockoutMinutes: Number.isInteger(lockoutMinutes) && lockoutMinutes >= 1 && lockoutMinutes <= 1440 ? lockoutMinutes : 15,
    passwordExpiryDays: Number.isInteger(passwordExpiryDays) && passwordExpiryDays >= 0 && passwordExpiryDays <= 3650 ? passwordExpiryDays : 90,
  };
}

async function registerFailedAttempt(user, policy) {
  const currentAttempts = Number(user.failed_login_attempts || 0);
  const nextAttempts = currentAttempts + 1;
  if (nextAttempts >= policy.maxLoginAttempts) {
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NOW() + ($2::text || ' minutes')::interval WHERE id = $1`,
      [user.id, String(policy.lockoutMinutes)],
    );
    return true;
  }
  await query("UPDATE users SET failed_login_attempts = $2 WHERE id = $1", [user.id, nextAttempts]);
  return false;
}

authRouter.post("/login", loginRateLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password, mfaCode } = req.body;
    const normalizedEmail = email;
    const ipAddress = resolveIpAddress(req);
    const userAgent = String(req.headers["user-agent"] || "");
    const deviceId = resolveDeviceId(req);

    if (!normalizedEmail || !password) {
      await insertLoginAudit({ email: normalizedEmail || "", success: false, failureReason: "missing_credentials", ipAddress, userAgent, deviceId });
      return res.status(400).json({ message: "Email e palavra-passe sao obrigatorios." });
    }

    const result = await query(`
      SELECT u.id, u.full_name, u.email, u.role, u.permissions_json, u.is_portfolio_only, u.password_hash, u.is_active,
        u.failed_login_attempts, u.locked_until, u.password_changed_at, u.company_id,
        c.name AS company_name, c.auth_enforce_mfa, c.auth_mfa_code_hash,
        c.auth_session_timeout_min, c.auth_session_timeout_admin_min, c.auth_session_timeout_manager_min,
        c.auth_session_timeout_operator_min, c.auth_password_expiry_days, c.auth_max_login_attempts, c.auth_lockout_minutes
      FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.email = $1 LIMIT 1
    `, [normalizedEmail]);

    const user = result.rows[0];
    if (!user || !user.is_active || user.is_portfolio_only) {
      await insertLoginAudit({ companyId: user?.company_id ? Number(user.company_id) : null, userId: user?.id ? Number(user.id) : null, email: normalizedEmail, success: false, failureReason: user?.is_portfolio_only ? "portfolio_user_no_login" : "invalid_credentials", ipAddress, userAgent, deviceId });
      return res.status(401).json({ message: "Credenciais invalidas." });
    }

    const policy = resolveLoginPolicy(user);
    const lockUntil = user.locked_until ? new Date(user.locked_until) : null;
    if (lockUntil && lockUntil.getTime() > Date.now()) {
      await insertLoginAudit({ companyId: user.company_id ? Number(user.company_id) : null, userId: Number(user.id), email: normalizedEmail, success: false, failureReason: "account_locked", ipAddress, userAgent, deviceId });
      return res.status(423).json({ message: "Conta temporariamente bloqueada por tentativas invalidas." });
    }

    const validPassword = await comparePassword(password, user.password_hash);
    if (!validPassword) {
      const lockedNow = await registerFailedAttempt(user, policy);
      await insertLoginAudit({ companyId: user.company_id ? Number(user.company_id) : null, userId: Number(user.id), email: normalizedEmail, success: false, failureReason: lockedNow ? "account_locked_threshold" : "invalid_password", ipAddress, userAgent, deviceId });
      if (lockedNow) return res.status(423).json({ message: "Conta bloqueada por tentativas invalidas." });
      return res.status(401).json({ message: "Credenciais invalidas." });
    }

    if (policy.passwordExpiryDays > 0 && String(user.role || "").toLowerCase() !== "admin") {
      const changedAt = user.password_changed_at ? new Date(user.password_changed_at) : null;
      if (changedAt) {
        const expiresAt = new Date(changedAt.getTime() + (policy.passwordExpiryDays * 24 * 60 * 60 * 1000));
        if (expiresAt.getTime() < Date.now()) {
          await insertLoginAudit({ companyId: user.company_id ? Number(user.company_id) : null, userId: Number(user.id), email: normalizedEmail, success: false, failureReason: "password_expired", ipAddress, userAgent, deviceId });
          return res.status(403).json({ message: "Senha expirada. Atualize a senha para continuar.", passwordExpired: true });
        }
      }
    }

    // Subscription check
    if (user.company_id) {
      const subResult = await query(`SELECT subscription_status, subscription_expires_at, subscription_grace_days FROM companies WHERE id = $1`, [user.company_id]);
      const sub = subResult.rows[0];
      if (sub) {
        const now = new Date();
        const expiresAt = sub.subscription_expires_at ? new Date(sub.subscription_expires_at) : null;
        const graceDays = Number(sub.subscription_grace_days || 5);
        const graceEnd = expiresAt ? new Date(expiresAt.getTime() + graceDays * 24 * 60 * 60 * 1000) : null;
        if (!expiresAt) {
          await insertLoginAudit({ companyId: Number(user.company_id), userId: Number(user.id), email: normalizedEmail, success: false, failureReason: "subscription_not_paid", ipAddress, userAgent, deviceId });
          return res.status(403).json({ message: "Acesso bloqueado: nenhum pagamento de assinatura registado. Contacte o Administrador Central para efectuar o pagamento.", subscriptionRequired: true });
        }
        if (graceEnd && now > graceEnd) {
          await query(`UPDATE companies SET is_active = false, subscription_status = 'expired' WHERE id = $1 AND is_active = true`, [user.company_id]);
          await insertLoginAudit({ companyId: Number(user.company_id), userId: Number(user.id), email: normalizedEmail, success: false, failureReason: "subscription_expired", ipAddress, userAgent, deviceId });
          return res.status(403).json({ message: "Acesso bloqueado: assinatura expirada. O periodo de tolerancia terminou. Contacte o Administrador Central para regularizar a situacao.", subscriptionRequired: true, subscriptionStatus: "expired" });
        }
        if (expiresAt && now > expiresAt && graceEnd && now <= graceEnd) {
          const daysInGrace = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          req._subscriptionWarning = `Atencao: a assinatura da sua empresa expirou. Tem ${daysInGrace} dia(s) de carencia para efectuar o pagamento. Apos este periodo, o acesso sera bloqueado.`;
        }
      }
    }

    let mfaValidated = false;
    if (user.auth_enforce_mfa) {
      const normalizedMfaCode = String(mfaCode || "").trim();
      if (!normalizedMfaCode) {
        await registerFailedAttempt(user, policy);
        await insertLoginAudit({ companyId: user.company_id ? Number(user.company_id) : null, userId: Number(user.id), email: normalizedEmail, success: false, failureReason: "missing_mfa_code", mfaRequired: true, mfaValidated: false, ipAddress, userAgent, deviceId });
        return res.status(401).json({ message: "MFA obrigatorio: informe o codigo de autenticacao." });
      }
      if (!user.auth_mfa_code_hash) {
        await insertLoginAudit({ companyId: user.company_id ? Number(user.company_id) : null, userId: Number(user.id), email: normalizedEmail, success: false, failureReason: "mfa_not_configured", mfaRequired: true, mfaValidated: false, ipAddress, userAgent, deviceId });
        return res.status(401).json({ message: "MFA exigido mas nao configurado para a empresa." });
      }
      const validMfa = await comparePassword(normalizedMfaCode, user.auth_mfa_code_hash);
      if (!validMfa) {
        const lockedNow = await registerFailedAttempt(user, policy);
        await insertLoginAudit({ companyId: user.company_id ? Number(user.company_id) : null, userId: Number(user.id), email: normalizedEmail, success: false, failureReason: lockedNow ? "account_locked_threshold" : "invalid_mfa_code", mfaRequired: true, mfaValidated: false, ipAddress, userAgent, deviceId });
        if (lockedNow) return res.status(423).json({ message: "Conta bloqueada por tentativas invalidas." });
        return res.status(401).json({ message: "Codigo MFA invalido." });
      }
      mfaValidated = true;
    }

    await query(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = $2, last_login_user_agent = $3 WHERE id = $1`,
      [user.id, ipAddress || null, userAgent || null]);

    await insertLoginAudit({ companyId: user.company_id ? Number(user.company_id) : null, userId: Number(user.id), email: normalizedEmail, success: true, failureReason: null, mfaRequired: Boolean(user.auth_enforce_mfa), mfaValidated, ipAddress, userAgent, deviceId });

    const permissions = normalizePermissions(user.permissions_json, { role: user.role, centralAdmin: user.role === "admin" && !user.company_id });
    const expiresIn = resolveSessionExpiry(user, user.role);
    const accessToken = signToken({ sub: user.id, role: user.role, email: user.email, name: user.full_name, companyId: user.company_id ? Number(user.company_id) : null, permissions }, expiresIn);
    const homeRoute = user.role === "admin" && !user.company_id ? "/admin-companies" : "/";

    const response = { token: accessToken, user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role, companyId: user.company_id ? Number(user.company_id) : null, companyName: user.company_name || "", permissions, isPortfolioOnly: Boolean(user.is_portfolio_only) }, homeRoute };
    if (req._subscriptionWarning) response.subscriptionWarning = req._subscriptionWarning;
    return res.json(response);
  } catch (error) { return next(error); }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Token ausente." });

    let decoded;
    try { decoded = verifyToken(token); }
    catch { return res.status(401).json({ message: "Token invalido ou expirado." }); }

    const userId = decoded.userId || decoded.id || decoded.sub;
    if (!userId) return res.status(401).json({ message: "Token invalido ou expirado." });

    const result = await query(`
      SELECT u.id, u.full_name, u.email, u.role, u.permissions_json, u.is_portfolio_only, u.is_active, u.company_id,
        c.name AS company_name, c.auth_session_timeout_min, c.auth_session_timeout_admin_min,
        c.auth_session_timeout_manager_min, c.auth_session_timeout_operator_min
      FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = $1 LIMIT 1
    `, [userId]);

    const user = result.rows[0];
    if (!user || !user.is_active || user.is_portfolio_only) return res.status(401).json({ message: "Sessao invalida." });

    const permissions = normalizePermissions(user.permissions_json, { role: user.role, centralAdmin: user.role === "admin" && !user.company_id });
    const accessToken = signToken({ sub: user.id, role: user.role, email: user.email, name: user.full_name, companyId: user.company_id ? Number(user.company_id) : null, permissions }, resolveSessionExpiry(user, user.role));

    return res.json({ token: accessToken, user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role, companyId: user.company_id ? Number(user.company_id) : null, companyName: user.company_name || "", permissions, isPortfolioOnly: Boolean(user.is_portfolio_only) } });
  } catch (error) { return next(error); }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT u.id, u.full_name, u.email, u.role, u.company_id, u.permissions_json, u.is_portfolio_only, c.name AS company_name FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = $1 LIMIT 1`, [req.user.sub]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "Utilizador nao encontrado." });
    const permissions = normalizePermissions(user.permissions_json, { role: user.role, centralAdmin: user.role === "admin" && !user.company_id });
    return res.json({ id: user.id, fullName: user.full_name, email: user.email, role: user.role, companyId: user.company_id ? Number(user.company_id) : null, companyName: user.company_name || "", permissions, isPortfolioOnly: Boolean(user.is_portfolio_only) });
  } catch (error) { return next(error); }
});

authRouter.post("/password-recovery/request", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ message: "Email e obrigatorio." });
    const result = await query(`SELECT id, email, is_active FROM users WHERE email = $1 LIMIT 1`, [email]);
    const user = result.rows[0];
    const genericResponse = { message: "Se o email existir, um codigo de verificacao foi enviado para recuperacao da senha." };
    if (!user || !user.is_active) return res.json(genericResponse);
    const otpCode = generateOtpCode();
    const otpCodeHash = await hashPassword(otpCode);
    await query("DELETE FROM password_reset_otps WHERE user_id = $1", [user.id]);
    await query(`INSERT INTO password_reset_otps (user_id, otp_code_hash, expires_at, max_attempts) VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval, $4)`, [user.id, otpCodeHash, String(OTP_EXPIRES_MINUTES), OTP_MAX_ATTEMPTS]);
    return res.json(genericResponse);
  } catch (error) { return next(error); }
});

authRouter.post("/password-recovery/verify", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const otpCode = String(req.body?.otpCode || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    if (!email || !otpCode || !newPassword) return res.status(400).json({ message: "Email, codigo de verificacao e nova senha sao obrigatorios." });
    const result = await query(`SELECT u.id, u.company_id, c.auth_password_min_length, c.auth_password_require_upper, c.auth_password_require_lower, c.auth_password_require_number, c.auth_password_require_special FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.email = $1 AND u.is_active = true LIMIT 1`, [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ message: "Codigo de verificacao invalido ou expirado." });
    const otpResult = await query(`SELECT id, otp_code_hash, expires_at, attempts, max_attempts, used_at FROM password_reset_otps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [user.id]);
    const otpRow = otpResult.rows[0];
    if (!otpRow || otpRow.used_at || new Date(otpRow.expires_at).getTime() <= Date.now()) return res.status(400).json({ message: "Codigo de verificacao invalido ou expirado." });
    const currentAttempts = Number(otpRow.attempts || 0);
    const maxAttempts = Number(otpRow.max_attempts || OTP_MAX_ATTEMPTS);
    if (currentAttempts >= maxAttempts) { await query("UPDATE password_reset_otps SET used_at = NOW() WHERE id = $1", [otpRow.id]); return res.status(400).json({ message: "Codigo de verificacao invalido ou expirado." }); }
    const isOtpValid = await comparePassword(otpCode, otpRow.otp_code_hash);
    if (!isOtpValid) { await query("UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = $1", [otpRow.id]); return res.status(400).json({ message: "Codigo de verificacao invalido ou expirado." }); }
    const passwordValidation = validatePasswordAgainstPolicy(newPassword, { minLength: Number(user.auth_password_min_length || 8), requireUpper: user.auth_password_require_upper !== false, requireLower: user.auth_password_require_lower !== false, requireNumber: user.auth_password_require_number !== false, requireSpecial: user.auth_password_require_special !== false });
    if (!passwordValidation.valid) return res.status(400).json({ message: passwordValidation.errors.join(" ") });
    const passwordHash = await hashPassword(newPassword);
    await query("BEGIN");
    try {
      await query(`UPDATE users SET password_hash = $2, password_changed_at = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1`, [user.id, passwordHash]);
      await query("UPDATE password_reset_otps SET used_at = NOW() WHERE id = $1", [otpRow.id]);
      await query("COMMIT");
    } catch (txError) { await query("ROLLBACK"); throw txError; }
    return res.json({ message: "Senha atualizada com sucesso." });
  } catch (error) { return next(error); }
});