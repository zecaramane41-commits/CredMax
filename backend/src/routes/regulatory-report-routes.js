import crypto from "node:crypto";
import express from "express";
import { env } from "../config/env.js";
import { query } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";

export const regulatoryReportRouter = express.Router();
regulatoryReportRouter.use(requireAuth);
regulatoryReportRouter.use(requireReadWrite("visualizar.relatorios", "exportar.relatorios"));

const IVA_RATE = 0.16;

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function buildSignature({ companyId, reportCode, from, to, payload }) {
  const canonical = stableStringify({
    companyId: Number(companyId),
    reportCode,
    periodFrom: from,
    periodTo: to,
    payload,
  });
  return crypto.createHmac("sha256", String(env.jwtSecret)).update(canonical).digest("hex");
}

function mapFrequencyLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "diario") return "Diario";
  if (normalized === "semanal") return "Semanal";
  if (normalized === "quinzenal") return "Quinzenal";
  return "Mensal";
}

function classifyPurpose(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("comerc")) return "Comercio";
  if (normalized.includes("consumo")) return "Consumo";
  if (normalized.includes("agric")) return "Agricultura";
  if (normalized.includes("pecu")) return "Pecuaria";
  if (normalized.includes("indust")) return "Industria";
  if (normalized.includes("serv")) return "Servicos";
  return "Outros";
}

function detectBankMode(raw, from, to) {
  const mode = String(raw || "").trim().toLowerCase();
  if (mode === "mensal" || mode === "trimestral") return mode;
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const spanDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
  return spanDays <= 31 ? "mensal" : "trimestral";
}

async function loadCompany(companyId) {
  const res = await query(
    `
    SELECT
      c.name,
      c.legal_name,
      c.nuit,
      c.phone,
      c.email,
      c.address,
      to_jsonb(c)->>'province' AS province
    FROM companies c
    WHERE id = $1
    LIMIT 1
    `,
    [companyId],
  );
  const row = res.rows[0] || {};
  return {
    name: row.name || "Empresa",
    legalName: row.legal_name || row.name || "Empresa",
    nuit: row.nuit || "",
    phone: row.phone || "",
    email: row.email || "",
    address: row.address || "",
    province: row.province || "",
  };
}

