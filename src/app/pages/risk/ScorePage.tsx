import { useState, useEffect } from "react";
import { TrendingUp, Search, RefreshCcw, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients, type ClientSummary } from "../../lib/clients";

export default function ScorePage() {
  const user = getUser();
  const canView = hasPermission(user, "consultar.risco");
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let ignore = false;
    fetchClients().then((data) => { if (!ignore) { setClients(data); setLoading(false); } }).catch(() => setLoading(false));
    return () => { ignore = true; };
  }, []);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const getClassificacao = (score: number) => {
    if (score >= 700) return { label: "Baixo Risco", color: "bg-emerald-100 text-emerald-700" };
    if (score >= 500) return { label: "Médio Risco", color: "bg-amber-100 text-amber-700" };
    return { label: "Alto Risco", color: "bg-red-100 text-red-700" };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg"><TrendingUp className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Score de Crédito</h1><p className="text-sm text-slate-500">Avaliação automática do risco do cliente</p></div>
        </div>
        <button onClick={() => alert("Score recalculado para todos os clientes.")} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
          <RefreshCcw className="w-4 h-4" />Recalcular Score
        </button>
      </div>
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />A carregar...</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase tracking-wider">Baixo Risco (&ge;700)</p><p className="text-2xl font-bold text-emerald-600 mt-1">{clients.filter((c) => c.score >= 700).length}</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase tracking-wider">Médio Risco (500-699)</p><p className="text-2xl font-bold text-amber-600 mt-1">{clients.filter((c) => c.score >= 500 && c.score < 700).length}</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase tracking-wider">Alto Risco ({'<'}500)</p><p className="text-2xl font-bold text-red-600 mt-1">{clients.filter((c) => c.score < 500).length}</p></div>
      </div>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500" /></div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Cliente</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Tipo</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Score</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Classificação</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const cls = getClassificacao(c.score);
              return (<tr key={c.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{c.name}</td><td className="px-4 py-3 text-slate-600 capitalize">{c.type}</td>
                <td className="px-4 py-3 text-center"><span className="text-lg font-bold text-slate-800">{c.score}</span><span className="text-xs text-slate-400">/1000</span></td>
                <td className="px-4 py-3 text-center"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${cls.color}`}>{cls.label}</span></td>
                <td className="px-4 py-3 text-right"><span className={`text-xs font-medium ${c.status === "active" ? "text-emerald-600" : c.status === "warning" ? "text-amber-600" : "text-red-600"}`}>{c.status}</span></td></tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}