import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  CreditCard,
  Users,
  Activity,
  RefreshCw,
  HeadphonesIcon,
  ShieldAlert,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  CalendarClock,
  FileText,
  Eye,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

function formatPtDateTime(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleString("pt-MZ");
}

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "-";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatPtDateTime(dateStr);
}

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-red-100 text-red-700" },
  high: { label: "Alta", className: "bg-orange-100 text-orange-700" },
  normal: { label: "Normal", className: "bg-blue-100 text-blue-700" },
  low: { label: "Baixa", className: "bg-slate-100 text-slate-600" },
};

const STATUS_BADGE: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  open: { label: "Aberto", className: "bg-amber-100 text-amber-700", icon: <AlertTriangle className="w-3 h-3" /> },
  in_progress: { label: "Em Progresso", className: "bg-blue-100 text-blue-700", icon: <Clock className="w-3 h-3" /> },
  resolved: { label: "Resolvido", className: "bg-emerald-100 text-emerald-700", icon: <CheckCircle className="w-3 h-3" /> },
  closed: { label: "Fechado", className: "bg-slate-100 text-slate-600", icon: <XCircle className="w-3 h-3" /> },
};

interface MonitoringSummary {
  total_companies: number;
  active_companies: number;
  inactive_companies: number;
  active_subscriptions: number;
  grace_subscriptions: number;
  expired_subscriptions: number;
}

interface PaymentStats {
  payments: {
    total: number;
    totalAmount: number;
    totalAmountFormatted: string;
    companiesWithPayments: number;
    active: number;
    expired: number;
  };
  companies: {
    total: number;
    active: number;
    grace: number;
    expired: number;
    inactive: number;
  };
  expiringSoon: { id: number; name: string; expiresAt: string; graceDays: number; totalPaid: number }[];
}

interface SupportStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
}

interface Ticket {
  id: number;
  companyId: number;
  companyName: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AuditEntry {
  id: number;
  user_id: number;
  user_name: string;
  company_id: number;
  company_name: string;
  action_type: string;
  details: string;
  ip_address: string;
  happened_at: string;
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);

  const [monitoring, setMonitoring] = useState<MonitoringSummary | null>(null);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [supportStats, setSupportStats] = useState<SupportStats | null>(null);
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [monData, payData, supData, ticketsData, auditData] = await Promise.allSettled([
        apiFetch<MonitoringSummary>("/admin/monitoring/summary"),
        apiFetch<PaymentStats>("/admin/payments/stats"),
        apiFetch<SupportStats>("/admin/support/stats"),
        apiFetch<{ tickets: Ticket[] }>("/admin/support?limit=5"),
        apiFetch<{ entries: AuditEntry[] }>("/admin/audit?limit=8"),
      ]);