async function buildBancoMensal(companyId, from, to) {
  const institution = await loadCompany(companyId);
  const res = await query(
    `
    WITH overdue AS (
      SELECT
        li.loan_id,
        COALESCE(MAX(CASE WHEN li.status <> 'paid' AND li.due_date < $3::date THEN ($3::date - li.due_date) ELSE 0 END), 0)::INT AS days_overdue,
        COALESCE(SUM(CASE
          WHEN li.status <> 'paid' AND li.due_date < $3::date
          THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
          ELSE 0 END), 0)::NUMERIC AS overdue_amount
      FROM loan_installments li
      GROUP BY li.loan_id
    ),
    next_inst AS (
      SELECT li.loan_id, COALESCE(MIN(li.payment_amount) FILTER (WHERE li.status <> 'paid'), 0)::NUMERIC AS installment_amount
      FROM loan_installments li
      GROUP BY li.loan_id
    )
    SELECT
      l.contract_no,
      c.name AS client_name,
      l.disbursed_on,
      l.principal,
      l.product,
      l.payment_frequency,
      l.maturity_on,
      l.interest_rate,
      l.balance,
      COALESCE(o.days_overdue, 0)::INT AS days_overdue,
      COALESCE(o.overdue_amount, 0)::NUMERIC AS overdue_amount,
      COALESCE(n.installment_amount, 0)::NUMERIC AS installment_amount
    FROM loans l
    JOIN clients c ON c.id = l.client_id
    LEFT JOIN overdue o ON o.loan_id = l.id
    LEFT JOIN next_inst n ON n.loan_id = l.id
    WHERE l.company_id = $1
      AND l.disbursement_status = 'disbursed'
      AND l.disbursed_on <= $3::date
      AND (l.disbursed_on BETWEEN $2::date AND $3::date OR l.balance > 0 OR COALESCE(o.overdue_amount, 0) > 0)
    ORDER BY l.contract_no ASC
    `,
    [companyId, from, to],
  );

  const rows = res.rows.map((row) => ({
    operacaoNo: row.contract_no,
    nomeCliente: row.client_name,
    dataDesembolso: row.disbursed_on,
    montanteDesembolsoMt: round2(row.principal),
    finalidadeCredito: classifyPurpose(row.product),
    valorPrestacaoMt: round2(row.installment_amount),
    periodicidadePagamentos: mapFrequencyLabel(row.payment_frequency),
    prazoReembolso: row.maturity_on,
    taxaJuroPercent: round2(row.interest_rate),
    creditoEmDividaMt: round2(row.balance),
    creditoEmAtrasoMt: round2(row.overdue_amount),
    diasEmAtraso: Number(row.days_overdue || 0),
    ppes: 0,
  }));

  const summary = rows.reduce(
    (acc, item) => {
      acc.totalOperacoes += 1;
      acc.totalDesembolsadoMt += item.montanteDesembolsoMt;
      acc.totalCarteiraMt += item.creditoEmDividaMt;
      acc.totalAtrasoMt += item.creditoEmAtrasoMt;
      acc.maxDiasAtraso = Math.max(acc.maxDiasAtraso, item.diasEmAtraso);
      return acc;
    },
    { totalOperacoes: 0, totalDesembolsadoMt: 0, totalCarteiraMt: 0, totalAtrasoMt: 0, maxDiasAtraso: 0 },
  );

  return {
    reportName: "Mapa Oficial - Banco de Mocambique (Mensal)",
    authority: "Banco de Mocambique",
    layoutVersion: "BM-MAPA-MENSAL-2026.1",
    templateVariant: "banco_mensal",
    bankReportType: "mensal",
    institution,
    columns: [
      { key: "operacaoNo", label: "No da Operacao (1)" },
      { key: "nomeCliente", label: "Nome do Cliente (2)" },
      { key: "dataDesembolso", label: "Data de Desembolso (3)" },
      { key: "montanteDesembolsoMt", label: "Montante do Desembolso (4)" },
      { key: "finalidadeCredito", label: "Finalidade do Credito (5)" },
      { key: "valorPrestacaoMt", label: "Valor da Prestacao (6)" },
      { key: "periodicidadePagamentos", label: "Periodicidade dos Pagamentos (7)" },
      { key: "prazoReembolso", label: "Prazo de Reembolso (8)" },
      { key: "taxaJuroPercent", label: "Taxa de Juro (9)" },
      { key: "creditoEmDividaMt", label: "Credito em Divida (10)" },
      { key: "creditoEmAtrasoMt", label: "Credito em Atraso (11)" },
      { key: "diasEmAtraso", label: "Dias em Atraso (12)" },
      { key: "ppes", label: "PPEs (13)" },
    ],
    rows,
    summary: {
      totalOperacoes: summary.totalOperacoes,
      totalDesembolsadoMt: round2(summary.totalDesembolsadoMt),
      totalCarteiraMt: round2(summary.totalCarteiraMt),
      totalAtrasoMt: round2(summary.totalAtrasoMt),
      maxDiasAtraso: summary.maxDiasAtraso,
    },
  };
}

