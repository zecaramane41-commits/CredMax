import { useCallback, useEffect, useState } from "react";
import { ScrollText, RefreshCw, Search, Filter, LogIn } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

function formatPtDateTime(d: string | null) { if (!d) return "-"; return new Date(d).toLocaleString("pt-MZ"); }

export default function AdminAuditPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);
  const [entries, setEntries] = useState<any[]>([]);
  const [loginEntries, setLoginEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"actions" | "login">("actions");
  const [actionFilter, setActionFilter] = useState("all");

  const loadData = useCallback(async () => {
    try { setLoading(true);
      const params = actionFilter !== "all" ? `?action=${actionFilter}` : "";
      const data = await apiFetch<{ entries: any[] }>(`/admin/audit${params}`);
      const loginData = await apiFetch<{ entries: any[] }>("/admin/audit/login-history");
      setEntries(data.entries || []);
      setLoginEntries(loginData.entries || []);
    } catch {} finally { setLoading(false); }
  }, [actionFilter]);

  useEffect(() => {
    if (!isCentralAdmin) { navigate("/", { replace: true }); return; }
    void loadData();
  }, [isCentralAdmin, loadData, navigate]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div><h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center"><ScrollText className="w-5 h-5 text-white" /></div>Auditoria</h1><p className="text-slate-500 mt-1">Registo de ações, histórico de login e rastreabilidade.</p></div>

      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'actions' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => setActiveTab("actions")}>Registo de Ações</button>
        <button className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'login' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => setActiveTab("login")}>Histórico de Login</button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void loadData()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {activeTab === "actions" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">Todas as ações</option>
              <option value="LOGIN">Login</option>
              <option value="CREATE">Criação</option>
              <option value="UPDATE">Actualização</option>
              <option value="DELETE">Remoção</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
            <table className="w-full">
              <thead><tr className="bg-gradient-to-r from-slate-50 to-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Data/Hora</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Ação</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Utilizador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Módulo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Recurso</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">IP</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Status</th>
              </tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7} className="px-4 py-12 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></td></tr>
                : entries.map((e, i) => (
                  <tr key={e.id || i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-500">{formatPtDateTime(e.happened_at)}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100">{e.action_type}</span></td>
                    <td className="px-4 py-3 text-sm">{e.actor_name || "-"}</td>
                    <td className="px-4 py-3 text-sm">{e.module_name || "-"}</td>
                    <td className="px-4 py-3 text-sm">{e.resource_type || "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{e.ip_address || "-"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.response_status < 400 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{e.response_status}</span></td>
                  </tr>
                ))}
                {!loading && entries.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Nenhum registo encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "login" && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
          <table className="w-full">
            <thead><tr className="bg-gradient-to-r from-slate-50 to-slate-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Data/Hora</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Utilizador</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Sucesso</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Motivo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">IP</th>
            </tr></thead>
            <tbody>
              {loginEntries.map((e, i) => (
                <tr key={e.id || i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-500">{formatPtDateTime(e.occurred_at)}</td>
                  <td className="px-4 py-3 text-sm">{e.email}</td>
                  <td className="px-4 py-3 text-sm">{e.user_name || "-"}</td>
                  <td className="px-4 py-3">{e.success ? <span className="text-emerald-600 text-xs font-medium">Sim</span> : <span className="text-red-600 text-xs font-medium">Não</span>}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{e.failure_reason || "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{e.ip_address || "-"}</td>
                </tr>
              ))}
              {loginEntries.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">Nenhum registo de login encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}