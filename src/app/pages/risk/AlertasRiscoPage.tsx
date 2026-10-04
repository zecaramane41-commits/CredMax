import { useState, useEffect } from "react";
import { Bell, Search, CheckCircle, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients } from "../../lib/clients";

type Alerta = { id: number; cliente: string; tipo: string; descricao: string; data: string; gravidade: "alta" | "media" | "baixa"; resolvido: boolean };

export default function AlertasRiscoPage() {
  const user = getUser();
  const canView = hasPermission(user, "consultar.risco");
  const [search, setSearch] = useState("");
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    fetchClients().then((data) => {
      if (!ignore) {
        const als: Alerta[] = data.filter((c) => c.status === "alert" || c.status === "warning").map((c, i) => ({
          id: 100 + i, cliente: c.name, tipo: c.status === "alert" ? "Crítico" : "Atenção",
          descricao: c.status === "alert" ? `Cliente com score ${c.score} e dívida de ${c.debt.toLocaleString("pt-PT")} MT` : `Cliente em situação de alerta (score: ${c.score})`,
          data: new Date().toLocaleDateString("pt-PT"), gravidade: c.status === "alert" ? "alta" as const : "media" as const, resolvido: false,
        }));
        setAlertas(als);
        setLoading(false);
      }
    }).catch(() => setLoading(false));
    return () => { ignore = true; };
  }, []);

  const filtered = alertas.filter((a) => a.cliente.toLowerCase().includes(search.toLowerCase()));
  const handleResolve = (id: number) => setAlertas((prev) => prev.map((a) => a.id === id ? { ...a, resolvido: true } : a));

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-lg"><Bell className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Alertas de Risco</h1><p className="text-sm text-slate-500">Situações que exigem atenção — {alertas.filter((a) => !a.resolvido).length} pendentes</p></div>
      </div>
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />A carregar...</div>}
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      <div className="space-y-2">
        {filtered.map((a) => (
          <div key={a.id} className={`bg-white border rounded-xl p-4 flex items-center justify-between transition-all ${a.resolvido ? "border-slate-200 opacity-60" : a.gravidade === "alta" ? "border-red-200 bg-red-50/30" : "border-amber-200 bg-amber-50/30"}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2"><h3 className="font-medium text-slate-800">{a.cliente}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.gravidade === "alta" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.gravidade}</span>
                <span className="text-xs text-slate-400">{a.tipo}</span></div>
              <p className="text-xs text-slate-600 mt-0.5">{a.descricao}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{a.data}</p>
            </div>
            {!a.resolvido && <button onClick={() => handleResolve(a.id)} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 transition-colors"><CheckCircle className="w-3.5 h-3.5 inline mr-1" />Resolver</button>}
            {a.resolvido && <span className="text-xs text-emerald-600 font-medium">Resolvido</span>}
          </div>
        ))}
      </div>
    </div>
  );
}