async function buildBancoTrimestral(companyId, from, to) {
  const institution = await loadCompany(companyId);

  const disbursementRes = await query(
    `
    SELECT contract_no, principal, interest_rate, product
    FROM loans
    WHERE company_id = $1
      AND disbursement_status = 'disbursed'
      AND disbursed_on BETWEEN $2::date AND $3::date
    ORDER BY disbursed_on ASC, contract_no ASC
    `,
    [companyId, from, to],
  );
  const repaymentRes = await query(
    `
    SELECT
      COUNT(*)::INT AS repayment_count,
      COUNT(DISTINCT COALESCE(loan_id, 0))::INT AS reimbursed_contracts,
      COALESCE(SUM(principal_applied), 0)::NUMERIC AS principal_total,
      COALESCE(SUM(interest_applied), 0)::NUMERIC AS interest_total,
      COALESCE(SUM(amount_applied), 0)::NUMERIC AS applied_total
    FROM loan_repayments
    WHERE company_id = $1
      AND payment_date BETWEEN $2::date AND $3::date
    `,
    [companyId, from, to],
  );
  const abatRes = await query(
    `
    SELECT COALESCE(SUM(amount), 0)::NUMERIC AS total_amount
    FROM loan_financial_events
    WHERE company_id = $1
      AND workflow_status = 'executed'
      AND event_type = 'abatimento'
      AND created_at::date BETWEEN $2::date AND $3::date
    `,
    [companyId, from, to],
  );
  const portfolioRes = await query(
    `
    WITH inst AS (
      SELECT
        l.id AS loan_id,
        c.id AS client_id,
        COALESCE(NULLIF(LOWER(BTRIM(c.gender)), ''), 'outros') AS gender,
        GREATEST(0, COALESCE(li.principal_amount, 0) - COALESCE(li.principal_paid_amount, 0)) AS principal_remaining,
        GREATEST(0, COALESCE(li.interest_amount, 0) - COALESCE(li.interest_paid_amount, 0)) AS interest_remaining,
        CASE WHEN li.due_date < $2::date THEN ($2::date - li.due_date) ELSE 0 END AS days_late
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      LEFT JOIN loan_installments li ON li.loan_id = l.id
      WHERE l.company_id = $1
        AND l.disbursement_status = 'disbursed'
        AND l.disbursed_on <= $2::date
        AND l.balance > 0
    )
    SELECT
      COALESCE(SUM(principal_remaining), 0)::NUMERIC AS carteira_principal,
      COALESCE(SUM(interest_remaining), 0)::NUMERIC AS carteira_juros,
      COALESCE(SUM(CASE WHEN days_late > 0 THEN principal_remaining ELSE 0 END), 0)::NUMERIC AS risco_principal,
      COALESCE(SUM(CASE WHEN days_late > 0 THEN interest_remaining ELSE 0 END), 0)::NUMERIC AS risco_juros,
      COUNT(DISTINCT loan_id)::INT AS active_contracts,
      COUNT(DISTINCT client_id)::INT AS active_clients,
      COUNT(DISTINCT CASE WHEN gender LIKE 'm%' THEN client_id END)::INT AS male_clients,
      COUNT(DISTINCT CASE WHEN gender LIKE 'f%' THEN client_id END)::INT AS female_clients
    FROM inst
    `,
    [companyId, to],
  );

  const disRows = disbursementRes.rows.map((row) => ({
    principalMt: round2(row.principal),
    interestRatePercent: round2(row.interest_rate),
    purpose: classifyPurpose(row.product),
  }));
  const rep = repaymentRes.rows[0] || {};
  const abat = abatRes.rows[0] || {};
  const portfolio = portfolioRes.rows[0] || {};

  const disbursedPrincipal = round2(disRows.reduce((sum, row) => sum + row.principalMt, 0));
  const repaidPrincipal = round2(rep.principal_total);
  const repaidInterest = round2(rep.interest_total);
  const abatidoPrincipal = round2(abat.total_amount);
  const carteiraPrincipal = round2(portfolio.carteira_principal);
  const carteiraJuros = round2(portfolio.carteira_juros);
  const riscoPrincipal = round2(portfolio.risco_principal);
  const riscoJuros = round2(portfolio.risco_juros);

  const rows = [
    { indicador: "Montante de creditos concedidos no periodo", capitalMt: disbursedPrincipal, juroMt: 0, totalMt: disbursedPrincipal },
    { indicador: "Montante de creditos reembolsados no periodo", capitalMt: repaidPrincipal, juroMt: repaidInterest, totalMt: round2(repaidPrincipal + repaidInterest) },
    { indicador: "Montante de creditos abatidos no periodo", capitalMt: abatidoPrincipal, juroMt: 0, totalMt: abatidoPrincipal },
    { indicador: "Montante da carteira de credito activa/vigente", capitalMt: carteiraPrincipal, juroMt: carteiraJuros, totalMt: round2(carteiraPrincipal + carteiraJuros) },
    { indicador: "Montante da carteira em risco", capitalMt: riscoPrincipal, juroMt: riscoJuros, totalMt: round2(riscoPrincipal + riscoJuros) },
  ];

  return {
    reportName: "Mapa Oficial - Banco de Mocambique (Trimestral)",
    authority: "Banco de Mocambique",
    layoutVersion: "BM-MAPA-TRIMESTRAL-2026.1",
    templateVariant: "banco_trimestral",
    bankReportType: "trimestral",
    institution,
    columns: [
      { key: "indicador", label: "2.1.1 Volume de creditos - MZN" },
      { key: "capitalMt", label: "Capital" },
      { key: "juroMt", label: "Juro" },
      { key: "totalMt", label: "Total" },
    ],
    rows,
    summary: {
      numeroCreditosConcedidos: disRows.length,
      numeroCreditosReembolsados: Number(rep.reimbursed_contracts || 0),
      clientesAtivos: Number(portfolio.active_clients || 0),
      clientesHomens: Number(portfolio.male_clients || 0),
      clientesMulheres: Number(portfolio.female_clients || 0),
      totalCarteiraVigenteMt: round2(carteiraPrincipal + carteiraJuros),
      totalCarteiraRiscoMt: round2(riscoPrincipal + riscoJuros),
      totalReembolsosAplicadosMt: round2(rep.applied_total),
      totalAbatimentosMt: abatidoPrincipal,
      totalOperacoesReembolso: Number(rep.repayment_count || 0),
      totalContratosAtivos: Number(portfolio.active_contracts || 0),
    },
  };
}

