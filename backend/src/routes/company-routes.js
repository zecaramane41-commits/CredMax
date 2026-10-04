import express from "express";
import { query, withTransaction } from "../config/db.js";
import { isCentralAdmin, requireAuth } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";
import {
  DEFAULT_ACCOUNTING_TEMPLATE_CODE,
  applyCompanyAccountingTemplate,
  normalizeAccountingTemplateCode,
} from "../services/accounting-service.js";
import { hashPassword } from "../utils/security.js";
import { normalizePasswordPolicy, validatePasswordAgainstPolicy } from "../utils/password-policy.js";
import {
  normalizeMozDocumentNumber,
  normalizeMozNuit,
  validateMozDocumentNumber,
  validateMozNuit,
} from "../utils/mozambique-validation.js";

export const companyRouter = express.Router();

function parseIntInRange(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseOptionalIntInRange(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mapCompanyRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    legalName: row.legal_name || "",
    nuit: row.nuit || "",
    phone: row.phone || "",
    email: row.email || "",
    address: row.address || "",
    ownerName: row.owner_name || "",
    ownerNuit: row.owner_nuit || "",
    ownerPhone: row.owner_phone || "",
    ownerEmail: row.owner_email || "",
    ownerDocumentType: row.owner_document_type || "",
    ownerDocumentNumber: row.owner_document_number || "",
    ownerAddress: row.owner_address || "",
    logoUrl: row.logo_url || "",
    accountingTemplateCode: row.accounting_template_code || DEFAULT_ACCOUNTING_TEMPLATE_CODE,
    authEnforceMfa: Boolean(row.auth_enforce_mfa),
    authSessionTimeoutMin: Number(row.auth_session_timeout_min || 30),
    authSessionTimeoutAdminMin: row.auth_session_timeout_admin_min ? Number(row.auth_session_timeout_admin_min) : null,
    authSessionTimeoutManagerMin: row.auth_session_timeout_manager_min ? Number(row.auth_session_timeout_manager_min) : null,
    authSessionTimeoutOperatorMin: row.auth_session_timeout_operator_min ? Number(row.auth_session_timeout_operator_min) : null,
    authPasswordMinLength: Number(row.auth_password_min_length || 8),
    authPasswordRequireUpper: Boolean(row.auth_password_require_upper),
    authPasswordRequireLower: Boolean(row.auth_password_require_lower),
    authPasswordRequireNumber: Boolean(row.auth_password_require_number),
    authPasswordRequireSpecial: Boolean(row.auth_password_require_special),
    authPasswordExpiryDays: Number(row.auth_password_expiry_days || 90),
    authMaxLoginAttempts: Number(row.auth_max_login_attempts || 5),
    authLockoutMinutes: Number(row.auth_lockout_minutes || 15),
    privacyMaskSensitiveData: Boolean(row.privacy_mask_sensitive_data),
    privacyAllowCrossCompanyLookup: Boolean(row.privacy_allow_cross_company_lookup),
    isActive: Boolean(row.is_active),
    usersCount: Number(row.users_count || 0),
    clientsCount: Number(row.clients_count || 0),
    loansCount: Number(row.loans_count || 0),
    adminUserId: row.admin_user_id ? Number(row.admin_user_id) : null,
    adminFullName: row.admin_full_name || "",
    adminEmail: row.admin_email || "",
    createdAt: row.created_at,
  };
}

companyRouter.use(requireAuth);

companyRouter.use((req, res, next) => {
  if (!isCentralAdmin(req)) {
    return res.status(403).json({ message: "Acesso restrito ao Administrador Central." });
  }
  return next();
});
companyRouter.use(requireReadWrite("admin_companies.view", "admin_companies.manage"));

