import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertTriangle, ArrowDown, ArrowUp, Calendar, CheckCircle2, Download, FileSignature, Lock, ShieldCheck, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { downloadTextFile, toCsv } from "../../lib/download";
import { openCorporatePrintWindow } from "../../lib/print";
import { formatCurrencyMT } from "../../lib/format";

type RegulatoryReport = {
  reportCode: "banco_central" | "crc" | "fiscal";
  period: { from: string; to: string };
  generatedAt: string;
  reportName: string;
  authority: string;
  layoutVersion: string;
  templateVariant?: "banco_mensal" | "banco_trimestral" | "iva_modelo_a" | string;
  bankReportType?: "mensal" | "trimestral" | string;
  institution?: {
    name?: string;
    legalName?: string;
    nuit?: string;
    phone?: string;
    email?: string;
    address?: string;
    province?: string;
  } | null;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  details?: {
    ivaFields?: Record<string, unknown>;
    reimbursementRows?: Array<Record<string, unknown>>;
    disbursementRows?: Array<Record<string, unknown>>;
    financialEventRows?: Array<Record<string, unknown>>;
    newClientRows?: Array<Record<string, unknown>>;
  } | null;
  signature: {
    status: "draft" | "closed";
    closureId?: number;
    algorithm: string;
    value: string;
    closedAt?: string;
    closedByName?: string;
  };
};

type ClosureItem = {
  id: number;
  periodFrom: string;
  periodTo: string;
  algorithm: string;
  signatureValue: string;
  closedByName: string;
  closedAt: string;
};

const REGULATORY_REPORTS: Array<{
  code: RegulatoryReport["reportCode"];
  name: string;
  authority: string;
  description: string;
}> = [
  {
    code: "banco_central",
    name: "Banco Central - Mapa Oficial",
    authority: "Banco Central",
    description: "Carteira regulatoria oficial por periodo, com buckets e indicadores prudenciais basicos.",
  },
  {
    code: "crc",
    name: "CRC - Central de Risco",
    authority: "CRC",
    description: "Posicao consolidada de exposicao por cliente para reporte oficial a Central de Risco.",
  },
  {
    code: "fiscal",
    name: "Fiscal - Declaracao Oficial",
    authority: "Fiscal",
    description: "Movimentos contabeis por periodo com apuramento fiscal e assinatura digital de fechamento.",
  },
];

function firstDayOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatCell(value: unknown) {
  if (typeof value === "number") return Number(value).toLocaleString("pt-PT");
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default function ReportsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const initialCode = searchParams.get("code");
  const [activeTab, setActiveTab] = useState<"regulatory" | "operational" | "financial">(
    initialTab === "operational" || initialTab === "financial" ? initialTab : "regulatory",
  );
  const [selectedCode, setSelectedCode] = useState<RegulatoryReport["reportCode"]>(
    initialCode === "crc" || initialCode === "fiscal" ? initialCode : "banco_central",
  );
  const [bankReportType, setBankReportType] = useState<"mensal" | "trimestral">("mensal");
  const [fromDate, setFromDate] = useState(firstDayOfCurrentMonth());
  const [toDate, setToDate] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [report, setReport] = useState<RegulatoryReport | null>(null);
  const [closures, setClosures] = useState<ClosureItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentUser = getUser();
  const canClose = currentUser?.role === "admin";
  const selectedMeta = useMemo(() => REGULATORY_REPORTS.find((item) => item.code === selectedCode) || REGULATORY_REPORTS[0], [selectedCode]);

  // Operational reports state
  const [operationalData, setOperationalData] = useState({
    loaded: false,
    totalDisbursed: 0,
    totalReimbursed: 0,
    activeLoans: 0,
    newClients: 0,
    disbursementsByPeriod: [] as Array<{ period: string; amount: number; count: number }>,
    reimbursementsByPeriod: [] as Array<{ period: string; amount: number; count: number }>,
    financialEvents: [] as Array<{ type: string; count: number; totalAmount: number; averageAmount: number }>,
    clientActivity: [] as Array<{ name: string; nuit: string; contracts: number; balance: number; daysOverdue: number }>,
  });
  const [loadingOperational, setLoadingOperational] = useState(false);

  // Financial reports state
  const [financialData, setFinancialData] = useState({
    loaded: false,
    portfolioBalance: 0,
    initialCapital: 0,
    reinforcements: 0,
    recoveryRate: 0,
    growthRate: 0,
    cashIn: 0,
    cashOut: 0,
    netCashFlow: 0,
    par30: 0,
    npl90: 0,
    delinquencyRate: 0,
    portfolioHealth: 0,
    agingDistribution: [] as Array<{ label: string; percentage: number; color: string }>,
    monthlyCashFlow: [] as Array<{ month: string; disbursed: number; reimbursed: number; expenses: number; netFlow: number; projectedBalance: number }>,
    managerPerformance: [] as Array<{ manager: string; contracts: number; clients: number; portfolio: number; recovered: number; par30: number; recoveryRate: number }>,
  });
  const [loadingFinancial, setLoadingFinancial] = useState(false);

  const loadClosures = async (reportCode: RegulatoryReport["reportCode"]) => {
    try {
      const data = await apiFetch<{ closures: ClosureItem[] }>(`/reports/regulatory/${reportCode}/closures`);
      setClosures(data.closures || []);
    } catch {
      setClosures([]);
    }
  };

  const generateRegulatoryReport = async () => {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
      });
      if (selectedCode === "banco_central") {
        params.set("bankReportType", bankReportType);
      }
      const data = await apiFetch<RegulatoryReport>(
        `/reports/regulatory/${selectedCode}?${params.toString()}`,
      );
      setReport(data);
      setMessage(data.signature.status === "closed" ? "Relatorio oficial fechado carregado." : "Relatorio gerado em modo pre-fechamento.");
      await loadClosures(selectedCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar relatorio regulatorio.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const closeRegulatoryPeriod = async () => {
    try {
      setClosing(true);
      setError("");
      setMessage("");
      const data = await apiFetch<RegulatoryReport & { message?: string }>(
        `/reports/regulatory/${selectedCode}/close`,
        {
          method: "POST",
          body: JSON.stringify({
            from: fromDate,
            to: toDate,
            bankReportType: selectedCode === "banco_central" ? bankReportType : undefined,
          }),
        },
      );
      setReport(data);
      setMessage(data.message || "Fechamento realizado com assinatura digital.");
      await loadClosures(selectedCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao fechar periodo regulatorio.");
    } finally {
      setClosing(false);
    }
  };

  useEffect(() => {
    void loadClosures(selectedCode);
  }, [selectedCode]);

  // Load operational data
  const loadOperationalData = async () => {
    try {
      setLoadingOperational(true);
      setError("");
      const [dashboardData, loansData] = await Promise.all([
        apiFetch<any>("/dashboard/summary"),
        apiFetch<any>("/loans?limit=100&status=active"),
      ]);

      const kpis = dashboardData.kpis || {};
      const monthly = dashboardData.monthly || [];

      // Get financial events from accounting
      let financialEvents = [];
      try {
        const accountingData = await apiFetch<any>("/accounting/ledger?from=" + firstDayOfCurrentMonth() + "&to=" + todayIso() + "&pageSize=100");
        const summaryByEvent = accountingData.summaryByEvent || [];
        financialEvents = summaryByEvent.map((item: any) => ({
          type: item.eventType,
          count: 0,
          totalAmount: item.totalDebit + item.totalCredit,
          averageAmount: item.totalDebit + item.totalCredit > 0 ? (item.totalDebit + item.totalCredit) / 2 : 0,
        }));
      } catch {
        financialEvents = [];
      }

      // Get client activity
      let clientActivity = [];
      try {
        const clientsData = await apiFetch<any>("/clients?limit=50");
        const clients = clientsData.clients || [];
        clientActivity = clients.slice(0, 10).map((client: any) => ({
          name: client.name,
          nuit: client.nuit || "",
          contracts: client.loanCount || 0,
          balance: client.totalBalance || 0,
          daysOverdue: client.maxDaysOverdue || 0,
        }));
      } catch {
        clientActivity = [];
      }

      setOperationalData({
        loaded: true,
        totalDisbursed: kpis.disbursedTotal || 0,
        totalReimbursed: kpis.reimbursedTotal || 0,
        activeLoans: kpis.activeLoans || 0,
        newClients: 0, // Would need separate endpoint
        disbursementsByPeriod: monthly.map((m: any) => ({
          period: m.period,
          amount: m.disbursed || 0,
          count: 0, // Would need detailed data
        })),
        reimbursementsByPeriod: monthly.map((m: any) => ({
          period: m.period,
          amount: m.reimbursed || 0,
          count: 0, // Would need detailed data
        })),
        financialEvents,
        clientActivity,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados operacionais.");
    } finally {
      setLoadingOperational(false);
    }
  };

  // Load financial data
  const loadFinancialData = async () => {
    try {
      setLoadingFinancial(true);
      setError("");
      const [dashboardData, riskData] = await Promise.all([
        apiFetch<any>("/dashboard/summary"),
        apiFetch<any>("/dashboard/risk-portfolio"),
      ]);

      const kpis = dashboardData.kpis || {};
      const monthly = dashboardData.monthly || [];
      const portfolio = dashboardData.portfolio || [];
      const riskPortfolio = riskData.portfolio || {};
      const productivity = riskData.productivityByManager || [];

      // Calculate aging distribution from portfolio data
      const agingDistribution = portfolio.map((p: any) => ({
        label: p.name,
        percentage: p.value,
        color: p.color,
      }));

      // Calculate monthly cash flow with projected balance
      let runningBalance = kpis.initialCapital || 0;
      const monthlyCashFlow = monthly.map((m: any) => {
        const netFlow = (m.reimbursed || 0) - (m.disbursed || 0) - (m.expenses || 0);
        runningBalance += netFlow;
        return {
          month: m.period,
          disbursed: m.disbursed || 0,
          reimbursed: m.reimbursed || 0,
          expenses: m.expenses || 0,
          netFlow,
          projectedBalance: runningBalance,
        };
      });

      setFinancialData({
        loaded: true,
        portfolioBalance: kpis.portfolioBalance || 0,
        initialCapital: kpis.initialCapital || 0,
        reinforcements: kpis.reinforcementsTotal || 0,
        recoveryRate: kpis.recoveryRate || 0,
        growthRate: kpis.growthRate || 0,
        cashIn: kpis.reimbursedTotal || 0,
        cashOut: (kpis.disbursedTotal || 0) + (kpis.expensesTotal || 0),
        netCashFlow: (kpis.reimbursedTotal || 0) - (kpis.disbursedTotal || 0) - (kpis.expensesTotal || 0),
        par30: riskPortfolio.par30 || 0,
        npl90: riskPortfolio.npl90 || 0,
        delinquencyRate: kpis.delinquencyRatePct || 0,
        portfolioHealth: kpis.portfolioHealthPct || 0,
        agingDistribution,
        monthlyCashFlow,
        managerPerformance: productivity.map((p: any) => ({
          manager: p.managerName,
          contracts: p.contracts,
          clients: p.clients,
          portfolio: p.portfolio,
          recovered: p.recovered,
          par30: p.par30,
          recoveryRate: p.recoveryRate,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados financeiros.");
    } finally {
      setLoadingFinancial(false);
    }
  };

  // Export operational CSV
  const exportOperationalCsv = () => {
    if (!operationalData.loaded) return;
    const rows = [
      { metric: "Total Desembolsado", value: operationalData.totalDisbursed },
      { metric: "Total Reembolsado", value: operationalData.totalReimbursed },
      { metric: "Operacoes Ativas", value: operationalData.activeLoans },
      { metric: "Novos Clientes", value: operationalData.newClients },
      ...operationalData.disbursementsByPeriod.map((item) => ({
        metric: `Desembolso ${item.period}`,
        value: item.amount,
      })),
      ...operationalData.reimbursementsByPeriod.map((item) => ({
        metric: `Reembolso ${item.period}`,
        value: item.amount,
      })),
    ];
    downloadTextFile("relatorio-operacional.csv", toCsv(rows), "text/csv;charset=utf-8");
    setMessage("Relatorio operacional exportado em CSV.");
  };

  // Export financial CSV
  const exportFinancialCsv = () => {
    if (!financialData.loaded) return;
    const rows = [
      { metric: "Saldo Carteira", value: financialData.portfolioBalance },
      { metric: "Capital Inicial", value: financialData.initialCapital },
      { metric: "Reforcos", value: financialData.reinforcements },
      { metric: "Taxa Recuperacao", value: financialData.recoveryRate },
      { metric: "Crescimento", value: financialData.growthRate },
      { metric: "Entradas", value: financialData.cashIn },
      { metric: "Saidas", value: financialData.cashOut },
      { metric: "Fluxo Liquido", value: financialData.netCashFlow },
      { metric: "PAR 30", value: financialData.par30 },
      { metric: "NPL 90", value: financialData.npl90 },
      { metric: "Taxa Inadimplencia", value: financialData.delinquencyRate },
      { metric: "Saude Carteira", value: financialData.portfolioHealth },
      ...financialData.monthlyCashFlow.map((item) => ({
        metric: `Fluxo ${item.month}`,
        value: item.netFlow,
      })),
    ];
    downloadTextFile("relatorio-financeiro.csv", toCsv(rows), "text/csv;charset=utf-8");
    setMessage("Relatorio financeiro exportado em CSV.");
  };

  // Export financial PDF
  const exportFinancialPdf = () => {
    if (!financialData.loaded) return;
    const html = `
      <div class="title">Relatorio Financeiro Completo</div>
      <div class="sub"><strong>Periodo:</strong> Visao Geral do Sistema</div>
      
      <div class="block">
        <h3>KPIs Financeiros</h3>
        <table>
          <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>Saldo Carteira</td><td>${formatCurrencyMT(financialData.portfolioBalance)} MT</td></tr>
            <tr><td>Capital Inicial</td><td>${formatCurrencyMT(financialData.initialCapital)} MT</td></tr>
            <tr><td>Reforcos</td><td>${formatCurrencyMT(financialData.reinforcements)} MT</td></tr>
            <tr><td>Taxa Recuperacao</td><td>${financialData.recoveryRate}%</td></tr>
            <tr><td>Crescimento</td><td>${financialData.growthRate}%</td></tr>
            <tr><td>Entradas</td><td>${formatCurrencyMT(financialData.cashIn)} MT</td></tr>
            <tr><td>Saidas</td><td>${formatCurrencyMT(financialData.cashOut)} MT</td></tr>
            <tr><td>Fluxo Liquido</td><td>${formatCurrencyMT(financialData.netCashFlow)} MT</td></tr>
          </tbody>
        </table>
      </div>

      <div class="block">
        <h3>Metricas de Risco</h3>
        <table>
          <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>PAR 30</td><td>${financialData.par30}%</td></tr>
            <tr><td>NPL 90</td><td>${financialData.npl90}%</td></tr>
            <tr><td>Taxa Inadimplencia</td><td>${financialData.delinquencyRate}%</td></tr>
            <tr><td>Saude Carteira</td><td>${financialData.portfolioHealth}%</td></tr>
          </tbody>
        </table>
      </div>

      <div class="block">
        <h3>Fluxo de Caixa Mensal</h3>
        <table>
          <thead><tr><th>Mes</th><th>Desembolsado</th><th>Reembolsado</th><th>Despesas</th><th>Fluxo Liquido</th><th>Saldo Projectado</th></tr></thead>
          <tbody>
            ${financialData.monthlyCashFlow.map((item) => `
              <tr>
                <td>${item.month}</td>
                <td>${formatCurrencyMT(item.disbursed)} MT</td>
                <td>${formatCurrencyMT(item.reimbursed)} MT</td>
                <td>${formatCurrencyMT(item.expenses)} MT</td>
                <td>${formatCurrencyMT(item.netFlow)} MT</td>
                <td>${formatCurrencyMT(item.projectedBalance)} MT</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    const ok = openCorporatePrintWindow({
      title: "Relatorio-Financeiro",
      bodyHtml: html,
      browserControls: true,
    });
    setMessage(ok ? "Relatorio financeiro aberto para impressao/salvar PDF." : "Nao foi possivel abrir janela de impressao.");
  };

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === "operational" && !operationalData.loaded) {
      loadOperationalData();
    }
    if (activeTab === "financial" && !financialData.loaded) {
      loadFinancialData();
    }
  }, [activeTab]);

  const exportCurrentCsv = () => {
    if (!report) return;
    const rows = report.rows.map((row) =>
      report.columns.reduce<Record<string, string | number>>((acc, column) => {
        const value = row[column.key];
        acc[column.label] = typeof value === "number" ? Number(value) : String(value ?? "");
        return acc;
      }, {}),
    );
    downloadTextFile(
      `${report.reportCode}-${report.period.from}-${report.period.to}.csv`,
      toCsv(rows),
      "text/csv;charset=utf-8;",
    );
    setMessage("Exportacao CSV concluida.");
  };

  const buildDetailTableHtml = (title: string, rows: Array<Record<string, unknown>> | undefined) => {
    if (!rows || rows.length === 0) return "";
    const keys = Object.keys(rows[0] || {});
    if (keys.length === 0) return "";
    const headers = keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("");
    const body = rows
      .map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(formatCell(row[key]))}</td>`).join("")}</tr>`)
      .join("");
    return `
      <div class="block">
        <div class="sub"><strong>${escapeHtml(title)}</strong></div>
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  };

  const renderDetailTable = (title: string, rows: Array<Record<string, unknown>> | undefined) => {
    if (!rows || rows.length === 0) return null;
    const keys = Object.keys(rows[0] || {});
    if (keys.length === 0) return null;
    return (
      <div className="rounded-lg border border-slate-200 overflow-auto bg-white">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h4 className="font-semibold text-slate-900">{title}</h4>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {keys.map((key) => (
                <th key={key} className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-slate-100">
                {keys.map((key) => (
                  <td key={`${idx}-${key}`} className="px-3 py-2 text-slate-800">{formatCell(row[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const exportCurrentPdf = () => {
    if (!report) return;
    const asNumber = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const formatMt = (value: unknown) =>
      asNumber(value).toLocaleString("pt-PT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const formatDatePt = (value: unknown) => {
      const raw = String(value ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [year, month, day] = raw.split("-");
        return `${day}/${month}/${year}`;
      }
      return raw || "-";
    };
    const summary = report.summary || {};
    const summaryValue = (key: string, mode: "text" | "mt" = "text") =>
      mode === "mt" ? escapeHtml(formatMt(summary[key])) : escapeHtml(formatCell(summary[key]));
    const ivaFields = report.details?.ivaFields || {};
    const ivaFieldValue = (field: string, fallbackKey?: string) => {
      const fromDetails = ivaFields[field];
      if (fromDetails !== null && fromDetails !== undefined && String(fromDetails).trim() !== "") {
        return escapeHtml(formatMt(fromDetails));
      }
      if (fallbackKey) {
        return summaryValue(fallbackKey, "mt");
      }
      return escapeHtml(formatMt(0));
    };

    const headers = report.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
    const bodyRows = report.rows
      .map((row) => `<tr>${report.columns.map((column) => `<td>${escapeHtml(formatCell(row[column.key]))}</td>`).join("")}</tr>`)
      .join("");
    const summaryRows = Object.entries(summary)
      .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(formatCell(value))}</td></tr>`)
      .join("");
    const detailsHtml = [
      buildDetailTableHtml("Reembolsos do periodo", report.details?.reimbursementRows),
      buildDetailTableHtml("Desembolsos do periodo", report.details?.disbursementRows),
      buildDetailTableHtml("Eventos financeiros do periodo", report.details?.financialEventRows),
      buildDetailTableHtml("Clientes novos do periodo", report.details?.newClientRows),
    ]
      .filter(Boolean)
      .join("");
    const inst = report.institution || {};

    let html = `
      <div class="title">${escapeHtml(report.reportName)}</div>
      <div class="sub"><strong>Autoridade:</strong> ${escapeHtml(report.authority)} | <strong>Layout:</strong> ${escapeHtml(report.layoutVersion)} | <strong>Periodo:</strong> ${escapeHtml(report.period.from)} ate ${escapeHtml(report.period.to)}</div>
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${bodyRows || `<tr><td colspan="${report.columns.length}">Sem dados para o periodo.</td></tr>`}</tbody>
      </table>
      <table>
        <thead><tr><th>Resumo</th><th>Valor</th></tr></thead>
        <tbody>${summaryRows || "<tr><td colspan='2'>Sem resumo.</td></tr>"}</tbody>
      </table>
      ${detailsHtml}
    `;

    if (report.templateVariant === "banco_mensal") {
      html = `
        <div class="title">BANCO DE MOCAMBIQUE</div>
        <div class="sub">DEPARTAMENTO DE SUPERVISAO PRUDENCIAL</div>
        <div class="sub"><strong>REPORTE PERIODICO DE INFORMACOES DE MICROFINANCAS</strong></div>
        <div class="sub"><strong>INSTITUICOES SUJEITAS A MONITORIZACAO</strong></div>

        <div class="block">
          <p><strong>PERIODO DE REPORTE:</strong> ${escapeHtml(formatDatePt(report.period.from))} a ${escapeHtml(formatDatePt(report.period.to))}</p>
          <p><strong>1. IDENTIFICACAO DA INSTITUICAO</strong></p>
          <p><strong>Denominacao:</strong> ${escapeHtml(inst.name || "-")}</p>
          <p><strong>Endereco:</strong> ${escapeHtml(inst.address || "-")}</p>
          <p><strong>Provincia:</strong> ${escapeHtml(inst.province || "-")} | <strong>Telefone:</strong> ${escapeHtml(inst.phone || "-")}</p>
          <p><strong>E-mail:</strong> ${escapeHtml(inst.email || "-")} | <strong>NUIT:</strong> ${escapeHtml(inst.nuit || "-")}</p>
        </div>

        <div class="sub"><strong>(Valores em Meticais)</strong></div>
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${bodyRows || `<tr><td colspan="${report.columns.length}">Sem dados para o periodo.</td></tr>`}</tbody>
        </table>

        <div class="block"><strong>Resumo prudencial do periodo</strong></div>
        <table>
          <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>Total de Operacoes</td><td>${summaryValue("totalOperacoes")}</td></tr>
            <tr><td>Total desembolsado (MT)</td><td>${summaryValue("totalDesembolsadoMt", "mt")}</td></tr>
            <tr><td>Carteira em divida (MT)</td><td>${summaryValue("totalCarteiraMt", "mt")}</td></tr>
            <tr><td>Carteira em atraso (MT)</td><td>${summaryValue("totalAtrasoMt", "mt")}</td></tr>
            <tr><td>Maximo de dias em atraso</td><td>${summaryValue("maxDiasAtraso")}</td></tr>
          </tbody>
        </table>
      `;
    } else if (report.templateVariant === "banco_trimestral") {
      html = `
        <div class="title">BANCO DE MOCAMBIQUE</div>
        <div class="sub">DEPARTAMENTO DE SUPERVISAO PRUDENCIAL</div>
        <div class="sub"><strong>REPORTE PERIODICO DE INFORMACOES DE MICROFINANCAS</strong></div>
        <div class="sub"><strong>INSTITUICOES SUJEITAS A MONITORIZACAO - TRIMESTRAL</strong></div>

        <div class="block">
          <p><strong>PERIODO:</strong> ${escapeHtml(formatDatePt(report.period.from))} a ${escapeHtml(formatDatePt(report.period.to))}</p>
          <p><strong>OPERADOR:</strong> ${escapeHtml(inst.name || "-")} | <strong>NUIT:</strong> ${escapeHtml(inst.nuit || "-")}</p>
          <p><strong>PROVINCIA:</strong> ${escapeHtml(inst.province || "-")} | <strong>TELEFONE:</strong> ${escapeHtml(inst.phone || "-")}</p>
        </div>

        <div class="block"><strong>2. INFORMACOES SOBRE A ACTIVIDADE</strong></div>
        <div class="sub"><strong>2.1.1 Volume de creditos - MZN</strong></div>
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${bodyRows || `<tr><td colspan="${report.columns.length}">Sem dados para o periodo.</td></tr>`}</tbody>
        </table>

        <div class="sub"><strong>2.1.2 Indicadores de carteira e clientes</strong></div>
        <table>
          <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>Numero de creditos concedidos</td><td>${summaryValue("numeroCreditosConcedidos")}</td></tr>
            <tr><td>Numero de creditos reembolsados</td><td>${summaryValue("numeroCreditosReembolsados")}</td></tr>
            <tr><td>Clientes ativos</td><td>${summaryValue("clientesAtivos")}</td></tr>
            <tr><td>Clientes homens</td><td>${summaryValue("clientesHomens")}</td></tr>
            <tr><td>Clientes mulheres</td><td>${summaryValue("clientesMulheres")}</td></tr>
            <tr><td>Total contratos ativos</td><td>${summaryValue("totalContratosAtivos")}</td></tr>
            <tr><td>Carteira vigente (MT)</td><td>${summaryValue("totalCarteiraVigenteMt", "mt")}</td></tr>
            <tr><td>Carteira em risco (MT)</td><td>${summaryValue("totalCarteiraRiscoMt", "mt")}</td></tr>
            <tr><td>Reembolsos aplicados (MT)</td><td>${summaryValue("totalReembolsosAplicadosMt", "mt")}</td></tr>
            <tr><td>Abatimentos (MT)</td><td>${summaryValue("totalAbatimentosMt", "mt")}</td></tr>
          </tbody>
        </table>
      `;
    } else if (report.templateVariant === "iva_modelo_a") {
      const eventTotals = { capitalizacao: 0, perdao_mora: 0, abatimento: 0, estorno: 0 };
      (report.details?.financialEventRows || []).forEach((row) => {
        const eventType = String(row.eventType || row.event_type || "").trim().toLowerCase();
        if (!(eventType in eventTotals)) return;
        eventTotals[eventType as keyof typeof eventTotals] += asNumber(row.totalMontanteMt ?? row.total_amount ?? 0);
      });

      html = `
        <div class="title">REPUBLICA DE MOCAMBIQUE</div>
        <div class="sub">MINISTERIO DAS FINANCAS | AUTORIDADE TRIBUTARIA DE MOCAMBIQUE</div>
        <div class="sub"><strong>DECLARACAO PERIODICA - MODELO A (IVA REGIME NORMAL)</strong></div>

        <div class="block"><strong>1 - TIPO DE DECLARACAO:</strong> Declaracao inicial</div>
        <div class="block">
          <p><strong>2 - PERIODO A QUE RESPEITA:</strong> ${escapeHtml(formatDatePt(report.period.from))} a ${escapeHtml(formatDatePt(report.period.to))}</p>
          <p><strong>3 - NUIT:</strong> ${escapeHtml(inst.nuit || "-")}</p>
          <p><strong>4 - NOME/DESIGNACAO SOCIAL:</strong> ${escapeHtml(inst.legalName || inst.name || "-")}</p>
          <p><strong>6 - DOMICILIO FISCAL:</strong> ${escapeHtml(inst.address || "-")} | <strong>PROVINCIA:</strong> ${escapeHtml(inst.province || "-")}</p>
        </div>

        <div class="block"><strong>8 - APURAMENTO DO IMPOSTO RESPEITANTE AO PERIODO</strong></div>
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${bodyRows || `<tr><td colspan="${report.columns.length}">Sem dados para o periodo.</td></tr>`}</tbody>
        </table>

        <div class="block"><strong>9 - CALCULO DO IMPOSTO A ENTREGAR OU A RECUPERAR</strong></div>
        <table>
          <thead><tr><th>Campo</th><th>Descricao</th><th>Valor (MT)</th></tr></thead>
          <tbody>
            <tr><td>14</td><td>Base tributavel total</td><td>${ivaFieldValue("campo14", "campo14BaseTributavelTotalMt")}</td></tr>
            <tr><td>15</td><td>Imposto a favor do sujeito passivo</td><td>${ivaFieldValue("campo15", "campo15ImpostoFavorSujeitoPassivoMt")}</td></tr>
            <tr><td>16</td><td>Imposto a favor do Estado</td><td>${ivaFieldValue("campo16", "campo16ImpostoFavorEstadoMt")}</td></tr>
            <tr><td>17</td><td>Imposto a pagar</td><td>${ivaFieldValue("campo17", "campo17ImpostoApagarMt")}</td></tr>
            <tr><td>18</td><td>Credito do periodo</td><td>${ivaFieldValue("campo18", "campo18CreditoMt")}</td></tr>
          </tbody>
        </table>

        <div class="block"><strong>10 - IMPOSTO A ENTREGAR AO ESTADO</strong></div>
        <table>
          <thead><tr><th>Campo</th><th>Descricao</th><th>Valor (MT)</th></tr></thead>
          <tbody>
            <tr><td>22</td><td>IVA</td><td>${ivaFieldValue("campo22", "campo22IvaPagarMt")}</td></tr>
            <tr><td>23</td><td>Juros de mora</td><td>${escapeHtml(formatMt(0))}</td></tr>
            <tr><td>24</td><td>Importancia a pagar</td><td>${ivaFieldValue("campo24", "campo24TotalApagarMt")}</td></tr>
          </tbody>
        </table>

        <div class="block"><strong>11 - IMPOSTO A RECUPERAR</strong></div>
        <table>
          <thead><tr><th>Campo</th><th>Descricao</th><th>Valor (MT)</th></tr></thead>
          <tbody>
            <tr><td>26</td><td>Credito a reportar</td><td>${ivaFieldValue("campo26", "campo26CreditoReportarMt")}</td></tr>
            <tr><td>27</td><td>Pedido de reembolso</td><td>${ivaFieldValue("campo27", "campo27PedidoReembolsoMt")}</td></tr>
          </tbody>
        </table>

        <div class="block"><strong>Anexo de suporte do periodo</strong></div>
        <table>
          <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>Juros reembolsados no periodo (base IVA)</td><td>${summaryValue("jurosReembolsadosPeriodoMt", "mt")}</td></tr>
            <tr><td>Principal reembolsado no periodo</td><td>${summaryValue("principalReembolsadoPeriodoMt", "mt")}</td></tr>
            <tr><td>Mora reembolsada no periodo</td><td>${summaryValue("moraReembolsadaPeriodoMt", "mt")}</td></tr>
            <tr><td>Total de reembolsos no periodo</td><td>${summaryValue("totalReembolsadoPeriodoMt", "mt")}</td></tr>
            <tr><td>Total de desembolsos no periodo</td><td>${summaryValue("totalDesembolsadoPeriodoMt", "mt")}</td></tr>
            <tr><td>Total de operacoes de reembolso</td><td>${summaryValue("totalOperacoesReembolso")}</td></tr>
            <tr><td>Total de operacoes de desembolso</td><td>${summaryValue("totalOperacoesDesembolso")}</td></tr>
            <tr><td>Capitalizacoes no periodo</td><td>${escapeHtml(formatMt(eventTotals.capitalizacao))}</td></tr>
            <tr><td>Perdao de mora no periodo</td><td>${escapeHtml(formatMt(eventTotals.perdao_mora))}</td></tr>
            <tr><td>Abates no periodo</td><td>${escapeHtml(formatMt(eventTotals.abatimento))}</td></tr>
            <tr><td>Estornos no periodo</td><td>${escapeHtml(formatMt(eventTotals.estorno))}</td></tr>
            <tr><td>Clientes novos no periodo</td><td>${summaryValue("totalNovosClientes")}</td></tr>
          </tbody>
        </table>
        ${detailsHtml}
      `;
    }
    const ok = openCorporatePrintWindow({
      title: `${report.reportCode}-${report.period.from}-${report.period.to}`,
      bodyHtml: html,
      browserControls: true,
      company: {
        name: report.institution?.name,
        legalName: report.institution?.legalName,
        nuit: report.institution?.nuit,
      },
    });
    setMessage(ok ? "Documento aberto para imprimir/salvar PDF." : "Nao foi possivel abrir janela de impressao.");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Relatorios Oficiais</h1>
          <p className="text-slate-600 mt-1">Banco Central, CRC e Fiscal com fechamento por periodo e assinatura digital</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
      {message && <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-4 py-3">{message}</p>}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "regulatory" | "operational" | "financial")} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="regulatory">Regulatorios Oficiais</TabsTrigger>
          <TabsTrigger value="operational">Operacionais</TabsTrigger>
          <TabsTrigger value="financial">Financeiros</TabsTrigger>
        </TabsList>

        <TabsContent value="regulatory" className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Modulo Regulatorio Oficial</h3>
                <p className="text-sm text-slate-600">
                  Fechamento de periodo com assinatura digital verificavel e layout oficial por autoridade.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1 md:col-span-2">
              <Label>Relatorio regulatorio</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                value={selectedCode}
                onChange={(e) => {
                  setSelectedCode(e.target.value as RegulatoryReport["reportCode"]);
                  setReport(null);
                  setMessage("");
                  setError("");
                }}
              >
                {REGULATORY_REPORTS.map((item) => (
                  <option key={item.code} value={item.code}>{item.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-600">{selectedMeta.description}</p>
            </div>
            {selectedCode === "banco_central" && (
              <div className="space-y-1">
                <Label>Tipo de Mapa</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                  value={bankReportType}
                  onChange={(e) => setBankReportType(e.target.value as "mensal" | "trimestral")}
                >
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label>De</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Ate</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={generateRegulatoryReport} disabled={loading}>
              <Calendar className="w-4 h-4 mr-2" />
              {loading ? "A gerar..." : "Gerar Relatorio Oficial"}
            </Button>
            <Button variant="outline" onClick={exportCurrentPdf} disabled={!report}>
              <Download className="w-4 h-4 mr-2" />
              Exportar PDF Oficial
            </Button>
            <Button variant="outline" onClick={exportCurrentCsv} disabled={!report}>
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel (CSV)
            </Button>
            <Button onClick={closeRegulatoryPeriod} disabled={!canClose || closing}>
              <Lock className="w-4 h-4 mr-2" />
              {closing ? "A fechar..." : "Fechar Periodo e Assinar"}
            </Button>
          </div>
          {!canClose && (
            <p className="text-xs text-slate-600">Apenas admin pode efetuar fechamento oficial de periodo.</p>
          )}

          {report && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Autoridade</p>
                  <p className="text-base font-semibold text-slate-900">{report.authority}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Layout</p>
                  <p className="text-base font-semibold text-slate-900">{report.layoutVersion}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Status Assinatura</p>
                  {report.signature.status === "closed" ? (
                    <p className="text-base font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Fechado</p>
                  ) : (
                    <p className="text-base font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Pre-fechamento</p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Fechamento</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {report.signature.closedAt ? new Date(report.signature.closedAt).toLocaleString("pt-PT") : "Nao fechado"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><FileSignature className="w-4 h-4" /> Assinatura digital</p>
                <p className="font-mono text-xs break-all text-slate-800">{report.signature.value}</p>
                <p className="text-xs text-slate-500 mt-1">Algoritmo: {report.signature.algorithm}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="font-semibold text-slate-900 mb-2">Resumo oficial</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {Object.entries(report.summary || {}).map(([key, value]) => (
                    <div key={key} className="rounded-md border border-slate-200 px-3 py-2">
                      <p className="text-xs text-slate-500">{key}</p>
                      <p className="text-sm font-semibold text-slate-900">{formatCell(value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-auto bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {report.columns.map((column) => (
                        <th key={column.key} className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        {report.columns.map((column) => (
                          <td key={column.key} className="px-3 py-2 text-slate-800">{formatCell(row[column.key])}</td>
                        ))}
                      </tr>
                    ))}
                    {report.rows.length === 0 && (
                      <tr>
                        <td colSpan={report.columns.length} className="px-3 py-6 text-center text-slate-500">
                          Sem dados para o periodo selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {renderDetailTable("Reembolsos do periodo", report.details?.reimbursementRows)}
              {renderDetailTable("Desembolsos do periodo", report.details?.disbursementRows)}
              {renderDetailTable("Eventos financeiros do periodo", report.details?.financialEventRows)}
              {renderDetailTable("Clientes novos do periodo", report.details?.newClientRows)}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h4 className="font-semibold text-slate-900 mb-2">Historico de Fechamentos</h4>
            <div className="rounded-md border border-slate-200 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Periodo</th>
                    <th className="px-3 py-2 text-left">Fechado em</th>
                    <th className="px-3 py-2 text-left">Por</th>
                    <th className="px-3 py-2 text-left">Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  {closures.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{item.periodFrom} ate {item.periodTo}</td>
                      <td className="px-3 py-2">{new Date(item.closedAt).toLocaleString("pt-PT")}</td>
                      <td className="px-3 py-2">{item.closedByName || "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{item.signatureValue}</td>
                    </tr>
                  ))}
                  {closures.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                        Sem fechamentos para este relatorio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="operational" className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-100 p-2">
                <Users className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Relatorios Operacionais</h3>
                <p className="text-sm text-slate-600">
                  Analise detalhada de operacoes de credito, desembolsos, reembolsos e atividade de clientes.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Total Desembolsado</p>
              <p className="mt-2 text-2xl font-bold text-blue-700">{formatCurrencyMT(operationalData.totalDisbursed)} MT</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Total Reembolsado</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrencyMT(operationalData.totalReimbursed)} MT</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Operacoes Ativas</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{operationalData.activeLoans}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Novos Clientes</p>
              <p className="mt-2 text-2xl font-bold text-purple-700">{operationalData.newClients}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="font-semibold text-slate-900 mb-3">Desembolsos por Periodo</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Operacoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operationalData.disbursementsByPeriod.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.period}</TableCell>
                      <TableCell className="text-blue-700 font-semibold">{formatCurrencyMT(item.amount)} MT</TableCell>
                      <TableCell>{item.count}</TableCell>
                    </TableRow>
                  ))}
                  {operationalData.disbursementsByPeriod.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-slate-500 py-4">
                        Sem dados de desembolsos.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="font-semibold text-slate-900 mb-3">Reembolsos por Periodo</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Operacoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operationalData.reimbursementsByPeriod.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{item.period}</TableCell>
                      <TableCell className="text-emerald-700 font-semibold">{formatCurrencyMT(item.amount)} MT</TableCell>
                      <TableCell>{item.count}</TableCell>
                    </TableRow>
                  ))}
                  {operationalData.reimbursementsByPeriod.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-slate-500 py-4">
                        Sem dados de reembolsos.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-slate-900 mb-3">Eventos Financeiros</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Media</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operationalData.financialEvents.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="capitalize">{item.type}</TableCell>
                    <TableCell>{item.count}</TableCell>
                    <TableCell className="font-semibold">{formatCurrencyMT(item.totalAmount)} MT</TableCell>
                    <TableCell>{formatCurrencyMT(item.averageAmount)} MT</TableCell>
                  </TableRow>
                ))}
                {operationalData.financialEvents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-slate-500 py-4">
                      Sem eventos financeiros registados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-slate-900 mb-3">Atividade de Clientes</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>NUIT</TableHead>
                  <TableHead>Contratos</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operationalData.clientActivity.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.nuit || "-"}</TableCell>
                    <TableCell>{item.contracts}</TableCell>
                    <TableCell className={item.balance > 0 ? "text-blue-700 font-semibold" : "text-slate-600"}>
                      {formatCurrencyMT(item.balance)} MT
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        item.daysOverdue > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                      }`}>
                        {item.daysOverdue > 0 ? `Atraso ${item.daysOverdue}d` : "Em dia"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {operationalData.clientActivity.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-slate-500 py-4">
                      Sem atividade de clientes.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={loadOperationalData} disabled={loadingOperational}>
              <Calendar className="w-4 h-4 mr-2" />
              {loadingOperational ? "A carregar..." : "Atualizar Dados"}
            </Button>
            <Button variant="outline" onClick={exportOperationalCsv} disabled={!operationalData.loaded}>
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel (CSV)
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <Wallet className="h-5 w-5 text-purple-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Relatorios Financeiros</h3>
                <p className="text-sm text-slate-600">
                  Analise financeira completa com fluxo de caixa, performance de carteira e metricas de risco.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Saldo Carteira</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrencyMT(financialData.portfolioBalance)} MT</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Capital Inicial</p>
              <p className="mt-2 text-2xl font-bold text-blue-700">{formatCurrencyMT(financialData.initialCapital)} MT</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Reforcos</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrencyMT(financialData.reinforcements)} MT</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Taxa Recuperacao</p>
              <p className="mt-2 text-2xl font-bold text-purple-700">{financialData.recoveryRate}%</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Crescimento</p>
              <p className={`mt-2 text-2xl font-bold ${financialData.growthRate >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {financialData.growthRate >= 0 ? "+" : ""}{financialData.growthRate}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <h4 className="font-semibold text-slate-900">Entradas</h4>
              </div>
              <p className="text-3xl font-bold text-emerald-700">{formatCurrencyMT(financialData.cashIn)} MT</p>
              <p className="text-sm text-slate-600 mt-1">Reembolsos e outros creditos</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-red-600" />
                <h4 className="font-semibold text-slate-900">Saidas</h4>
              </div>
              <p className="text-3xl font-bold text-red-700">{formatCurrencyMT(financialData.cashOut)} MT</p>
              <p className="text-sm text-slate-600 mt-1">Desembolsos e despesas</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-slate-900">Fluxo Liquido</h4>
              </div>
              <p className={`text-3xl font-bold ${financialData.netCashFlow >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {financialData.netCashFlow >= 0 ? "+" : ""}{formatCurrencyMT(financialData.netCashFlow)} MT
              </p>
              <p className="text-sm text-slate-600 mt-1">Net cash flow do periodo</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="font-semibold text-slate-900 mb-3">Metricas de Risco</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">PAR 30 (Portfolio at Risk)</span>
                  <span className={`font-semibold ${financialData.par30 > 10 ? "text-red-700" : "text-emerald-700"}`}>
                    {financialData.par30}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">NPL 90 (Non-Performing Loans)</span>
                  <span className={`font-semibold ${financialData.npl90 > 5 ? "text-red-700" : "text-emerald-700"}`}>
                    {financialData.npl90}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Taxa Inadimplencia</span>
                  <span className={`font-semibold ${financialData.delinquencyRate > 15 ? "text-red-700" : "text-emerald-700"}`}>
                    {financialData.delinquencyRate}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Saude Carteira</span>
                  <span className={`font-semibold ${financialData.portfolioHealth > 80 ? "text-emerald-700" : "text-amber-700"}`}>
                    {financialData.portfolioHealth}%
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="font-semibold text-slate-900 mb-3">Distribuicao por Vencimento</h4>
              <div className="space-y-2">
                {financialData.agingDistribution.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ 
                            width: `${item.percentage}%`,
                            backgroundColor: item.color 
                          }} 
                        />
                      </div>
                      <span className="text-sm font-semibold w-12 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-slate-900 mb-3">Fluxo de Caixa Mensal</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Desembolsado</TableHead>
                  <TableHead>Reembolsado</TableHead>
                  <TableHead>Despesas</TableHead>
                  <TableHead>Fluxo Liquido</TableHead>
                  <TableHead>Saldo Projectado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {financialData.monthlyCashFlow.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.month}</TableCell>
                    <TableCell className="text-red-700">{formatCurrencyMT(item.disbursed)} MT</TableCell>
                    <TableCell className="text-emerald-700">{formatCurrencyMT(item.reimbursed)} MT</TableCell>
                    <TableCell className="text-amber-700">{formatCurrencyMT(item.expenses)} MT</TableCell>
                    <TableCell className={item.netFlow >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
                      {item.netFlow >= 0 ? "+" : ""}{formatCurrencyMT(item.netFlow)} MT
                    </TableCell>
                    <TableCell className="text-blue-700 font-semibold">{formatCurrencyMT(item.projectedBalance)} MT</TableCell>
                  </TableRow>
                ))}
                {financialData.monthlyCashFlow.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-slate-500 py-4">
                      Sem dados de fluxo de caixa.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-slate-900 mb-3">Performance por Gestor</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gestor</TableHead>
                  <TableHead>Contratos</TableHead>
                  <TableHead>Clientes</TableHead>
                  <TableHead>Carteira</TableHead>
                  <TableHead>Recuperado</TableHead>
                  <TableHead>PAR 30</TableHead>
                  <TableHead>Taxa Recuperacao</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {financialData.managerPerformance.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.manager}</TableCell>
                    <TableCell>{item.contracts}</TableCell>
                    <TableCell>{item.clients}</TableCell>
                    <TableCell className="text-blue-700 font-semibold">{formatCurrencyMT(item.portfolio)} MT</TableCell>
                    <TableCell className="text-emerald-700">{formatCurrencyMT(item.recovered)} MT</TableCell>
                    <TableCell className={item.par30 > 10 ? "text-red-700" : "text-emerald-700"}>{item.par30}%</TableCell>
                    <TableCell className="text-purple-700">{item.recoveryRate}%</TableCell>
                  </TableRow>
                ))}
                {financialData.managerPerformance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-slate-500 py-4">
                      Sem dados de performance por gestor.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={loadFinancialData} disabled={loadingFinancial}>
              <Calendar className="w-4 h-4 mr-2" />
              {loadingFinancial ? "A carregar..." : "Atualizar Dados"}
            </Button>
            <Button variant="outline" onClick={exportFinancialCsv} disabled={!financialData.loaded}>
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel (CSV)
            </Button>
            <Button variant="outline" onClick={exportFinancialPdf} disabled={!financialData.loaded}>
              <Download className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