async function buildBancoCentralPayload(companyId, from, to, options = {}) {
  const mode = detectBankMode(options.bankReportType, from, to);
  return mode === "mensal"
    ? buildBancoMensal(companyId, from, to)
    : buildBancoTrimestral(companyId, from, to);
}

async function buildCrcPayload(companyId, from, to) {
  const result = await query(
    `
    WITH loan_base AS (
      SELECT
        c.id AS client_id,
        c.name AS client_name,
        c.nuit AS client_nuit,
        l.contract_no,
        l.principal,
        l.balance,
        l.disbursed_on,
        COALESCE(dl.days_overdue, 0)::INT AS days_overdue
      FROM clients c
      JOIN loans l ON l.client_id = c.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(MAX(CASE WHEN li.status <> 'paid' AND li.due_date < CURRENT_DATE THEN (CURRENT_DATE - li.due_date) ELSE 0 END), 0)::INT AS days_overdue
        FROM loan_installments li
        WHERE li.loan_id = l.id
      ) dl ON TRUE
      WHERE c.company_id = $1
        AND l.company_id = $1
        AND l.disbursement_status = 'disbursed'
        AND l.disbursed_on <= $3::date
        AND (l.balance > 0 OR l.disbursed_on BETWEEN $2::date AND $3::date)
    )
    SELECT
      client_id,
      client_name,
      client_nuit,
      COUNT(*)::INT AS contratos,
      COALESCE(SUM(principal), 0)::numeric(14,2) AS principal_total,
      COALESCE(SUM(balance), 0)::numeric(14,2) AS saldo_total,
      COALESCE(MAX(days_overdue), 0)::INT AS max_days_overdue
    FROM loan_base
    GROUP BY client_id, client_name, client_nuit
    ORDER BY saldo_total DESC, client_name ASC
    `,
    [companyId, from, to],
  );

  const rows = result.rows.map((row) => {
    const maxDays = Number(row.max_days_overdue || 0);
    return {
      clientId: Number(row.client_id),
      cliente: row.client_name,
      nuit: row.client_nuit,
      contratosAtivos: Number(row.contratos || 0),
      principalTotalMt: Number(row.principal_total || 0),
      exposicaoAtualMt: Number(row.saldo_total || 0),
      maxDiasAtraso: maxDays,
      classeRisco: maxDays > 90 ? "E" : maxDays > 60 ? "D" : maxDays > 30 ? "C" : maxDays > 0 ? "B" : "A",
    };
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc.clientesReportados += 1;
      acc.exposicaoTotalMt += row.exposicaoAtualMt;
      if (row.maxDiasAtraso > 0) acc.clientesComAtraso += 1;
      return acc;
    },
    { clientesReportados: 0, exposicaoTotalMt: 0, clientesComAtraso: 0 },
  );

  return {
    reportName: "Arquivo Oficial CRC",
    authority: "CRC",
    layoutVersion: "CRC-OFICIAL-2026.1",
    columns: [
      { key: "clientId", label: "ID Cliente" },
      { key: "cliente", label: "Cliente" },
      { key: "nuit", label: "NUIT" },
      { key: "contratosAtivos", label: "Contratos" },
      { key: "principalTotalMt", label: "Principal (MT)" },
      { key: "exposicaoAtualMt", label: "Exposicao (MT)" },
      { key: "maxDiasAtraso", label: "Max. Dias Atraso" },
      { key: "classeRisco", label: "Classe Risco" },
    ],
    rows,
    summary: {
      clientesReportados: summary.clientesReportados,
      exposicaoTotalMt: round2(summary.exposicaoTotalMt),
      clientesComAtraso: summary.clientesComAtraso,
    },
  };
}

