import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DollarSign,
  RefreshCcw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../../lib/api";
import { formatCurrencyMT } from "../../lib/format";
import { useRealtimeSubscription } from "../../lib/realtime";

type DashboardResponse = {
  kpis: {
    totalLoans: number;
    totalBalance: number;
    delayedLoans: number;
    delayedBalance: number;
    recoveryRate: number;
    activeLoans: number;
    delinquentClients: number;
    disbursedTotal: number;
    reimbursedTotal: number;
    expensesTotal: number;
    initialCapital: number;
    reinforcementsTotal: number;
    portfolioBalance: number;
    portfolioHealthPct: number;
    delinquencyRatePct: number;
    growthRatePct: number | null;
  };
  monthly: Array<{
    period: string;
    disbursed: number;
    reimbursed: number;
    recovered: number;
    expenses: number;
    delayed: number;
    netFlow: number;
    projectedPortfolioBalance: number;
  }>;
  portfolio: Array<{ name: string; value: number; count: number; color: string }>;
};

type RiskPortfolioResponse = {
  portfolio: {
    par30: number;
    npl90: number;
    recoveryRate: number;
    outstandingBalance: number;
  };
  productivityByManager: Array<{
    managerName: string;
    contracts: number;
    clients: number;
    par30: number;
    recoveryRate: number;
  }>;
  alerts: Array<{
    severity: "medium" | "high" | "critical";
    message: string;
  }>;
};

const formatMt = (value: number) => formatCurrencyMT(value);

