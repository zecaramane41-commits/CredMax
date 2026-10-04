import express from "express";
import { query, withTransaction } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import {
  normalizeMozDocumentNumber,
  normalizeMozNuit,
  validateMozDocumentNumber,
  validateMozNuit,
} from "../utils/mozambique-validation.js";

export const companyContextRouter = express.Router();

companyContextRouter.use(requireAuth);
companyContextRouter.use(requirePermission("alterar.configuracoes.sistema"));

companyContextRouter.get("/profile", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Nenhuma empresa selecionada." });
    }

    const result = await query(
      `
      SELECT
        id,
        name,
        legal_name,
        nuit,
        phone,
        email,
        address,
        owner_name,
        owner_nuit,
        owner_phone,
        owner_email,
        owner_document_type,
        owner_document_number,
        owner_address,
        logo_url,
        accounting_template_code,
        auth_enforce_mfa,
        auth_session_timeout_min,
        auth_session_timeout_admin_min,
        auth_session_timeout_manager_min,
        auth_session_timeout_operator_min,
        auth_password_min_length,
        auth_password_require_upper,
        auth_password_require_lower,
        auth_password_require_number,
        auth_password_require_special,
        auth_password_expiry_days,
        auth_max_login_attempts,
        auth_lockout_minutes,
        privacy_mask_sensitive_data,
        privacy_allow_cross_company_lookup,
        is_active,
        created_at
      FROM companies
      WHERE id = $1
      LIMIT 1
      `,
      [scope.companyId],
    );

    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: "Empresa nao encontrada." });

    return res.json({
      company: {
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
        accountingTemplateCode: row.accounting_template_code || "microcredito",
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
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// PUT /company/profile - update company from within the company context (settings → empresa)
companyContextRouter.put("/profile", requirePermission("alterar.configuracoes.sistema"), async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Nenhuma empresa selecionada." });
    }

    const {
      name,
      legalName,
      nuit,
      phone,
      email,
      address,
      ownerName,
      ownerNuit,
      ownerPhone,
      ownerEmail,
      ownerDocumentType,
      ownerDocumentNumber,
      ownerAddress,
      logoUrl,
    } = req.body || {};

    const trimmedName = String(name || "").trim();
    if (!trimmedName) return res.status(400).json({ message: "Nome da empresa e obrigatorio." });

    const normalizedNuit = normalizeMozNuit(nuit);
    const normalizedOwnerNuit = normalizeMozNuit(ownerNuit);
    const normalizedOwnerDocumentNumber = normalizeMozDocumentNumber(ownerDocumentNumber || "", ownerDocumentType || "");

    const companyNuitError = validateMozNuit(normalizedNuit, { required: false, label: "NUIT da empresa" });
    if (companyNuitError) return res.status(400).json({ message: companyNuitError });

    const ownerNuitError = validateMozNuit(normalizedOwnerNuit, { required: false, label: "NUIT do proprietario" });
    if (ownerNuitError) return res.status(400).json({ message: ownerNuitError });

    const ownerDocumentError = validateMozDocumentNumber(normalizedOwnerDocumentNumber, ownerDocumentType || "", {
      required: false,
      label: "Documento do proprietario",
    });
    if (ownerDocumentError) return res.status(400).json({ message: ownerDocumentError });

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
          logo_url = $14
        WHERE id = $15
        RETURNING *
        `,
        [
          trimmedName,
          legalName || null,
          normalizedNuit || null,
          phone || null,
          email || null,
          address || null,
          ownerName || null,
          normalizedOwnerNuit || null,
          ownerPhone || null,
          ownerEmail || null,
          ownerDocumentType || null,
          normalizedOwnerDocumentNumber || null,
          ownerAddress || null,
          logoUrl || null,
          scope.companyId,
        ],
      );

      const company = updated.rows[0];
      if (!company) return null;

      return company;
    });

    if (!row) return res.status(404).json({ message: "Empresa nao encontrada." });

    return res.json({
      message: "Dados da empresa atualizados com sucesso.",
      company: {
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
      },
    });
  } catch (error) {
    return next(error);
  }
});