      if (monData.status === "fulfilled") setMonitoring(monData.value);
      if (payData.status === "fulfilled") setPaymentStats(payData.value);
      if (supData.status === "fulfilled") setSupportStats(supData.value);
      if (ticketsData.status === "fulfilled") setRecentTickets(ticketsData.value.tickets || []);
      if (auditData.status === "fulfilled") setRecentAudit(auditData.value.entries || []);
    } catch {
      // Silent catch - partial data is acceptable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) {
      navigate("/", { replace: true });
      return;
    }
    void loadData();
  }, [isCentralAdmin, loadData, navigate]);

  if (loading && !monitoring) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            Dashboard
          </h1>
          <p className="text-slate-500 mt-1">Visão geral da plataforma em tempo real.</p>
        </div>
        <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Total de Empresas</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{monitoring?.total_companies ?? "—"}</p>
            <p className="text-xs text-emerald-600 mt-1">
              {monitoring?.active_companies ?? 0} activas
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Empresas Activas</p>
            <p className="text-2xl font-bold text-blue-700 mt-0.5">{monitoring?.active_companies ?? "—"}</p>
            <p className="text-xs text-red-500 mt-1">
              {monitoring?.inactive_companies ?? 0} inactivas
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate("/admin-microcredito")}
          className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Assinaturas Activas</p>
            <p className="text-2xl font-bold text-emerald-700 mt-0.5">{monitoring?.active_subscriptions ?? "—"}</p>
            <p className="text-xs text-amber-600 mt-1">
              {monitoring?.grace_subscriptions ?? 0} em carência
            </p>
          </div>
        </button>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Receita Total</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {paymentStats ? formatMoney(paymentStats.payments.totalAmount) : "—"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {paymentStats?.payments.total ?? 0} pagamentos
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
            <HeadphonesIcon className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Chamados de Suporte</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{supportStats?.total ?? "—"}</p>
            <p className="text-xs text-amber-600 mt-1">
              {supportStats?.open ?? 0} abertos · {supportStats?.in_progress ?? 0} em progresso
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate("/admin-microcredito")}
          className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md hover:border-red-300 transition-all text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Assinaturas Expiradas</p>
            <p className="text-2xl font-bold text-red-700 mt-0.5">{monitoring?.expired_subscriptions ?? "—"}</p>
            <p className="text-xs text-slate-500 mt-1">
              {paymentStats?.companies.expired ?? 0} empresas expiradas
            </p>
          </div>
        </button>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6 text-violet-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Empresas c/ Pagamentos</p>
            <p className="text-2xl font-bold text-violet-700 mt-0.5">
              {paymentStats?.payments.companiesWithPayments ?? "—"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              de {paymentStats?.companies.total ?? 0} total
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate("/admin-microcredito")}
          className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md hover:border-orange-300 transition-all text-left cursor-pointer"
        >
          <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
            <CalendarClock className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">A Expirar (7 dias)</p>
            <p className="text-2xl font-bold text-orange-700 mt-0.5">
              {paymentStats?.expiringSoon?.length ?? "—"}
            </p>
            <p className="text-xs text-slate-500 mt-1">assinaturas próximas do vencimento</p>
          </div>
        </button>
      </div>

      {/* Middle section - Subscription breakdown + Support stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subscription Status Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-emerald-500" />
            Estado das Assinaturas
          </h3>
          <div className="space-y-3">
            {[
              { label: "Activas", value: paymentStats?.companies.active ?? 0, color: "bg-emerald-500", textColor: "text-emerald-700" },
              { label: "Em Carência", value: paymentStats?.companies.grace ?? 0, color: "bg-amber-500", textColor: "text-amber-700" },
              { label: "Expiradas", value: paymentStats?.companies.expired ?? 0, color: "bg-red-500", textColor: "text-red-700" },
              { label: "Inactivas", value: paymentStats?.companies.inactive ?? 0, color: "bg-slate-400", textColor: "text-slate-600" },
            ].map((item) => {
              const total = paymentStats?.companies.total || 1;
              const pct = Math.round((item.value / total) * 100);
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-600">{item.label}</span>
                    <span className={`font-semibold ${item.textColor}`}>{item.value} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Support Tickets Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <HeadphonesIcon className="w-5 h-5 text-rose-500" />
            Chamados de Suporte
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Abertos", value: supportStats?.open ?? 0, icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, bg: "bg-amber-50" },
              { label: "Em Progresso", value: supportStats?.in_progress ?? 0, icon: <Clock className="w-4 h-4 text-blue-500" />, bg: "bg-blue-50" },
              { label: "Resolvidos", value: supportStats?.resolved ?? 0, icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, bg: "bg-emerald-50" },
              { label: "Fechados", value: supportStats?.closed ?? 0, icon: <XCircle className="w-4 h-4 text-slate-400" />, bg: "bg-slate-50" },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} rounded-lg p-3 flex items-center gap-3`}>
                {item.icon}
                <div>
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="text-lg font-bold text-slate-900">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => navigate("/admin/support")}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
            >
              <Eye className="w-4 h-4" />
              Ver todos os chamados
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <CalendarClock className="w-5 h-5 text-orange-500" />
            Assinaturas a Expirar
          </h3>
          {paymentStats?.expiringSoon && paymentStats.expiringSoon.length > 0 ? (
            <div className="space-y-2.5 max-h-56 overflow-y-auto">
              {paymentStats.expiringSoon.map((co) => (
                <div key={co.id} className="flex items-center justify-between p-2.5 bg-orange-50 rounded-lg border border-orange-100">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{co.name}</p>
                    <p className="text-xs text-slate-500">
                      Expira: {new Date(co.expiresAt).toLocaleDateString("pt-MZ")}
                    </p>
                  </div>
                  <span className="shrink-0 ml-2 text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                    {Math.max(0, Math.ceil((new Date(co.expiresAt).getTime() - Date.now()) / 86400000))}d
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400">
              <CheckCircle className="w-8 h-8 mb-2 text-emerald-400" />
              <p className="text-sm">Nenhuma assinatura a expirar em breve.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom section - Recent Tickets + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Support Tickets */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              Chamados Recentes
            </h3>
            <button
              onClick={() => navigate("/admin/support")}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              Ver todos <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          {recentTickets.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentTickets.map((ticket) => {
                const badge = STATUS_BADGE[ticket.status] || STATUS_BADGE.open;
                const prio = PRIORITY_BADGE[ticket.priority] || PRIORITY_BADGE.normal;
                return (
                  <div key={ticket.id} className="px-6 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                            {badge.icon}
                            {badge.label}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${prio.className}`}>
                            {prio.label}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 truncate">{ticket.subject}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {ticket.companyName} · {timeAgo(ticket.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
              Nenhum chamado registado.
            </div>
          )}
        </div>

        {/* Recent Security Activity */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              Actividade Recente de Segurança
            </h3>
            <button
              onClick={() => navigate("/admin/audit")}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              Ver todos <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          {recentAudit.length > 0 ? (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {recentAudit.map((entry) => {
                const isSuspicious = ["failed_login", "unauthorized_access", "brute_force", "suspicious_activity"].includes(entry.action_type);
                const isLogin = ["login", "logout", "failed_login"].includes(entry.action_type);
                return (
                  <div key={entry.id} className="px-6 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isSuspicious ? "bg-red-100" : isLogin ? "bg-blue-100" : "bg-slate-100"}`}>
                        {isSuspicious ? (
                          <ShieldAlert className="w-4 h-4 text-red-600" />
                        ) : isLogin ? (
                          <Activity className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-900">
                          <span className="font-medium">{entry.user_name || "Sistema"}</span>
                          {" — "}
                          <span className={`font-medium ${isSuspicious ? "text-red-600" : "text-slate-600"}`}>
                            {entry.action_type?.replace(/_/g, " ")}
                          </span>
                        </p>
                        {entry.company_name && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Empresa: {entry.company_name}
                          </p>
                        )}
                        {entry.details && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {entry.details}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">
                          {timeAgo(entry.happened_at)}
                          {entry.ip_address && ` · ${entry.ip_address}`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
              Nenhuma actividade registada.
            </div>
          )}
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-semibold text-slate-900 mb-4">Acesso Rápido</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Empresas", icon: <Building2 className="w-5 h-5" />, path: "/admin-companies", color: "text-teal-600 bg-teal-50 hover:bg-teal-100" },
            { label: "Assinaturas", icon: <CreditCard className="w-5 h-5" />, path: "/admin-microcredito", color: "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" },
            { label: "Monitoramento", icon: <Activity className="w-5 h-5" />, path: "/admin/monitoring", color: "text-purple-600 bg-purple-50 hover:bg-purple-100" },
            { label: "Suporte", icon: <HeadphonesIcon className="w-5 h-5" />, path: "/admin/support", color: "text-rose-600 bg-rose-50 hover:bg-rose-100" },
            { label: "Segurança", icon: <ShieldAlert className="w-5 h-5" />, path: "/admin/security", color: "text-red-600 bg-red-50 hover:bg-red-100" },
            { label: "Auditoria", icon: <FileText className="w-5 h-5" />, path: "/admin/audit", color: "text-blue-600 bg-blue-50 hover:bg-blue-100" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 transition-all hover:shadow-md ${item.color}`}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}