companyRouter.get("/", async (_req, res, next) => {
  try {
    const result = await query(
      `
      SELECT
        c.id,
        c.name,
        c.legal_name,
        c.nuit,
        c.phone,
        c.email,
        c.address,
        c.owner_name,
        c.owner_nuit,
        c.owner_phone,
        c.owner_email,
        c.owner_document_type,
        c.owner_document_number,
        c.owner_address,
        c.logo_url,
        c.accounting_template_code,
        c.auth_enforce_mfa,
        c.auth_session_timeout_min,
        c.auth_session_timeout_admin_min,
        c.auth_session_timeout_manager_min,
        c.auth_session_timeout_operator_min,
        c.auth_password_min_length,
        c.auth_password_require_upper,
        c.auth_password_require_lower,
        c.auth_password_require_number,
        c.auth_password_require_special,
        c.auth_password_expiry_days,
        c.auth_max_login_attempts,
        c.auth_lockout_minutes,
        c.privacy_mask_sensitive_data,
        c.privacy_allow_cross_company_lookup,
        c.is_active,
        c.created_at,
        COALESCE(COUNT(DISTINCT u.id), 0)::int AS users_count,
        COALESCE(COUNT(DISTINCT cl.id), 0)::int AS clients_count,
        COALESCE(COUNT(DISTINCT l.id), 0)::int AS loans_count,
        MAX(CASE WHEN LOWER(u.role) = 'admin' AND u.is_portfolio_only = false THEN u.id END) AS admin_user_id,
        MAX(CASE WHEN LOWER(u.role) = 'admin' AND u.is_portfolio_only = false THEN u.full_name END) AS admin_full_name,
        MAX(CASE WHEN LOWER(u.role) = 'admin' AND u.is_portfolio_only = false THEN u.email END) AS admin_email
      FROM companies c
      LEFT JOIN users u ON u.company_id = c.id
      LEFT JOIN clients cl ON cl.company_id = c.id
      LEFT JOIN loans l ON l.company_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `,
    );

    return res.json({
      companies: result.rows.map(mapCompanyRow),
    });
  } catch (error) {
    return next(error);
  }
});

