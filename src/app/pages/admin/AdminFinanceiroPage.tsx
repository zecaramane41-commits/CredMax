import { useCallback, useEffect, useState } from "react";
import { DollarSign, CreditCard, AlertTriangle, CheckCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

function formatMoney(value: number) { return `${Number(value || 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2 })} MT`; }
function formatPtDate(d: string | null) { if (!d) return "-"; const r = String(d).slice(0, 10).split("-"); return `${r[2]}/${r[1]}/${r[0]}`; }

export default function AdminFinanceiroPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadCompanies = useCallback(async () => {
    try { setLoading(true);
      const data = await apiFetch<{ companies: any[] }>("/admin/payments/companies");
      setCompanies(data.companies || []);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) { navigate("/", { replace: true }); return; }
    void loadCompanies();
  }, [isCentralAdmin, loadCompanies, navigate]);

  const activeCompanies = companies.filter(c => c.subscriptionStatus === "active");
  const graceCompanies = companies.filter(c => c.subscriptionStatus === "grace");
  const expiredCompanies = companies.filter(c => c.subscriptionStatus === "expired" || c.subscriptionStatus === "inactive");
  const totalRevenue = companies.reduce((sum, c) => sum + Number(c.totalPaid || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          Financeiro da Plataforma
        </h1>
        <p className="text-slate-500 mt-1">Controla apenas as receitas e cobranças relacionadas ao uso do sistema.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Assinaturas Activas</p><p className="text-2xl font-bold text-emerald-700 mt-1">{activeCompanies.length}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Em Carência</p><p className="text-2xl font-bold text-amber-700 mt-1">{graceCompanies.length}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Expiradas</p><p className="text-2xl font-bold text-red-700 mt-1">{expiredCompanies.length}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Total Recebido</p><p className="text-2xl font-bold text-teal-700 mt-1">{formatMoney(totalRevenue)}</p></div>
      </div>

      {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700"><CheckCircle className="w-4 h-4 inline mr-1" />{message}</div>}

      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full">
          <thead><tr className="bg-gradient-to-r from-slate-50 to-slate-100">
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Empresa</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Estado</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Expira em</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Total Pago</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Último Pagamento</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></td></tr>
            : companies.map(c => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.subscriptionStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : c.subscriptionStatus === 'grace' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  {{active: "Activa", grace: "Carência", expired: "Expirada", inactive: "Inactiva"}[c.subscriptionStatus as string] || c.subscriptionStatus}
                </span></td>
                <td className="px-5 py-3 text-sm">{formatPtDate(c.subscriptionExpiresAt)}</td>
                <td className="px-5 py-3 font-medium">{formatMoney(c.totalPaid)}</td>
                <td className="px-5 py-3 text-sm text-slate-500">{formatPtDate(c.subscriptionExpiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}