function formatPeriodLabel(period: string) {
  const [yearRaw, monthRaw] = String(period || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return period || "-";
  }
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("pt-PT", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/D";
  return `${Number(value).toFixed(2)}%`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [riskData, setRiskData] = useState<RiskPortfolioResponse | null>(null);
  const [error, setError] = useState("");

  const loadData = useCallback(() => {
    Promise.all([
      apiFetch<DashboardResponse>("/dashboard/summary"),
      apiFetch<RiskPortfolioResponse>("/dashboard/risk-portfolio"),
    ])
      .then(([summary, risk]) => {
        setData(summary);
        setRiskData(risk);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar dashboard."));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useRealtimeSubscription(
    ["LOAN_REQUEST_CREATED", "LOAN_DECISION_UPDATED", "LOAN_DISBURSED", "REPAYMENT_APPLIED", "FINANCE_SESSION_CHANGED", "CAIXA_MUTATION"],
    () => {
      loadData();
    },
  );

  const monthWindowLabel = useMemo(() => {
    if (!data?.monthly?.length) return "Ultimos 6 meses";
    const first = data.monthly[0]?.period;
    const last = data.monthly[data.monthly.length - 1]?.period;
    if (!first || !last) return "Ultimos 6 meses";
    return `${formatPeriodLabel(first)} a ${formatPeriodLabel(last)}`;
  }, [data]);

  if (error) {
    return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-slate-600">A carregar dados do dashboard...</p>;
  }

  const { kpis } = data;
  const cards = [
    {
      title: "Saldo da Carteira",
      value: formatMt(kpis.portfolioBalance),
      helper: "Capital Inicial + Reembolsos + Reforcos - Desembolsos - Despesas",
      icon: Wallet,
      iconClass: "bg-slate-900",
    },
    {
      title: "Crescimento vs Capital Inicial",
      value: formatPercent(kpis.growthRatePct),
      helper: `Capital Inicial: ${formatMt(kpis.initialCapital)}`,
      icon: TrendingUp,
      iconClass: "bg-emerald-600",
    },
    {
      title: "Desembolsos Totais",
      value: formatMt(kpis.disbursedTotal),
      helper: "Valor liquido desembolsado",
      icon: DollarSign,
      iconClass: "bg-blue-600",
    },
    {
      title: "Reembolsos Totais",
      value: formatMt(kpis.reimbursedTotal),
      helper: "Total recuperado em caixa",
      icon: RefreshCcw,
      iconClass: "bg-cyan-600",
    },
    {
      title: "Emprestimos Ativos",
      value: String(kpis.activeLoans),
      helper: `Em atraso: ${kpis.delayedLoans}`,
      icon: Activity,
      iconClass: "bg-violet-600",
    },
    {
      title: "Despesas Executadas",
      value: formatMt(kpis.expensesTotal),
      helper: `Reforcos de capital: ${formatMt(kpis.reinforcementsTotal)}`,
      icon: Clock3,
      iconClass: "bg-amber-600",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard Executivo</h1>
          <p className="text-slate-600 mt-1">Indicadores financeiros e de saude da carteira com base em dados reais.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
          Janela: <strong>{monthWindowLabel}</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              role="button"
              tabIndex={0}
              className="rounded-2xl bg-white p-6 shadow-md border border-slate-100 hover:shadow-xl transition transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-emerald-200 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{card.title}</p>
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${card.iconClass} shadow-sm`}
                  aria-hidden
                >
                  <Icon className="h-6 w-6 text-white" />
                </span>
              </div>
              <p className="mt-4 text-2xl sm:text-3xl font-extrabold text-slate-900">{card.value}</p>
              <p className="mt-2 text-sm text-slate-400 truncate">{card.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Saude Geral da Carteira</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm hover:shadow-md transition cursor-default">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-800">Carteira Saudavel</p>
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              </div>
              <p className="mt-3 text-2xl font-bold text-emerald-900">{formatPercent(kpis.portfolioHealthPct)}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm hover:shadow-md transition cursor-default">
              <p className="text-sm font-medium text-blue-800">Taxa de Recuperacao</p>
              <p className="mt-3 text-2xl font-bold text-blue-900">{formatPercent(kpis.recoveryRate)}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm hover:shadow-md transition cursor-default">
              <p className="text-sm font-medium text-amber-800">Taxa de Inadimplencia</p>
              <p className="mt-3 text-2xl font-bold text-amber-900">{formatPercent(kpis.delinquencyRatePct)}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
            <p>
              Clientes morosos: <strong>{kpis.delinquentClients}</strong>
            </p>
            <p>
              Saldo em atraso: <strong>{formatMt(kpis.delayedBalance)}</strong>
            </p>
            <p>
              Saldo em aberto: <strong>{formatMt(kpis.totalBalance)}</strong>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Distribuicao de Risco</h2>
            <div className="mt-3 h-[260px]">
              {data?.portfolio?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.portfolio} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                      {data.portfolio.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatMt(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full rounded-md border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
                  <span>Gráfico: Distribuição de Risco (placeholder)</span>
                </div>
              )}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Fluxo Financeiro Mensal (MT)</h2>
          <div className="mt-3 h-[300px]">
            {data?.monthly?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.monthly} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tickFormatter={formatPeriodLabel} />
                  <YAxis tickFormatter={formatMt} />
                  <Tooltip labelFormatter={formatPeriodLabel} formatter={(value: number) => formatMt(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="disbursed" name="Desembolsos" stroke="#3b82f6" activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="reimbursed" name="Reembolsos" stroke="#10b981" />
                  <Line type="monotone" dataKey="expenses" name="Despesas" stroke="#ef4444" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-md border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
                <span>Gráfico: Fluxo Financeiro Mensal (placeholder)</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Evolucao do Saldo Projetado da Carteira</h2>
          <div className="mt-3 h-[300px]">
            {data?.monthly?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthly} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tickFormatter={formatPeriodLabel} />
                  <YAxis tickFormatter={formatMt} />
                  <Tooltip labelFormatter={formatPeriodLabel} formatter={(value: number) => formatMt(value)} />
                  <Legend />
                  <Area type="monotone" dataKey="projectedPortfolioBalance" name="Saldo Projetado" stroke="#334155" fill="#334155" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-md border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
                <span>Gráfico: Evolução do Saldo Projetado (placeholder)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {riskData && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Alertas Automaticos</h2>
          <div className="mt-3 space-y-2">
            {riskData.alerts.length === 0 && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Sem alertas criticos no momento.
              </p>
            )}
            {riskData.alerts.map((alert, index) => (
              <p
                key={`${alert.message}-${index}`}
                className={`rounded-md border px-3 py-2 text-sm ${
                  alert.severity === "critical"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : alert.severity === "high"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <span className="mr-2 inline-flex align-middle">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                {alert.message}
              </p>
            ))}
          </div>
        </div>
      )}
        </div>
      </div>
  );
}