companyRouter.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const legalName = String(req.body?.legalName || "").trim();
    const nuit = normalizeMozNuit(req.body?.nuit);
    const phone = String(req.body?.phone || "").trim();
    const email = normalizeEmail(req.body?.email);
    const address = String(req.body?.address || "").trim();
    const ownerName = String(req.body?.ownerName || "").trim();
    const ownerNuit = normalizeMozNuit(req.body?.ownerNuit);
    const ownerPhone = String(req.body?.ownerPhone || "").trim();
    const ownerEmail = normalizeEmail(req.body?.ownerEmail);
    const ownerDocumentType = String(req.body?.ownerDocumentType || "").trim();
    const ownerDocumentNumber = normalizeMozDocumentNumber(req.body?.ownerDocumentNumber, ownerDocumentType);
    const ownerAddress = String(req.body?.ownerAddress || "").trim();
    const logoUrl = String(req.body?.logoUrl || "").trim();
    const accountingTemplateCodeRaw = String(req.body?.accountingTemplateCode || "").trim();
    const accountingTemplateCodeNormalized = normalizeAccountingTemplateCode(accountingTemplateCodeRaw);
    const accountingTemplateCode = accountingTemplateCodeNormalized || DEFAULT_ACCOUNTING_TEMPLATE_CODE;
    const adminFullName = String(req.body?.adminFullName || "").trim();
    const adminEmail = normalizeEmail(req.body?.adminEmail);
    const adminPassword = String(req.body?.adminPassword || "");
    const authEnforceMfa = Boolean(req.body?.authEnforceMfa ?? false);
    const authMfaCode = String(req.body?.authMfaCode || "").trim();
    const authSessionTimeoutMin = parseIntInRange(req.body?.authSessionTimeoutMin ?? 30, 30, 5, 1440);
    const authSessionTimeoutAdminMin = parseOptionalIntInRange(req.body?.authSessionTimeoutAdminMin, 5, 1440);
    const authSessionTimeoutManagerMin = parseOptionalIntInRange(req.body?.authSessionTimeoutManagerMin, 5, 1440);
    const authSessionTimeoutOperatorMin = parseOptionalIntInRange(req.body?.authSessionTimeoutOperatorMin, 5, 1440);
    const authPasswordPolicy = normalizePasswordPolicy({
      minLength: req.body?.authPasswordMinLength,
      requireUpper: req.body?.authPasswordRequireUpper,
      requireLower: req.body?.authPasswordRequireLower,
      requireNumber: req.body?.authPasswordRequireNumber,
      requireSpecial: req.body?.authPasswordRequireSpecial,
      expiryDays: req.body?.authPasswordExpiryDays,
    });
    const authMaxLoginAttempts = parseIntInRange(req.body?.authMaxLoginAttempts ?? 5, 5, 3, 20);
    const authLockoutMinutes = parseIntInRange(req.body?.authLockoutMinutes ?? 15, 15, 1, 1440);
    const privacyMaskSensitiveData = Boolean(req.body?.privacyMaskSensitiveData ?? false);
    const privacyAllowCrossCompanyLookup = Boolean(req.body?.privacyAllowCrossCompanyLookup ?? false);
    const isActive = Boolean(req.body?.isActive ?? true);

    if (!name) return res.status(400).json({ message: "Nome da empresa e obrigatorio." });
    if (!adminFullName || !adminEmail || !adminPassword) {
      return res.status(400).json({ message: "Nome, email e senha do admin da empresa sao obrigatorios." });
    }
    if (!isValidEmail(adminEmail)) {
      return res.status(400).json({ message: "Email do admin da empresa e invalido." });
    }
    const companyNuitError = validateMozNuit(nuit, { required: false, label: "NUIT da empresa" });
    if (companyNuitError) {
      return res.status(400).json({ message: companyNuitError });
    }
    if (accountingTemplateCodeRaw && !accountingTemplateCodeNormalized) {
      return res.status(400).json({ message: "Template contabil invalido para a empresa." });
    }
    const ownerNuitError = validateMozNuit(ownerNuit, { required: false, label: "NUIT do proprietario" });
    if (ownerNuitError) {
      return res.status(400).json({ message: ownerNuitError });
    }
    const ownerDocumentError = validateMozDocumentNumber(ownerDocumentNumber, ownerDocumentType, {
      required: false,
      label: "Documento do proprietario",
    });
    if (ownerDocumentError) {
      return res.status(400).json({ message: ownerDocumentError });
    }
    if (!Number.isInteger(authSessionTimeoutMin) || authSessionTimeoutMin < 5 || authSessionTimeoutMin > 1440) {
      return res.status(400).json({ message: "Timeout de sessao invalido (5-1440 minutos)." });
    }
    if (authMfaCode && !/^\d{6}$/.test(authMfaCode)) {
      return res.status(400).json({ message: "Codigo MFA deve conter 6 digitos numericos." });
    }
    if (authEnforceMfa && !authMfaCode) {
      return res.status(400).json({ message: "Informe o codigo MFA para habilitar MFA na empresa." });
    }
    const adminPasswordValidation = validatePasswordAgainstPolicy(adminPassword, authPasswordPolicy);
    if (!adminPasswordValidation.valid) {
      return res.status(400).json({ message: adminPasswordValidation.errors.join(" ") });
    }
    const authMfaCodeHash = authMfaCode ? await hashPassword(authMfaCode) : null;
    const adminPasswordHash = await hashPassword(adminPassword);

    const row = await withTransaction(async (dbClient) => {
      const inserted = await dbClient.query(
        `
        INSERT INTO companies (
          name, legal_name, nuit, phone, email, address,
          owner_name, owner_nuit, owner_phone, owner_email, owner_document_type, owner_document_number, owner_address,
          logo_url, accounting_template_code, auth_mfa_code_hash,
          auth_enforce_mfa, auth_session_timeout_min,
          auth_session_timeout_admin_min, auth_session_timeout_manager_min, auth_session_timeout_operator_min,
          auth_password_min_length, auth_password_require_upper, auth_password_require_lower,
          auth_password_require_number, auth_password_require_special, auth_password_expiry_days,
          auth_max_login_attempts, auth_lockout_minutes,
          privacy_mask_sensitive_data, privacy_allow_cross_company_lookup, is_active
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
        RETURNING *
        `,
        [
          name,
          legalName || null,
          nuit || null,
          phone || null,
          email || null,
          address || null,
          ownerName || null,
          ownerNuit || null,
          ownerPhone || null,
          ownerEmail || null,
          ownerDocumentType || null,
          ownerDocumentNumber || null,
          ownerAddress || null,
          logoUrl || null,
          accountingTemplateCode,
          authMfaCodeHash,
          authEnforceMfa,
          authSessionTimeoutMin,
          authSessionTimeoutAdminMin,
          authSessionTimeoutManagerMin,
          authSessionTimeoutOperatorMin,
          authPasswordPolicy.minLength,
          authPasswordPolicy.requireUpper,
          authPasswordPolicy.requireLower,
          authPasswordPolicy.requireNumber,
          authPasswordPolicy.requireSpecial,
          authPasswordPolicy.expiryDays,
          authMaxLoginAttempts,
          authLockoutMinutes,
          privacyMaskSensitiveData,
          privacyAllowCrossCompanyLookup,
          isActive,
        ],
      );

      const company = inserted.rows[0];
      const createdAdmin = await dbClient.query(
        `
        INSERT INTO users (
          full_name,
          email,
          password_hash,
          role,
          company_id,
          is_active,
          is_portfolio_only,
          permissions_json,
          password_changed_at
        )
        VALUES ($1, $2, $3, 'admin', $4, true, false, '["*"]'::jsonb, NOW())
        RETURNING id, full_name, email
        `,
        [adminFullName, adminEmail, adminPasswordHash, company.id],
      );
      const admin = createdAdmin.rows[0];
      await applyCompanyAccountingTemplate(dbClient, Number(company.id), accountingTemplateCode);
      return {
        ...company,
        accounting_template_code: accountingTemplateCode,
        admin_user_id: admin.id,
        admin_full_name: admin.full_name,
        admin_email: admin.email,
      };
    });

    return res.status(201).json({
      message: "Empresa criada com sucesso.",
      company: mapCompanyRow(row),
    });
  } catch (error) {
    if (error?.code === "23505") {
      const constraint = String(error?.constraint || "");
      if (constraint.includes("users") || constraint.includes("email")) {
        return res.status(409).json({ message: "Email do admin da empresa ja existe." });
      }
      return res.status(409).json({ message: "Nome da empresa ja existe." });
    }
    return next(error);
  }
});

companyRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });

    const name = String(req.body?.name || "").trim();
    const legalName = String(req.body?.legalName || "").trim();
    const nuit = normalizeMozNuit(req.body?.nuit);
    const phone = String(req.body?.phone || "").trim();
    const email = normalizeEmail(req.body?.email);
    const address = String(req.body?.address || "").trim();
    const ownerName = String(req.body?.ownerName || "").trim();
    const ownerNuit = normalizeMozNuit(req.body?.ownerNuit);
    const ownerPhone = String(req.body?.ownerPhone || "").trim();
    const ownerEmail = normalizeEmail(req.body?.ownerEmail);
    const ownerDocumentType = String(req.body?.ownerDocumentType || "").trim();
    const ownerDocumentNumber = normalizeMozDocumentNumber(req.body?.ownerDocumentNumber, ownerDocumentType);
    const ownerAddress = String(req.body?.ownerAddress || "").trim();
    const logoUrl = String(req.body?.logoUrl || "").trim();
    const accountingTemplateCodeRaw = String(req.body?.accountingTemplateCode || "").trim();
    const hasAccountingTemplateInput = accountingTemplateCodeRaw.length > 0;
    const accountingTemplateCodeNormalized = normalizeAccountingTemplateCode(accountingTemplateCodeRaw);
    const accountingTemplateCode = hasAccountingTemplateInput ? accountingTemplateCodeNormalized : null;
    const adminFullName = String(req.body?.adminFullName || "").trim();
    const adminEmail = normalizeEmail(req.body?.adminEmail);
    const adminPassword = String(req.body?.adminPassword || "");
    const wantsAdminUpdate = Boolean(adminFullName || adminEmail || adminPassword);
    const authEnforceMfa = Boolean(req.body?.authEnforceMfa ?? false);
    const authMfaCode = String(req.body?.authMfaCode || "").trim();
    const authSessionTimeoutMin = parseIntInRange(req.body?.authSessionTimeoutMin ?? 30, 30, 5, 1440);
    const authSessionTimeoutAdminMin = parseOptionalIntInRange(req.body?.authSessionTimeoutAdminMin, 5, 1440);
    const authSessionTimeoutManagerMin = parseOptionalIntInRange(req.body?.authSessionTimeoutManagerMin, 5, 1440);
    const authSessionTimeoutOperatorMin = parseOptionalIntInRange(req.body?.authSessionTimeoutOperatorMin, 5, 1440);
    const authPasswordPolicy = normalizePasswordPolicy({
      minLength: req.body?.authPasswordMinLength,
      requireUpper: req.body?.authPasswordRequireUpper,
      requireLower: req.body?.authPasswordRequireLower,
      requireNumber: req.body?.authPasswordRequireNumber,
      requireSpecial: req.body?.authPasswordRequireSpecial,
      expiryDays: req.body?.authPasswordExpiryDays,
    });
    const authMaxLoginAttempts = parseIntInRange(req.body?.authMaxLoginAttempts ?? 5, 5, 3, 20);
    const authLockoutMinutes = parseIntInRange(req.body?.authLockoutMinutes ?? 15, 15, 1, 1440);
    const privacyMaskSensitiveData = Boolean(req.body?.privacyMaskSensitiveData ?? false);
    const privacyAllowCrossCompanyLookup = Boolean(req.body?.privacyAllowCrossCompanyLookup ?? false);
    const isActive = Boolean(req.body?.isActive ?? true);

    if (!name) return res.status(400).json({ message: "Nome da empresa e obrigatorio." });
    if (adminEmail && !isValidEmail(adminEmail)) {
      return res.status(400).json({ message: "Email do admin da empresa e invalido." });
    }
    const companyNuitError = validateMozNuit(nuit, { required: false, label: "NUIT da empresa" });
    if (companyNuitError) {
      return res.status(400).json({ message: companyNuitError });
    }
    if (hasAccountingTemplateInput && !accountingTemplateCodeNormalized) {
      return res.status(400).json({ message: "Template contabil invalido para a empresa." });
    }
    const ownerNuitError = validateMozNuit(ownerNuit, { required: false, label: "NUIT do proprietario" });
    if (ownerNuitError) {
      return res.status(400).json({ message: ownerNuitError });
    }
    const ownerDocumentError = validateMozDocumentNumber(ownerDocumentNumber, ownerDocumentType, {
      required: false,
      label: "Documento do proprietario",
    });
    if (ownerDocumentError) {
      return res.status(400).json({ message: ownerDocumentError });
    }
    if (!Number.isInteger(authSessionTimeoutMin) || authSessionTimeoutMin < 5 || authSessionTimeoutMin > 1440) {
      return res.status(400).json({ message: "Timeout de sessao invalido (5-1440 minutos)." });
    }
    if (authMfaCode && !/^\d{6}$/.test(authMfaCode)) {
      return res.status(400).json({ message: "Codigo MFA deve conter 6 digitos numericos." });
    }
    if (authEnforceMfa && !authMfaCode) {
      const hasMfa = await query("SELECT auth_mfa_code_hash FROM companies WHERE id = $1", [id]);
      if (!hasMfa.rows[0]?.auth_mfa_code_hash) {
        return res.status(400).json({ message: "Informe o codigo MFA para habilitar MFA na empresa." });
      }
    }
    const adminPasswordValidation = adminPassword
      ? validatePasswordAgainstPolicy(adminPassword, authPasswordPolicy)
      : { valid: true, errors: [] };
    if (!adminPasswordValidation.valid) {
      return res.status(400).json({ message: adminPasswordValidation.errors.join(" ") });
    }
    const authMfaCodeHash = authMfaCode ? await hashPassword(authMfaCode) : null;
    const adminPasswordHash = adminPassword ? await hashPassword(adminPassword) : null;

    const row = await withTransaction(async (dbClient) => {
      const updated = await dbClient.query(
        `
        UPDATE companies
        SET
          name = $1,
          legal_name = $2,
          nuit = $3,
          phone = $4,
          email = $5,
          address = $6,
          owner_name = $7,
          owner_nuit = $8,
          owner_phone = $9,
          owner_email = $10,
          owner_document_type = $11,
          owner_document_number = $12,
          owner_address = $13,
          logo_url = $14,
          accounting_template_code = COALESCE($15, accounting_template_code),
          auth_mfa_code_hash = COALESCE($16, auth_mfa_code_hash),
          auth_enforce_mfa = $17,
          auth_session_timeout_min = $18,
          auth_session_timeout_admin_min = $19,
          auth_session_timeout_manager_min = $20,
          auth_session_timeout_operator_min = $21,
          auth_password_min_length = $22,
          auth_password_require_upper = $23,
          auth_password_require_lower = $24,
          auth_password_require_number = $25,
          auth_password_require_special = $26,
          auth_password_expiry_days = $27,
          auth_max_login_attempts = $28,
          auth_lockout_minutes = $29,
          privacy_mask_sensitive_data = $30,
          privacy_allow_cross_company_lookup = $31,
          is_active = $32
        WHERE id = $33
        RETURNING *
        `,
        [
          name,
          legalName || null,
          nuit || null,
          phone || null,
          email || null,
          address || null,
          ownerName || null,
          ownerNuit || null,
          ownerPhone || null,
          ownerEmail || null,
          ownerDocumentType || null,
          ownerDocumentNumber || null,
          ownerAddress || null,
          logoUrl || null,
          accountingTemplateCode,
          authMfaCodeHash,
          authEnforceMfa,
          authSessionTimeoutMin,
          authSessionTimeoutAdminMin,
          authSessionTimeoutManagerMin,
          authSessionTimeoutOperatorMin,
          authPasswordPolicy.minLength,
          authPasswordPolicy.requireUpper,
          authPasswordPolicy.requireLower,
          authPasswordPolicy.requireNumber,
          authPasswordPolicy.requireSpecial,
          authPasswordPolicy.expiryDays,
          authMaxLoginAttempts,
          authLockoutMinutes,
          privacyMaskSensitiveData,
          privacyAllowCrossCompanyLookup,
          isActive,
          id,
        ],
      );

      const company = updated.rows[0];
      if (!company) return null;
      const nextTemplateCode = normalizeAccountingTemplateCode(company.accounting_template_code) || DEFAULT_ACCOUNTING_TEMPLATE_CODE;
      await applyCompanyAccountingTemplate(dbClient, Number(company.id), nextTemplateCode);

      const adminResult = await dbClient.query(
        `
        SELECT id, full_name, email
        FROM users
        WHERE company_id = $1
          AND LOWER(role) = 'admin'
          AND is_portfolio_only = false
        ORDER BY id ASC
        LIMIT 1
        `,
        [id],
      );
      let adminRow = adminResult.rows[0] || null;

      if (!adminRow && wantsAdminUpdate) {
        if (!adminFullName || !adminEmail || !adminPasswordHash) {
          const createAdminError = new Error("Para criar admin da empresa informe nome, email e senha.");
          createAdminError.statusCode = 400;
          throw createAdminError;
        }
        const createdAdmin = await dbClient.query(
          `
          INSERT INTO users (
            full_name,
            email,
            password_hash,
            role,
            company_id,
            is_active,
            is_portfolio_only,
            permissions_json,
            password_changed_at
          )
          VALUES ($1, $2, $3, 'admin', $4, true, false, '["*"]'::jsonb, NOW())
          RETURNING id, full_name, email
          `,
          [adminFullName, adminEmail, adminPasswordHash, id],
        );
        adminRow = createdAdmin.rows[0];
      } else if (adminRow && wantsAdminUpdate) {
        const nextAdminFullName = adminFullName || adminRow.full_name;
        const nextAdminEmail = adminEmail || adminRow.email;
        if (!nextAdminFullName || !nextAdminEmail) {
          const updateAdminError = new Error("Nome e email do admin da empresa sao obrigatorios.");
          updateAdminError.statusCode = 400;
          throw updateAdminError;
        }
        const updatedAdmin = adminPasswordHash
          ? await dbClient.query(
            `
            UPDATE users
            SET
              full_name = $1,
              email = $2,
              password_hash = $3,
              password_changed_at = NOW(),
              failed_login_attempts = 0,
              locked_until = NULL
            WHERE id = $4
            RETURNING id, full_name, email
            `,
            [nextAdminFullName, nextAdminEmail, adminPasswordHash, adminRow.id],
          )
          : await dbClient.query(
            `
            UPDATE users
            SET
              full_name = $1,
              email = $2
            WHERE id = $3
            RETURNING id, full_name, email
            `,
            [nextAdminFullName, nextAdminEmail, adminRow.id],
          );
        adminRow = updatedAdmin.rows[0];
      }

      return {
        ...company,
        accounting_template_code: nextTemplateCode,
        admin_user_id: adminRow?.id || null,
        admin_full_name: adminRow?.full_name || "",
        admin_email: adminRow?.email || "",
      };
    });

    if (!row) return res.status(404).json({ message: "Empresa nao encontrada." });
    return res.json({
      message: "Empresa atualizada com sucesso.",
      company: mapCompanyRow(row),
    });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (error?.code === "23505") {
      const constraint = String(error?.constraint || "");
      if (constraint.includes("users") || constraint.includes("email")) {
        return res.status(409).json({ message: "Email do admin da empresa ja existe." });
      }
      return res.status(409).json({ message: "Nome da empresa ja existe." });
    }
    return next(error);
  }
});