async function buildFiscalPayload(companyId, from, to) {
  const institution = await loadCompany(companyId);

  const reimbursementsRes = await query(
    `
    SELECT
      lr.id,
      lr.receipt_no,
      lr.payment_date,
      lr.amount_applied,
      lr.principal_applied,
      lr.interest_applied,
      lr.mora_applied,
      c.name AS client_name,
      c.nuit AS client_nuit,
      l.contract_no,
      l.product,
      l.interest_rate
    FROM loan_repayments lr
    JOIN clients c ON c.id = lr.client_id
    LEFT JOIN loans l ON l.id = lr.loan_id
    WHERE lr.company_id = $1
      AND lr.payment_date BETWEEN $2::date AND $3::date
    ORDER BY lr.payment_date ASC, lr.id ASC
    `,
    [companyId, from, to],
  );
  const disbursementRes = await query(
    `
    SELECT l.contract_no, l.disbursed_on, l.principal, l.product, l.interest_rate, c.name AS client_name, c.nuit AS client_nuit
    FROM loans l
    JOIN clients c ON c.id = l.client_id
    WHERE l.company_id = $1
      AND l.disbursement_status = 'disbursed'
      AND l.disbursed_on BETWEEN $2::date AND $3::date
    ORDER BY l.disbursed_on ASC, l.contract_no ASC
    `,
    [companyId, from, to],
  );
  const eventRes = await query(
    `
    SELECT event_type, COUNT(*)::INT AS total_events, COALESCE(SUM(amount), 0)::NUMERIC AS total_amount
    FROM loan_financial_events
    WHERE company_id = $1
      AND workflow_status = 'executed'
      AND created_at::date BETWEEN $2::date AND $3::date
      AND event_type IN ('capitalizacao', 'perdao_mora', 'abatimento', 'estorno')
    GROUP BY event_type
    ORDER BY event_type ASC
    `,
    [companyId, from, to],
  );
  const newClientsRes = await query(
    `
    SELECT id, name, nuit, created_at::date AS created_on
    FROM clients
    WHERE company_id = $1
      AND created_at::date BETWEEN $2::date AND $3::date
    ORDER BY created_at ASC, id ASC
    `,
    [companyId, from, to],
  );

  const reimbursementRows = reimbursementsRes.rows.map((row) => {
    const jurosMt = round2(row.interest_applied);
    return {
      recibo: row.receipt_no || `RC-${row.id}`,
      dataPagamento: row.payment_date,
      contrato: row.contract_no || "-",
      cliente: row.client_name,
      nuit: row.client_nuit || "-",
      finalidade: classifyPurpose(row.product),
      taxaJuroPercent: round2(row.interest_rate),
      valorAplicadoMt: round2(row.amount_applied),
      principalMt: round2(row.principal_applied),
      jurosMt,
      moraMt: round2(row.mora_applied),
      ivaEstimadoMt: round2(jurosMt * IVA_RATE),
    };
  });
  const disbursementRows = disbursementRes.rows.map((row) => ({
    contrato: row.contract_no,
    cliente: row.client_name,
    nuit: row.client_nuit || "-",
    dataDesembolso: row.disbursed_on,
    valorDesembolsoMt: round2(row.principal),
    finalidade: classifyPurpose(row.product),
    taxaJuroPercent: round2(row.interest_rate),
  }));
  const financialEventRows = eventRes.rows.map((row) => ({
    eventType: row.event_type,
    totalEventos: Number(row.total_events || 0),
    totalMontanteMt: round2(row.total_amount),
  }));
  const newClientRows = newClientsRes.rows.map((row) => ({
    id: Number(row.id || 0),
    nome: row.name,
    nuit: row.nuit || "-",
    dataCadastro: row.created_on,
  }));

  const jurosReembolsadosMt = round2(reimbursementRows.reduce((sum, item) => sum + item.jurosMt, 0));
  const principalReembolsadoMt = round2(reimbursementRows.reduce((sum, item) => sum + item.principalMt, 0));
  const moraReembolsadaMt = round2(reimbursementRows.reduce((sum, item) => sum + item.moraMt, 0));
  const totalReembolsadoMt = round2(reimbursementRows.reduce((sum, item) => sum + item.valorAplicadoMt, 0));
  const totalDesembolsadoMt = round2(disbursementRows.reduce((sum, item) => sum + item.valorDesembolsoMt, 0));

  const campo01 = jurosReembolsadosMt;
  const campo02 = round2(campo01 * IVA_RATE);
  const campo03 = 0;
  const campo04 = 0;
  const campo05 = 0;
  const campo06 = 0;
  const campo07 = 0;
  const campo08 = 0;
  const campo09 = 0;
  const campo10 = 0;
  const campo11 = 0;
  const campo12 = 0;
  const campo13 = 0;
  const campo14 = round2(campo01 + campo03 + campo05 + campo06 + campo07);
  const campo15 = round2(campo08 + campo09 + campo10 + campo11 + campo12);
  const campo16 = round2(campo02 + campo04 + campo13);
  const campo17 = round2(Math.max(0, campo16 - campo15));
  const campo18 = round2(Math.max(0, campo15 - campo16));
  const campo22 = campo17;
  const campo24 = campo22;
  const campo26 = campo18;
  const campo27 = 0;

  const rows = [
    { campo: "01", tipoOperacao: "Servicos tributaveis a 16% (juros recebidos)", baseTributavelMt: campo01, impostoFavorSujeitoPassivoMt: 0, impostoFavorEstadoMt: campo02 },
    { campo: "03", tipoOperacao: "Operacoes tributaveis a 5%", baseTributavelMt: campo03, impostoFavorSujeitoPassivoMt: 0, impostoFavorEstadoMt: campo04 },
    { campo: "05", tipoOperacao: "Vendas isentas com deducao", baseTributavelMt: campo05, impostoFavorSujeitoPassivoMt: 0, impostoFavorEstadoMt: 0 },
    { campo: "06", tipoOperacao: "Operacoes isentas art. 18", baseTributavelMt: campo06, impostoFavorSujeitoPassivoMt: 0, impostoFavorEstadoMt: 0 },
    { campo: "07", tipoOperacao: "Operacoes sem deducao", baseTributavelMt: campo07, impostoFavorSujeitoPassivoMt: 0, impostoFavorEstadoMt: 0 },
    { campo: "08", tipoOperacao: "Imposto dedutivel imobilizado", baseTributavelMt: 0, impostoFavorSujeitoPassivoMt: campo08, impostoFavorEstadoMt: 0 },
    { campo: "09", tipoOperacao: "Imposto dedutivel existencias", baseTributavelMt: 0, impostoFavorSujeitoPassivoMt: campo09, impostoFavorEstadoMt: 0 },
    { campo: "10", tipoOperacao: "Imposto dedutivel outros bens/servicos", baseTributavelMt: 0, impostoFavorSujeitoPassivoMt: campo10, impostoFavorEstadoMt: 0 },
    { campo: "11", tipoOperacao: "Imposto dedutivel importacoes", baseTributavelMt: 0, impostoFavorSujeitoPassivoMt: campo11, impostoFavorEstadoMt: 0 },
    { campo: "12", tipoOperacao: "Regularizacoes", baseTributavelMt: 0, impostoFavorSujeitoPassivoMt: campo12, impostoFavorEstadoMt: campo13 },
  ];

  return {
    reportName: "Declaracao Periodica IVA (Modelo A)",
    authority: "Autoridade Tributaria de Mocambique",
    layoutVersion: "AT-IVA-MODELO-A-2026.1",
    templateVariant: "iva_modelo_a",
    institution,
    columns: [
      { key: "campo", label: "Campo" },
      { key: "tipoOperacao", label: "Tipo de Operacao" },
      { key: "baseTributavelMt", label: "Base Tributavel (MT)" },
      { key: "impostoFavorSujeitoPassivoMt", label: "Imposto a Favor do Sujeito Passivo (MT)" },
      { key: "impostoFavorEstadoMt", label: "Imposto a Favor do Estado (MT)" },
    ],
    rows,
    summary: {
      ivaRatePercent: round2(IVA_RATE * 100),
      campo14BaseTributavelTotalMt: campo14,
      campo15ImpostoFavorSujeitoPassivoMt: campo15,
      campo16ImpostoFavorEstadoMt: campo16,
      campo17ImpostoApagarMt: campo17,
      campo18CreditoMt: campo18,
      campo22IvaPagarMt: campo22,
      campo24TotalApagarMt: campo24,
      campo26CreditoReportarMt: campo26,
      campo27PedidoReembolsoMt: campo27,
      jurosReembolsadosPeriodoMt: jurosReembolsadosMt,
      principalReembolsadoPeriodoMt: principalReembolsadoMt,
      moraReembolsadaPeriodoMt: moraReembolsadaMt,
      totalReembolsadoPeriodoMt: totalReembolsadoMt,
      totalDesembolsadoPeriodoMt: totalDesembolsadoMt,
      totalOperacoesDesembolso: disbursementRows.length,
      totalOperacoesReembolso: reimbursementRows.length,
      totalNovosClientes: newClientRows.length,
    },
    details: {
      ivaFields: { campo01, campo02, campo03, campo04, campo05, campo06, campo07, campo08, campo09, campo10, campo11, campo12, campo13, campo14, campo15, campo16, campo17, campo18, campo22, campo24, campo26, campo27 },
      reimbursementRows,
      disbursementRows,
      financialEventRows,
      newClientRows,
    },
  };
}

