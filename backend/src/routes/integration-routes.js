import express from "express";
import { query, withTransaction } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";
import {
  autoMatchTransactions,
  normalizeExternalTransactions,
  normalizeRepayments,
} from "../services/reconciliation-service.js";

export const integrationRouter = express.Router();

integrationRouter.use(requireAuth);
integrationRouter.use(requireReadWrite("visualizar.financeiro", "alterar.configuracoes.sistema"));

const PROVIDERS = ["bank", "mobile_money", "accounting", "crc"];

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return PROVIDERS.includes(provider) ? provider : null;
}

integrationRouter.get("/transactions", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const rows = await query(
      `
      SELECT
        t.id, t.posted_at, t.amount, t.currency, t.direction,
        t.counterparty, t.description, t.reconciled, t.reconciled_at,
        r.amount_received AS matched_amount
      FROM external_transactions t
      LEFT JOIN loan_repayments r ON r.id = t.matched_loan_repayment_id
      WHERE t.company_id = $1 AND t.direction = 'credit'
      ORDER BY t.posted_at DESC, t.id DESC
      LIMIT 500
      `,
      [scope.companyId],
    );
    return res.json({
      items: rows.rows.map((row) => {
        const extrato = Number(row.amount || 0);
        const sistema = row.matched_amount === null ? null : Number(row.matched_amount);
        const diferenca = sistema === null ? null : Math.round((sistema - extrato) * 100) / 100;
        return {
          id: Number(row.id),
          postedAt: row.posted_at,
          amount: extrato,
          currency: row.currency || "MZN",
          counterparty: row.counterparty || "",
          description: row.description || "",
          matchedAmount: sistema,
          difference: diferenca,
          status: row.reconciled ? (diferenca === 0 ? "conciliado" : "divergente") : "pendente",
          reconciledAt: row.reconciled_at,
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
});

integrationRouter.get("/connectors", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });

    const rows = await query(
      `
      SELECT id, provider_code, is_enabled, status, last_sync_at, last_error, settings_json
      FROM integration_connectors
      WHERE company_id = $1
      ORDER BY provider_code ASC
      `,
      [scope.companyId],
    );

    return res.json({
      connectors: rows.rows.map((row) => ({
        id: Number(row.id),
        providerCode: row.provider_code,
        isEnabled: Boolean(row.is_enabled),
        status: row.status,
        lastSyncAt: row.last_sync_at,
        lastError: row.last_error || "",
        settings: row.settings_json || {},
      })),
    });
  } catch (error) {
    return next(error);
  }
});

integrationRouter.put("/connectors/:providerCode", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const providerCode = normalizeProvider(req.params.providerCode);
    if (!providerCode) return res.status(400).json({ message: "Provider invalido." });

    const isEnabled = Boolean(req.body?.isEnabled ?? true);
    const status = String(req.body?.status || (isEnabled ? "connected" : "disabled")).trim().toLowerCase();
    const allowedStatus = ["connected", "disabled", "error", "pending"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ message: "Status do conector invalido." });
    }

    const settings = typeof req.body?.settings === "object" && req.body?.settings ? req.body.settings : {};
    const lastError = String(req.body?.lastError || "").trim();
    const upsert = await query(
      `
      INSERT INTO integration_connectors (
        company_id, provider_code, is_enabled, status, settings_json, last_error, updated_by_user_id, updated_by_name, last_sync_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,NULL)
      ON CONFLICT (company_id, provider_code)
      DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        status = EXCLUDED.status,
        settings_json = EXCLUDED.settings_json,
        last_error = EXCLUDED.last_error,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_by_name = EXCLUDED.updated_by_name,
        updated_at = NOW()
      RETURNING id, provider_code, is_enabled, status, settings_json, last_sync_at, last_error
      `,
      [
        scope.companyId,
        providerCode,
        isEnabled,
        status,
        JSON.stringify(settings),
        lastError || null,
        Number(req.user?.sub) || null,
        req.user?.name || null,
      ],
    );

    const row = upsert.rows[0];
    return res.json({
      message: "Conector atualizado.",
      connector: {
        id: Number(row.id),
        providerCode: row.provider_code,
        isEnabled: Boolean(row.is_enabled),
        status: row.status,
        lastSyncAt: row.last_sync_at,
        lastError: row.last_error || "",
        settings: row.settings_json || {},
      },
    });
  } catch (error) {
    return next(error);
  }
});

