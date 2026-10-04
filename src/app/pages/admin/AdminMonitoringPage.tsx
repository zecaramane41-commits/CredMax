import { useCallback, useEffect, useState } from "react";
import { Monitor, Activity, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

function formatPtDateTime(d: string | null) { if (!d) return "-"; return new Date(d).toLocaleString("pt-MZ"); }

export default function AdminMonitoringPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);
  const [companies, setCompanies] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try { setLoading(true);
      const [cData, sData] = await Promise.all([
        apiFetch<{ companies: any[] }>("/admin/monitoring"),
        apiFetch<any>("/admin/monitoring/summary"),
      ]);
      setCompanies(cData.companies || []);
      setSummary(sData || {});
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) { navigate("/", { replace: true }); return; }
    void loadData();
  }, [isCentralAdmin, loadData, navigate]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-white" />
            </div>
            Monitoramento
          </h1>
          <p className="text-slate-500 mt-1">Monitora a utilização da plataforma pelas empresas sem acessar seus dados privados.</p>
        </div>
        <Button variant="outline" onClick={() => void loadData()}><RefreshCw className="w-4 h-4 mr-2" /> Actualizar</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Total</p><p className="text-xl font-bold">{summary.total_companies || 0}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Activas</p><p className="text-xl font-bold text-emerald-700">{summary.active_companies || 0}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Inactivas</p><p className="text-xl font-bold text-red-700">{summary.inactive_companies || 0}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Assinaturas Activas</p><p className="text-xl font-bold text-blue-700">{summary.active_subscriptions || 0}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-xs text-slate-500">Assinaturas Expiradas</p><p className="text-xl font-bold text-red-700">{summary.expired_subscriptions || 0}</p></div>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full">
          <thead><tr className="bg-gradient-to-r from-slate-50 to-slate-100">
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Empresa</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Estado</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Utilizadores</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Clientes</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Créditos</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Último Acesso</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="px-5 py-12 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></td></tr>
            : companies.map(c => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="px-5 py-3">{c.is_active ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Activa</span> : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Inactiva</span>}</td>
                <td className="px-5 py-3">{c.users_count || 0}</td>
                <td className="px-5 py-3">{c.clients_count || 0}</td>
                <td className="px-5 py-3">{c.loans_count || 0}</td>
                <td className="px-5 py-3 text-sm text-slate-500">{formatPtDateTime(c.last_login_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}