async function buildPayload(reportCode, companyId, from, to, options = {}) {
  if (reportCode === "banco_central") return buildBancoCentralPayload(companyId, from, to, options);
  if (reportCode === "crc") return buildCrcPayload(companyId, from, to);
  if (reportCode === "fiscal") return buildFiscalPayload(companyId, from, to);
  return null;
}

function parsePeriod(req, res) {
  const from = parseIsoDate(req.query.from || req.body?.from);
  const to = parseIsoDate(req.query.to || req.body?.to);
  if (!from || !to) {
    res.status(400).json({ message: "Periodo invalido. Informe from e to em YYYY-MM-DD." });
    return null;
  }
  if (from > to) {
    res.status(400).json({ message: "Periodo invalido: data inicial maior que data final." });
    return null;
  }
  return { from, to };
}

function parseReportOptions(req) {
  const bankReportType = String(
    req.query.bankReportType
      || req.query.bankMode
      || req.query.mode
      || req.body?.bankReportType
      || req.body?.bankMode
      || req.body?.mode
      || "",
  ).trim().toLowerCase();
  return { bankReportType };
}

regulatoryReportRouter.get("/regulatory/:reportCode", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para emitir relatorio." });
    const reportCode = String(req.params.reportCode || "").trim().toLowerCase();
    if (!["banco_central", "crc", "fiscal"].includes(reportCode)) {
      return res.status(400).json({ message: "Codigo de relatorio regulatorio invalido." });
    }
    const period = parsePeriod(req, res);
    if (!period) return;
    const options = parseReportOptions(req);

    const existingClosure = await query(
      `
      SELECT id, payload_json, signature_algo, signature_value, closed_by_user_id, closed_by_name, closed_at
      FROM regulatory_report_closures
      WHERE company_id = $1
        AND report_code = $2
        AND period_from = $3::date
        AND period_to = $4::date
      LIMIT 1
      `,
      [scope.companyId, reportCode, period.from, period.to],
    );

    let payload;
    let signature;
    if (existingClosure.rows[0]) {
      const closure = existingClosure.rows[0];
      payload = closure.payload_json;
      signature = {
        status: "closed",
        closureId: Number(closure.id),
        algorithm: closure.signature_algo,
        value: closure.signature_value,
        closedAt: closure.closed_at,
        closedByUserId: closure.closed_by_user_id ? Number(closure.closed_by_user_id) : null,
        closedByName: closure.closed_by_name || "Sistema",
      };
    } else {
      payload = await buildPayload(reportCode, scope.companyId, period.from, period.to, options);
      signature = {
        status: "draft",
        algorithm: "HMAC-SHA256",
        value: buildSignature({ companyId: scope.companyId, reportCode, from: period.from, to: period.to, payload }),
      };
    }

    return res.json({
      reportCode,
      period: { from: period.from, to: period.to },
      generatedAt: new Date().toISOString(),
      ...payload,
      signature,
    });
  } catch (error) {
    return next(error);
  }
});

