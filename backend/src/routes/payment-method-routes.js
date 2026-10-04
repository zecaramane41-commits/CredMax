import express from "express";
import { query } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

export const paymentMethodRouter = express.Router();

paymentMethodRouter.use(requireAuth);

/**
 * GET /api/payment-methods - List payment methods for the current company
 */
paymentMethodRouter.get("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    const companyId = scope.companyId || (req.user?.companyId ?? null);
    if (!companyId) {
      return res.json({ items: [] });
    }

    const activeOnly = req.query.activeOnly === "true";
    let sql = `
      SELECT
        id,
        company_id AS "companyId",
        type,
        name,
        bank_name AS "bankName",
        account_number AS "accountNumber",
        nib_iban AS "nibIban",
        account_holder AS "accountHolder",
        branch,
        provider,
        phone_number AS "phoneNumber",
        agent_code AS "agentCode",
        is_default AS "isDefault",
        is_active AS "isActive",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM company_payment_methods
      WHERE company_id = $1
    `;
    const params = [companyId];

    if (activeOnly) {
      sql += ` AND is_active = true`;
    }

    sql += ` ORDER BY is_default DESC, is_active DESC, name ASC`;

    const result = await query(sql, params);

    // Se nao houver nenhuma conta cadastrada, inicializa com as padrao para conveniencia
    if (result.rows.length === 0) {
      const defaults = [
        {
          company_id: companyId,
          type: "caixa",
          name: "Caixa Geral (Numerário)",
          bank_name: null,
          account_number: "CX-01",
          nib_iban: null,
          account_holder: "Tesouraria Principal",
          branch: "Sede",
          provider: null,
          phone_number: null,
          agent_code: null,
          is_default: true,
          is_active: true,
          notes: "Conta padrão em numerário",
        },
        {
          company_id: companyId,
          type: "banco",
          name: "Conta BCI Principal",
          bank_name: "BCI",
          account_number: "20192837401",
          nib_iban: "000800002019283740112",
          account_holder: "Microcrédito MSU",
          branch: "Balcão Central Maputo",
          provider: null,
          phone_number: null,
          agent_code: null,
          is_default: false,
          is_active: true,
          notes: "Conta bancária operacional",
        },
        {
          company_id: companyId,
          type: "banco",
          name: "Conta Millennium BIM",
          bank_name: "Millennium BIM",
          account_number: "19283746501",
          nib_iban: "000100001928374650145",
          account_holder: "Microcrédito MSU",
          branch: "Balcão 24 de Julho",
          provider: null,
          phone_number: null,
          agent_code: null,
          is_default: false,
          is_active: true,
          notes: "Conta para recebimentos e transferências",
        },
        {
          company_id: companyId,
          type: "carteira_movel",
          name: "M-Pesa Negócios",
          bank_name: null,
          account_number: "841234567",
          nib_iban: null,
          account_holder: "Microcrédito MSU",
          branch: null,
          provider: "M-Pesa",
          phone_number: "841234567",
          agent_code: "987654",
          is_default: false,
          is_active: true,
          notes: "Carteira móvel Vodacom",
        },
        {
          company_id: companyId,
          type: "carteira_movel",
          name: "E-Mola Pagamentos",
          bank_name: null,
          account_number: "861234567",
          nib_iban: null,
          account_holder: "Microcrédito MSU",
          branch: null,
          provider: "E-Mola",
          phone_number: "861234567",
          agent_code: "123456",
          is_default: false,
          is_active: true,
          notes: "Carteira móvel Movitel",
        },
      ];

      for (const d of defaults) {
        await query(
          `
          INSERT INTO company_payment_methods (
            company_id, type, name, bank_name, account_number, nib_iban,
            account_holder, branch, provider, phone_number, agent_code,
            is_default, is_active, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `,
          [
            d.company_id,
            d.type,
            d.name,
            d.bank_name,
            d.account_number,
            d.nib_iban,
            d.account_holder,
            d.branch,
            d.provider,
            d.phone_number,
            d.agent_code,
            d.is_default,
            d.is_active,
            d.notes,
          ]
        );
      }

      const reCheck = await query(sql, params);
      return res.json({ items: reCheck.rows });
    }

    return res.json({ items: result.rows });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/payment-methods - Create new payment method
 */
paymentMethodRouter.post("/", requirePermission("alterar.configuracoes.sistema", "gerir.perfis", "criar.usuarios"), async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    const companyId = scope.companyId || (req.user?.companyId ?? null);
    if (!companyId) {
      return res.status(400).json({ message: "Nenhuma empresa selecionada." });
    }

    const {
      type,
      name,
      bankName,
      accountNumber,
      nibIban,
      accountHolder,
      branch,
      provider,
      phoneNumber,
      agentCode,
      isDefault,
      isActive,
      notes,
    } = req.body || {};

    if (!type || !["banco", "carteira_movel", "caixa"].includes(type)) {
      return res.status(400).json({ message: "Tipo inválido. Escolha Banco, Carteira Móvel ou Caixa." });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Nome / Identificação da conta é obrigatório." });
    }

    if (type === "banco") {
      if (!bankName || !String(bankName).trim()) {
        return res.status(400).json({ message: "Selecione ou informe o Banco." });
      }
      if (!accountNumber || !String(accountNumber).trim()) {
        return res.status(400).json({ message: "Número da conta bancária é obrigatório." });
      }
    }

    if (type === "carteira_movel") {
      if (!provider || !String(provider).trim()) {
        return res.status(400).json({ message: "Selecione o provedor (M-Pesa, E-Mola, M-Kesh)." });
      }
      if (!phoneNumber && !accountNumber) {
        return res.status(400).json({ message: "Número de telefone / conta móvel é obrigatório." });
      }
    }

    if (isDefault) {
      await query(`UPDATE company_payment_methods SET is_default = false WHERE company_id = $1`, [companyId]);
    }

    const result = await query(
      `
      INSERT INTO company_payment_methods (
        company_id, type, name, bank_name, account_number, nib_iban,
        account_holder, branch, provider, phone_number, agent_code,
        is_default, is_active, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING
        id,
        company_id AS "companyId",
        type,
        name,
        bank_name AS "bankName",
        account_number AS "accountNumber",
        nib_iban AS "nibIban",
        account_holder AS "accountHolder",
        branch,
        provider,
        phone_number AS "phoneNumber",
        agent_code AS "agentCode",
        is_default AS "isDefault",
        is_active AS "isActive",
        notes,
        created_at AS "createdAt"
      `,
      [
        companyId,
        type,
        String(name).trim(),
        bankName ? String(bankName).trim() : null,
        accountNumber ? String(accountNumber).trim() : (phoneNumber ? String(phoneNumber).trim() : null),
        nibIban ? String(nibIban).trim() : null,
        accountHolder ? String(accountHolder).trim() : null,
        branch ? String(branch).trim() : null,
        provider ? String(provider).trim() : null,
        phoneNumber ? String(phoneNumber).trim() : null,
        agentCode ? String(agentCode).trim() : null,
        Boolean(isDefault),
        isActive !== false,
        notes ? String(notes).trim() : null,
      ]
    );

    return res.status(201).json({
      message: "Forma de pagamento registada com sucesso.",
      item: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PUT /api/payment-methods/:id - Update payment method
 */
paymentMethodRouter.put("/:id", requirePermission("alterar.configuracoes.sistema", "gerir.perfis", "criar.usuarios"), async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    const companyId = scope.companyId || (req.user?.companyId ?? null);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "ID inválido." });

    const {
      type,
      name,
      bankName,
      accountNumber,
      nibIban,
      accountHolder,
      branch,
      provider,
      phoneNumber,
      agentCode,
      isDefault,
      isActive,
      notes,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Nome da conta é obrigatório." });
    }

    if (isDefault) {
      await query(`UPDATE company_payment_methods SET is_default = false WHERE company_id = $1 AND id <> $2`, [companyId, id]);
    }

    const result = await query(
      `
      UPDATE company_payment_methods
      SET
        type = COALESCE($1, type),
        name = $2,
        bank_name = $3,
        account_number = $4,
        nib_iban = $5,
        account_holder = $6,
        branch = $7,
        provider = $8,
        phone_number = $9,
        agent_code = $10,
        is_default = $11,
        is_active = $12,
        notes = $13,
        updated_at = NOW()
      WHERE id = $14 AND company_id = $15
      RETURNING
        id,
        company_id AS "companyId",
        type,
        name,
        bank_name AS "bankName",
        account_number AS "accountNumber",
        nib_iban AS "nibIban",
        account_holder AS "accountHolder",
        branch,
        provider,
        phone_number AS "phoneNumber",
        agent_code AS "agentCode",
        is_default AS "isDefault",
        is_active AS "isActive",
        notes,
        updated_at AS "updatedAt"
      `,
      [
        type,
        String(name).trim(),
        bankName ? String(bankName).trim() : null,
        accountNumber ? String(accountNumber).trim() : null,
        nibIban ? String(nibIban).trim() : null,
        accountHolder ? String(accountHolder).trim() : null,
        branch ? String(branch).trim() : null,
        provider ? String(provider).trim() : null,
        phoneNumber ? String(phoneNumber).trim() : null,
        agentCode ? String(agentCode).trim() : null,
        Boolean(isDefault),
        isActive !== false,
        notes ? String(notes).trim() : null,
        id,
        companyId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Forma de pagamento não encontrada." });
    }

    return res.json({
      message: "Forma de pagamento atualizada com sucesso.",
      item: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /api/payment-methods/:id - Delete payment method
 */
paymentMethodRouter.delete("/:id", requirePermission("alterar.configuracoes.sistema", "gerir.perfis", "criar.usuarios"), async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    const companyId = scope.companyId || (req.user?.companyId ?? null);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "ID inválido." });

    const result = await query(
      `DELETE FROM company_payment_methods WHERE id = $1 AND company_id = $2 RETURNING id, name`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Forma de pagamento não encontrada." });
    }

    return res.json({ message: "Forma de pagamento eliminada com sucesso." });
  } catch (error) {
    return next(error);
  }
});
