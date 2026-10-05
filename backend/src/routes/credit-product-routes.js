import express from "express";
import { query } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const creditProductRouter = express.Router();

creditProductRouter.use(requireAuth);
creditProductRouter.use(requireReadWrite("alterar.parametros.negocio"));

function getCompanyId(req, res) {
  const { companyId } = resolveCompanyScope(req);
  if (!companyId) {
    res.status(400).json({ message: "Selecione uma empresa ativa para gerir a parametrizacao." });
    return null;
  }
  return companyId;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validatePayload(body) {
  const data = {
    code: String(body?.code || "").trim().toUpperCase(),
    name: String(body?.name || "").trim(),
    description: String(body?.description || "").trim(),
    minAmount: normalizeNumber(body?.minAmount),
    maxAmount: normalizeNumber(body?.maxAmount),
    minTermMonths: Math.trunc(normalizeNumber(body?.minTermMonths, 1)),
    maxTermMonths: Math.trunc(normalizeNumber(body?.maxTermMonths, 12)),
    interestRate: normalizeNumber(body?.interestRate),
    administrativeFeeRate: normalizeNumber(body?.administrativeFeeRate),
    dailyPenaltyRate: normalizeNumber(body?.dailyPenaltyRate),
    paymentFrequency: String(body?.paymentFrequency || "mensal").trim().toLowerCase(),
    amortizationMethod: String(body?.amortizationMethod || "price").trim().toLowerCase(),
    requiresGuarantee: Boolean(body?.requiresGuarantee),
    isActive: body?.isActive !== false,
  };

  if (!data.code || !data.name) return { error: "Codigo e nome sao obrigatorios." };
  if (data.code.length > 40) return { error: "O codigo deve ter no maximo 40 caracteres." };
  if (data.minAmount < 0 || data.maxAmount < data.minAmount) {
    return { error: "Os valores minimo e maximo do credito sao invalidos." };
  }
  if (data.minTermMonths < 1 || data.maxTermMonths < data.minTermMonths) {
    return { error: "Os prazos minimo e maximo sao invalidos." };
  }
  if (data.interestRate < 0 || data.administrativeFeeRate < 0 || data.dailyPenaltyRate < 0) {
    return { error: "As taxas nao podem ser negativas." };
  }
  if (!["diario", "semanal", "quinzenal", "mensal"].includes(data.paymentFrequency)) {
    return { error: "Frequencia de pagamento invalida." };
  }
  if (!["price", "sac", "americano"].includes(data.amortizationMethod)) {
    return { error: "Metodo de amortizacao invalido." };
  }

  return { data };
}

function mapProduct(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    code: row.code,
    name: row.name,
    description: row.description || "",
    minAmount: Number(row.min_amount),
    maxAmount: Number(row.max_amount),
    minTermMonths: Number(row.min_term_months),
    maxTermMonths: Number(row.max_term_months),
    interestRate: Number(row.interest_rate),
    administrativeFeeRate: Number(row.administrative_fee_rate),
    dailyPenaltyRate: Number(row.daily_penalty_rate),
    paymentFrequency: row.payment_frequency,
    amortizationMethod: row.amortization_method,
    requiresGuarantee: row.requires_guarantee,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  id, company_id, code, name, description, min_amount, max_amount,
  min_term_months, max_term_months, interest_rate,
  administrative_fee_rate, daily_penalty_rate, payment_frequency,
  amortization_method, requires_guarantee, is_active, created_at, updated_at
`;

creditProductRouter.get("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    if (!companyId) return;

    const result = await query(
      `SELECT ${SELECT_COLUMNS}
       FROM credit_products
       WHERE company_id = $1
       ORDER BY is_active DESC, name ASC`,
      [companyId],
    );
    return res.json({ products: result.rows.map(mapProduct) });
  } catch (error) {
    console.error("[credit-products] list failed", error);
    return res.status(500).json({ message: "Nao foi possivel carregar os produtos de credito." });
  }
});

creditProductRouter.post("/", async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    if (!companyId) return;

    const { data, error } = validatePayload(req.body);
    if (error) return res.status(400).json({ message: error });

    const result = await query(
      `INSERT INTO credit_products (
        company_id, code, name, description, min_amount, max_amount,
        min_term_months, max_term_months, interest_rate,
        administrative_fee_rate, daily_penalty_rate, payment_frequency,
        amortization_method, requires_guarantee, is_active, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
      )
      RETURNING ${SELECT_COLUMNS}`,
      [
        companyId, data.code, data.name, data.description, data.minAmount, data.maxAmount,
        data.minTermMonths, data.maxTermMonths, data.interestRate,
        data.administrativeFeeRate, data.dailyPenaltyRate, data.paymentFrequency,
        data.amortizationMethod, data.requiresGuarantee, data.isActive,
      ],
    );

    return res.status(201).json({ product: mapProduct(result.rows[0]) });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Ja existe um produto com este codigo nesta empresa." });
    }
    console.error("[credit-products] create failed", error);
    return res.status(500).json({ message: "Nao foi possivel criar o produto de credito." });
  }
});

creditProductRouter.put("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    if (!companyId) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Produto invalido." });
    }

    const { data, error } = validatePayload(req.body);
    if (error) return res.status(400).json({ message: error });

    const result = await query(
      `UPDATE credit_products
       SET code = $1, name = $2, description = $3, min_amount = $4, max_amount = $5,
           min_term_months = $6, max_term_months = $7, interest_rate = $8,
           administrative_fee_rate = $9, daily_penalty_rate = $10,
           payment_frequency = $11, amortization_method = $12,
           requires_guarantee = $13, is_active = $14, updated_at = NOW()
       WHERE id = $15 AND company_id = $16
       RETURNING ${SELECT_COLUMNS}`,
      [
        data.code, data.name, data.description, data.minAmount, data.maxAmount,
        data.minTermMonths, data.maxTermMonths, data.interestRate,
        data.administrativeFeeRate, data.dailyPenaltyRate, data.paymentFrequency,
        data.amortizationMethod, data.requiresGuarantee, data.isActive, id, companyId,
      ],
    );

    if (!result.rows[0]) return res.status(404).json({ message: "Produto nao encontrado." });
    return res.json({ product: mapProduct(result.rows[0]) });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Ja existe um produto com este codigo nesta empresa." });
    }
    console.error("[credit-products] update failed", error);
    return res.status(500).json({ message: "Nao foi possivel atualizar o produto de credito." });
  }
});

creditProductRouter.delete("/:id", async (req, res) => {
  try {
    const companyId = getCompanyId(req, res);
    if (!companyId) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Produto invalido." });
    }

    const result = await query(
      `UPDATE credit_products
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING id`,
      [id, companyId],
    );

    if (!result.rows[0]) return res.status(404).json({ message: "Produto nao encontrado." });
    return res.json({ success: true });
  } catch (error) {
    console.error("[credit-products] deactivate failed", error);
    return res.status(500).json({ message: "Nao foi possivel desativar o produto de credito." });
  }
});
