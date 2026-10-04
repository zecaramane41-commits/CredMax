import { useState, useEffect } from "react";
import { Layers, Search, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients } from "../../lib/clients";

export default function ReestruturacaoPage() {
  const user = getUser();
  const canCreate = hasPermission(user, "reestruturar.credito");
  const [clients, setClients] = useState<{ id: number; name: string; income: number; debt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [novoPrazo, setNovoPrazo] = useState(24);
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    let ignore = false;
    fetchClients().then((data) => { if (!ignore) { setClients(data.map((c) => ({ id: c.id, name: c.name, income: c.monthlyIncome || 0, debt: c.debt || 0 }))); setLoading(false); } }).catch(() => setLoading(false));
    return () => { ignore = true; };
  }, []);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const selected = clients.find((c) => c.id === selectedId);

  if (!canCreate) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg"><Layers className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Reestruturação</h1><p className="text-sm text-slate-500">Renegociação de créditos em situação especial</p></div>
      </div>
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />A carregar...</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
          {filtered.map((c) => (
            <button key={c.id} onClick={() => { setSelectedId(c.id); setJustificativa(""); }}
              className={`w-full text-left p-3 rounded-xl border transition-all ${selectedId === c.id ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className="font-medium text-slate-800 text-sm">{c.name}</div>
              <div className="text-xs text-slate-500">Dívida: {c.debt.toLocaleString("pt-PT")} MT</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <h2 className="text-lg font-semibold text-slate-800">Reestruturação — {selected.name}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Dívida Atual</p><p className="font-semibold text-slate-800">{selected.debt.toLocaleString("pt-PT")} MT</p></div>
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Renda Mensal</p><p className="font-semibold text-slate-800">{selected.income.toLocaleString("pt-PT")} MT</p></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Novo Prazo (meses)</label>
                <input type="number" value={novoPrazo} onChange={(e) => setNovoPrazo(Number(e.target.value))} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nova Prestação Estimada</label>
                <div className="bg-indigo-50 rounded-lg p-3 text-lg font-bold text-indigo-700">
                  {selected.debt > 0 ? (selected.debt * (1 + 0.05 * novoPrazo) / novoPrazo).toFixed(2) : "0.00"} MT
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Justificativa</label>
                <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="w-full h-20 px-3 py-2 rounded-lg border border-slate-300 text-sm resize-none" placeholder="Justifique a reestruturação..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { if (!justificativa.trim()) { alert("Informe a justificativa."); return; } alert(`Reestruturação criada para ${selected.name}.`); }}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm">
                  <CheckCircle className="w-4 h-4 inline mr-1" />Criar Reestruturação
                </button>
                <button onClick={() => { if (!justificativa.trim()) { alert("Informe a justificativa."); return; } alert(`Reestruturação aprovada para ${selected.name}.`); }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
                  <CheckCircle className="w-4 h-4 inline mr-1" />Aprovar
                </button>
                <button onClick={() => setSelectedId(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center"><Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">Selecione um cliente para reestruturar</p></div>
          )}
        </div>
      </div>
    </div>
  );
}