integrationRouter.post("/transactions/import", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const providerCode = normalizeProvider(req.body?.providerCode);
    if (!providerCode) return res.status(400).json({ message: "Provider invalido." });
    const transactions = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
    if (transactions.length === 0) {
      return res.status(400).json({ message: "Informe transacoes para importar." });
    }
    if (transactions.length > 5000) {
      return res.status(400).json({ message: "Limite maximo de 5000 transacoes por importacao." });
    }

    const imported = await withTransaction(async (dbClient) => {
      const connectorResult = await dbClient.query(
        `
        INSERT INTO integration_connectors (
          company_id, provider_code, is_enabled, status, settings_json, updated_by_user_id, updated_by_name
        )
        VALUES ($1,$2,true,'connected','{}'::jsonb,$3,$4)
        ON CONFLICT (company_id, provider_code)
        DO UPDATE SET status = 'connected', updated_at = NOW()
        RETURNING id
        `,
        [scope.companyId, providerCode, Number(req.user?.sub) || null, req.user?.name || null],
      );
      const connectorId = Number(connectorResult.rows[0].id);

      let insertedCount = 0;
      for (const transaction of transactions) {
        const externalRef = String(transaction?.externalRef || "").trim();
        const amount = Number(transaction?.amount);
        const postedAt = String(transaction?.postedAt || "").slice(0, 10);
        const direction = String(transaction?.direction || "credit").toLowerCase();
        if (!externalRef || !Number.isFinite(amount) || !postedAt) continue;
        if (!["credit", "debit"].includes(direction)) continue;

        const insertResult = await dbClient.query(
          `
          INSERT INTO external_transactions (
            company_id, connector_id, external_ref, posted_at, amount, currency, direction, counterparty, description, raw_payload
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
          ON CONFLICT (company_id, external_ref)
          DO UPDATE SET
            posted_at = EXCLUDED.posted_at,
            amount = EXCLUDED.amount,
            currency = EXCLUDED.currency,
            direction = EXCLUDED.direction,
            counterparty = EXCLUDED.counterparty,
            description = EXCLUDED.description,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()
          RETURNING id
          `,
          [
            scope.companyId,
            connectorId,
            externalRef,
            postedAt,
            amount,
            String(transaction?.currency || "MZN").slice(0, 8),
            direction,
            String(transaction?.counterparty || "").trim() || null,
            String(transaction?.description || "").trim() || null,
            JSON.stringify(transaction || {}),
          ],
        );
        if (insertResult.rows[0]?.id) insertedCount += 1;
      }

      await dbClient.query(
        "UPDATE integration_connectors SET last_sync_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1",
        [connectorId],
      );

      return { connectorId, insertedCount };
    });

    return res.status(201).json({
      message: "Importacao concluida.",
      connectorId: imported.connectorId,
      importedCount: imported.insertedCount,
    });
  } catch (error) {
    return next(error);
  }
});

integrationRouter.post("/reconcile", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const providerCode = normalizeProvider(req.body?.providerCode);
    if (!providerCode) return res.status(400).json({ message: "Provider invalido." });
    const toleranceAmount = Number(req.body?.toleranceAmount ?? 1);

    const result = await withTransaction(async (dbClient) => {
      const connector = await dbClient.query(
        `
        SELECT id
        FROM integration_connectors
        WHERE company_id = $1 AND provider_code = $2
        LIMIT 1
        `,
        [scope.companyId, providerCode],
      );
      if (!connector.rows[0]?.id) {
        return { error: { status: 404, message: "Conector nao encontrado para a empresa." } };
      }
      const connectorId = Number(connector.rows[0].id);

      const run = await dbClient.query(
        `
        INSERT INTO reconciliation_runs (
          company_id, connector_id, started_at, status, started_by_user_id, started_by_name
        )
        VALUES ($1,$2,NOW(),'running',$3,$4)
        RETURNING id
        `,
        [scope.companyId, connectorId, Number(req.user?.sub) || null, req.user?.name || null],
      );
      const runId = Number(run.rows[0].id);

      const externalRows = await dbClient.query(
        `
        SELECT id, external_ref, amount, posted_at, direction
        FROM external_transactions
        WHERE company_id = $1
          AND connector_id = $2
          AND reconciled = false
          AND direction = 'credit'
        ORDER BY posted_at ASC, id ASC
        LIMIT 3000
        `,
        [scope.companyId, connectorId],
      );
      const repaymentRows = await dbClient.query(
        `
        SELECT id, receipt_no, amount_received, payment_date
        FROM loan_repayments
        WHERE company_id = $1
          AND id NOT IN (
            SELECT matched_loan_repayment_id
            FROM external_transactions
            WHERE company_id = $1
              AND matched_loan_repayment_id IS NOT NULL
          )
        ORDER BY payment_date ASC, id ASC
        LIMIT 3000
        `,
        [scope.companyId],
      );

      const matching = autoMatchTransactions(
        normalizeExternalTransactions(externalRows.rows),
        normalizeRepayments(repaymentRows.rows),
        toleranceAmount,
      );

      let totalMatchedAmount = 0;
      for (const item of matching.matches) {
        const matchExternal = externalRows.rows.find((row) => Number(row.id) === item.externalTransactionId);
        totalMatchedAmount += Number(matchExternal?.amount || 0);
        await dbClient.query(
          `
          UPDATE external_transactions
          SET
            reconciled = true,
            reconciled_at = NOW(),
            matched_loan_repayment_id = $2,
            reconciliation_run_id = $3,
            updated_at = NOW()
          WHERE id = $1
          `,
          [item.externalTransactionId, item.repaymentId, runId],
        );
      }

      await dbClient.query(
        `
        UPDATE reconciliation_runs
        SET
          finished_at = NOW(),
          status = 'completed',
          matched_count = $2,
          unmatched_count = $3,
          total_matched_amount = $4
        WHERE id = $1
        `,
        [runId, matching.matches.length, matching.unmatched.length, totalMatchedAmount],
      );

      await dbClient.query(
        "UPDATE integration_connectors SET last_sync_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1",
        [connectorId],
      );

      return {
        runId,
        matchedCount: matching.matches.length,
        unmatchedCount: matching.unmatched.length,
        totalMatchedAmount,
        matches: matching.matches,
      };
    });

    if (result.error) return res.status(result.error.status).json({ message: result.error.message });
    return res.json({
      message: "Conciliacao automatica concluida.",
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

