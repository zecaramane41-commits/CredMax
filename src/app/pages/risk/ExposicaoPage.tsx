import { useState, useEffect } from "react";
import { Gauge, Search, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients } from "../../lib/clients";

export default function ExposicaoPage() {
  const user = getUser();
  const canView = hasPermission(user, "consultar.risco");
  const [clients, setClients] = useState<{ name: string; type: string; debt: number; income: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let ignore = false;
    fetchClients().then((data) => { if (!ignore) { setClients(data.map((c) => ({ name: c.name, type: c.type, debt: c.debt || 0, income: c.monthlyIncome || 0 }))); setLoading(false); } }).catch(() => setLoading(false));
    return () => { ignore = true; };
  }, []);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const totalExposicao = clients.reduce((s, c) => s + c.debt, 0);
  const totalRenda = clients.reduce((s, c) => s + c.income, 0);

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg"><Gauge className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Exposição</h1><p className="text-sm text-slate-500">Monitoramento do risco financeiro da instituição</p></div>
      </div>
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />A carregar...</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase tracking-wider">Exposição Total</p><p className="text-2xl font-bold text-slate-800 mt-1">{totalExposicao.toLocaleString("pt-PT")} MT</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase tracking-wider">Renda Total</p><p className="text-2xl font-bold text-emerald-600 mt-1">{totalRenda.toLocaleString("pt-PT")} MT</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase tracking-wider">Rácio Dívida/Renda</p><p className="text-2xl font-bold text-amber-600 mt-1">{totalRenda > 0 ? (totalExposicao / totalRenda).toFixed(2) : "0.00"}x</p></div>
      </div>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Cliente</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Tipo</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Dívida</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Renda</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">% Exposição</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c, i) => {
              const pct = totalExposicao > 0 ? (c.debt / totalExposicao * 100) : 0;
              return (<tr key={i} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{c.name}</td><td className="px-4 py-3 text-slate-600 capitalize">{c.type}</td>
                <td className="px-4 py-3 text-right text-slate-700">{c.debt.toLocaleString("pt-PT")} MT</td><td className="px-4 py-3 text-right text-slate-700">{c.income.toLocaleString("pt-PT")} MT</td>
                <td className="px-4 py-3 text-center"><div className="flex items-center gap-2 justify-center"><div className="w-20 bg-slate-200 rounded-full h-2"><div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} /></div><span className="text-xs font-medium text-slate-600">{pct.toFixed(1)}%</span></div></td></tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}