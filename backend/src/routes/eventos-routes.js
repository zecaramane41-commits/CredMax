import express from "express";
import { query } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";
import { eventBus, publishAppEvent } from "../services/event-bus.js";

export const eventosRouter = express.Router();

eventosRouter.use(requireAuth);

/**
 * Endpoint de Server-Sent Events (SSE) em Tempo Real
 * Permite que clientes conectados recebam atualizações instantâneas de eventos do sistema.
 */
eventosRouter.get("/stream", (req, res) => {
  const scope = resolveCompanyScope(req);
  const companyId = scope.companyId || (req.user?.companyId ?? null);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Envia evento inicial de conexão estabelecida
  const initialPayload = JSON.stringify({
    type: "CONNECTED",
    companyId,
    user: { id: req.user?.id, email: req.user?.email, role: req.user?.role },
    timestamp: new Date().toISOString(),
  });
  res.write(`data: ${initialPayload}\n\n`);

  // Listener para eventos da empresa
  const onEvent = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Ignora erro de escrita se cliente já desconectou
    }
  };

  const unsubscribe = eventBus.subscribe(companyId, onEvent);

  // Heartbeat a cada 25 segundos para manter a conexão ativa contra timeouts de proxy
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(heartbeatTimer);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeatTimer);
    unsubscribe();
    res.end();
  });
});

// Eventos criticos para auditoria
eventosRouter.get("/criticos", requireReadWrite("consultar.auditoria"), async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));

    const financialResult = await query(
      `
      SELECT
        e.id,
        COALESCE(e.created_at::date, e.payload->>'eventDate', CURRENT_DATE) AS event_date,
        e.event_type,
        l.contract_no,
        c.name AS client_name,
        e.amount,
        e.workflow_status,
        e.created_by_name
      FROM loan_financial_events e
      JOIN loans l ON l.id = e.loan_id
      JOIN clients c ON c.id = l.client_id
      WHERE e.company_id = $1
        AND e.event_type IN ('estorno', 'reestruturacao_contrato', 'liquidacao_antecipada')
      ORDER BY e.created_at DESC
      LIMIT $2
      `,
      [scope.companyId, limit],
    );

    const disbursementResult = await query(
      `
      SELECT
        e.id,
        e.entry_date,
        e.event_type,
        e.description,
        e.reference_id,
        COALESCE(SUM(l.credit), 0)::numeric(14,2) AS amount,
        e.created_by_name
      FROM accounting_entries e
      JOIN accounting_entry_lines l ON l.entry_id = e.id
      WHERE e.company_id = $1
        AND e.event_type IN ('desembolso', 'liquidacao_antecipada')
      GROUP BY e.id, e.entry_date, e.event_type, e.description, e.reference_id, e.created_by_name
      ORDER BY e.entry_date DESC
      LIMIT $2
      `,
      [scope.companyId, limit],
    );

    const typeLabel = (value) => {
      if (value === "estorno") return "Extorno";
      if (value === "reestruturacao_contrato") return "Reestruturação";
      if (value === "liquidacao_antecipada") return "Liquidação Antecipada";
      if (value === "desembolso") return "Desembolso";
      return value || "-";
    };

    const events = [];
    for (const row of financialResult.rows) {
      const eventType = String(row.event_type || "");
      events.push({
        id: `fe-${row.id}`,
        data: row.event_date instanceof Date ? row.event_date.toISOString() : String(row.event_date || ""),
        tipo: typeLabel(eventType),
        descricao: `${typeLabel(eventType)} — Contrato ${row.contract_no} / Cliente ${row.client_name || "-"} (${row.workflow_status})`,
        usuario: row.created_by_name || "-",
        severidade: eventType === "estorno" ? "Alta" : "Média",
      });
    }
    for (const row of disbursementResult.rows) {
      const amount = Number(row.amount || 0);
      events.push({
        id: `ac-${row.id}`,
        data: row.entry_date instanceof Date ? row.entry_date.toISOString() : String(row.entry_date || ""),
        tipo: typeLabel(row.event_type),
        descricao: row.description || "Desembolso contabilizado",
        usuario: row.created_by_name || "-",
        severidade: amount >= 50000 ? "Alta" : "Média",
      });
    }

    events.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    return res.json({ items: events.slice(0, limit) });
  } catch (error) {
    return next(error);
  }
});
