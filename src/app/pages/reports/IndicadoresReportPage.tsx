import { useState, useEffect } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients } from "../../lib/clients";

export default function IndicadoresReportPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.relatorios");
  const [clients, setClients] = useState<{ name: string; income: number; debt: number; score: number; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    fetchClients().then((data) => { if (!ignore) { setClients(data.map((c) => ({ name: c.name, income: c.monthlyIncome || 0, debt: c.debt || 0, score: c.score, status: c.status }))); setLoading(false); } }).catch(() => setLoading(false));
    return () => { ignore = true; };
  }, []);

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const inadimplentes = clients.filter((c) => c.status !== "active").length;
  const taxaInadimplencia = clients.length > 0 ? ((inadimplentes / clients.length) * 100).toFixed(1) : "0.0";
  const rendaMedia = clients.length > 0 ? Math.round(clients.reduce((s, c) => s + c.income, 0) / clients.length) : 0;
  const dividaMedia = clients.length > 0 ? Math.round(clients.reduce((s, c) => s + c.debt, 0) / clients.length) : 0;
  const rentabilidade = rendaMedia > 0 ? ((rendaMedia - dividaMedia) / rendaMedia * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-lg"><BarChart3 className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Indicadores</h1><p className="text-sm text-slate-500">KPIs, inadimplência e rentabilidade</p></div>
      </div>
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />A calcular indicadores reais...</div>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Total Clientes</p><p className="text-2xl font-bold text-slate-800 mt-1">{clients.length}</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Taxa Inadimplência</p><p className="text-2xl font-bold text-red-600 mt-1">{taxaInadimplencia}%</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Renda Média</p><p className="text-2xl font-bold text-emerald-600 mt-1">{rendaMedia.toLocaleString("pt-PT")} MT</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Rentabilidade</p><p className="text-2xl font-bold text-indigo-600 mt-1">{rentabilidade}%</p></div>
      </div>
      {inadimplentes > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-red-700">
          <BarChart3 className="w-5 h-5" /><span><strong>{inadimplentes} cliente(s)</strong> em situação de alerta. Taxa de inadimplência de <strong>{taxaInadimplencia}%</strong>.</span>
        </div>
      )}
    </div>
  );
}