companyRouter.post("/:id/admin/reset-password", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });

    const newPassword = String(req.body?.newPassword || "");
    if (!newPassword) {
      return res.status(400).json({ message: "Nova senha do admin e obrigatoria." });
    }

    const companyResult = await query(
      `
      SELECT
        auth_password_min_length,
        auth_password_require_upper,
        auth_password_require_lower,
        auth_password_require_number,
        auth_password_require_special
      FROM companies
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );
    const company = companyResult.rows[0];
    if (!company) return res.status(404).json({ message: "Empresa nao encontrada." });

    const passwordValidation = validatePasswordAgainstPolicy(newPassword, {
      minLength: Number(company.auth_password_min_length || 8),
      requireUpper: company.auth_password_require_upper !== false,
      requireLower: company.auth_password_require_lower !== false,
      requireNumber: company.auth_password_require_number !== false,
      requireSpecial: company.auth_password_require_special !== false,
    });
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.errors.join(" ") });
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await query(
      `
      UPDATE users
      SET
        password_hash = $2,
        password_changed_at = NOW(),
        failed_login_attempts = 0,
        locked_until = NULL,
        is_active = true
      WHERE id = (
        SELECT id
        FROM users
        WHERE company_id = $1
          AND LOWER(role) = 'admin'
          AND is_portfolio_only = false
        ORDER BY id ASC
        LIMIT 1
      )
      RETURNING id
      `,
      [id, passwordHash],
    );

    if (!updated.rows[0]) {
      return res.status(404).json({ message: "Admin da empresa nao encontrado." });
    }

    return res.json({ message: "Senha do admin atualizada com sucesso." });
  } catch (error) {
    return next(error);
  }
});

companyRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });

    const hasData = await query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM clients WHERE company_id = $1) AS clients_count,
        (SELECT COUNT(*)::int FROM loans WHERE company_id = $1) AS loans_count
      `,
      [id],
    );

    if (Number(hasData.rows[0]?.clients_count || 0) > 0 || Number(hasData.rows[0]?.loans_count || 0) > 0) {
      return res.status(409).json({ message: "Nao e possivel remover empresa com clientes/emprestimos associados." });
    }

    const removed = await query("DELETE FROM companies WHERE id = $1 RETURNING id", [id]);
    if (!removed.rows[0]) return res.status(404).json({ message: "Empresa nao encontrada." });
    return res.json({ message: "Empresa removida com sucesso." });
  } catch (error) {
    return next(error);
  }
});