regulatoryReportRouter.post("/regulatory/:reportCode/close", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para fechar relatorio." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (role !== "admin") return res.status(403).json({ message: "Apenas admin pode fechar relatorios regulatorios." });
    const reportCode = String(req.params.reportCode || "").trim().toLowerCase();
    if (!["banco_central", "crc", "fiscal"].includes(reportCode)) {
      return res.status(400).json({ message: "Codigo de relatorio regulatorio invalido." });
    }
    const period = parsePeriod(req, res);
    if (!period) return;
    const options = parseReportOptions(req);

    const payload = await buildPayload(reportCode, scope.companyId, period.from, period.to, options);
    const signatureValue = buildSignature({
      companyId: scope.companyId,
      reportCode,
      from: period.from,
      to: period.to,
      payload,
    });

    const inserted = await query(
      `
      INSERT INTO regulatory_report_closures (
        company_id, report_code, period_from, period_to, payload_json, signature_algo, signature_value, closed_by_user_id, closed_by_name
      )
      VALUES ($1,$2,$3::date,$4::date,$5::jsonb,'HMAC-SHA256',$6,$7,$8)
      ON CONFLICT (company_id, report_code, period_from, period_to) DO NOTHING
      RETURNING id, signature_algo, signature_value, closed_by_user_id, closed_by_name, closed_at
      `,
      [
        scope.companyId,
        reportCode,
        period.from,
        period.to,
        JSON.stringify(payload),
        signatureValue,
        Number(req.user?.sub) || null,
        String(req.user?.name || "").trim() || "Sistema",
      ],
    );

    if (!inserted.rows[0]) {
      return res.status(409).json({ message: "Este periodo ja esta fechado para este relatorio." });
    }
    const row = inserted.rows[0];
    return res.status(201).json({
      message: "Relatorio fechado e assinado digitalmente com sucesso.",
      reportCode,
      period: { from: period.from, to: period.to },
      ...payload,
      signature: {
        status: "closed",
        closureId: Number(row.id),
        algorithm: row.signature_algo,
        value: row.signature_value,
        closedAt: row.closed_at,
        closedByUserId: row.closed_by_user_id ? Number(row.closed_by_user_id) : null,
        closedByName: row.closed_by_name || "Sistema",
      },
    });
  } catch (error) {
    return next(error);
  }
});

