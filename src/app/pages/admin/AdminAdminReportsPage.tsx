import { useCallback, useEffect, useState } from "react";
import { FileBarChart, Building2, CreditCard, DollarSign, Activity, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

function formatMoney(v: number) { return `${Number(v || 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2 })} MT`; }

export default function AdminAdminReportsPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);
  const [stats, setStats] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try { setLoading(true);
      const [sData, cData] = await Promise.all([
        apiFetch<any>("/admin/payments/stats"),
        apiFetch<{ companies: any[] }>("/admin/payments/companies"),
      ]);
      setStats(sData);
      setCompanies(cData.companies || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) { navigate("/", { replace: true }); return; }
    void loadData();
  }, [isCentralAdmin, loadData, navigate]);

  const activeCount = companies.filter(c => c.subscriptionStatus === "active").length;
  const graceCount = companies.filter(c => c.subscriptionStatus === "grace").length;
  const expiredCount = companies.filter(c => c.subscriptionStatus === "expired" || c.subscriptionStatus === "inactive").length;
  const totalRevenue = companies.reduce((s, c) => s + Number(c.totalPaid || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><FileBarChart className="w-5 h-5 text-white" /></div>Relatórios</h1><p className="text-slate-500 mt-1">Relatórios estratégicos da plataforma: empresas, assinaturas, pagamentos e crescimento.</p></div>
        <Button variant="outline" onClick={() => void loadData()}><RefreshCw className="w-4 h-4 mr-2" /> Actualizar</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Building2 className="w-5 h-5 text-blue-600" /></div><div><p className="text-xs text-slate-500">Empresas</p><p className="text-xl font-bold">{companies.length}</p></div></div></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><CreditCard className="w-5 h-5 text-emerald-600" /></div><div><p className="text-xs text-slate-500">Activas</p><p className="text-xl font-bold text-emerald-700">{activeCount}</p></div></div></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><Building2 className="w-5 h-5 text-red-600" /></div><div><p className="text-xs text-slate-500">Expiradas</p><p className="text-xl font-bold text-red-700">{expiredCount}</p></div></div></div>
        <div className="bg-white rounded-xl border border-slate-200 p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center"><DollarSign className="w-5 h-5 text-teal-600" /></div><div><p className="text-xs text-slate-500">Receita Total</p><p className="text-xl font-bold text-teal-700">{formatMoney(totalRevenue)}</p></div></div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Distribuição de Assinaturas</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Activas</span><span className="text-sm font-bold text-emerald-700">{activeCount}</span></div>
            <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${companies.length ? (activeCount/companies.length)*100 : 0}%` }} /></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Carência</span><span className="text-sm font-bold text-amber-700">{graceCount}</span></div>
            <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-amber-500 rounded-full" style={{ width: `${companies.length ? (graceCount/companies.length)*100 : 0}%` }} /></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Expiradas/Inactivas</span><span className="text-sm font-bold text-red-700">{expiredCount}</span></div>
            <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-red-500 rounded-full" style={{ width: `${companies.length ? (expiredCount/companies.length)*100 : 0}%` }} /></div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Receita por Empresa</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {companies.filter(c => Number(c.totalPaid) > 0).slice(0, 10).map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-700">{c.name}</span>
                <span className="text-sm font-medium text-teal-700">{formatMoney(c.totalPaid)}</span>
              </div>
            ))}
            {companies.filter(c => Number(c.totalPaid) > 0).length === 0 && <p className="text-sm text-slate-500 text-center py-4">Nenhum pagamento registado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}