regulatoryReportRouter.get("/regulatory/:reportCode/closures", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar fechamentos." });
    const reportCode = String(req.params.reportCode || "").trim().toLowerCase();
    if (!["banco_central", "crc", "fiscal"].includes(reportCode)) {
      return res.status(400).json({ message: "Codigo de relatorio regulatorio invalido." });
    }
    const result = await query(
      `
      SELECT id, period_from, period_to, signature_algo, signature_value, closed_by_user_id, closed_by_name, closed_at
      FROM regulatory_report_closures
      WHERE company_id = $1
        AND report_code = $2
      ORDER BY period_from DESC, period_to DESC, closed_at DESC
      LIMIT 50
      `,
      [scope.companyId, reportCode],
    );
    return res.json({
      reportCode,
      closures: result.rows.map((row) => ({
        id: Number(row.id),
        periodFrom: row.period_from,
        periodTo: row.period_to,
        algorithm: row.signature_algo,
        signatureValue: row.signature_value,
        closedByUserId: row.closed_by_user_id ? Number(row.closed_by_user_id) : null,
        closedByName: row.closed_by_name || "Sistema",
        closedAt: row.closed_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

regulatoryReportRouter.get("/regulatory/closures/:id/verify", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para verificar assinatura." });
    const closureId = Number(req.params.id);
    if (!Number.isInteger(closureId) || closureId <= 0) return res.status(400).json({ message: "ID de fechamento invalido." });
    const result = await query(
      `
      SELECT id, company_id, report_code, period_from, period_to, payload_json, signature_algo, signature_value, closed_at, closed_by_name
      FROM regulatory_report_closures
      WHERE id = $1
        AND company_id = $2
      LIMIT 1
      `,
      [closureId, scope.companyId],
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: "Fechamento nao encontrado." });
    const expected = buildSignature({
      companyId: Number(row.company_id),
      reportCode: row.report_code,
      from: row.period_from,
      to: row.period_to,
      payload: row.payload_json,
    });
    const valid = String(expected) === String(row.signature_value || "");
    return res.json({
      closureId: Number(row.id),
      reportCode: row.report_code,
      period: { from: row.period_from, to: row.period_to },
      algorithm: row.signature_algo,
      signatureValue: row.signature_value,
      expectedSignatureValue: expected,
      valid,
      closedAt: row.closed_at,
      closedByName: row.closed_by_name || "Sistema",
    });
  } catch (error) {
    return next(error);
  }
});
