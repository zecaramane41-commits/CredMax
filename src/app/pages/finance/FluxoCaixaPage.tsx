import { useEffect, useState } from "react";
import { ArrowUpDown, Search, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";

type Movimento = { id: number; descricao: string; tipo: "entrada" | "saida"; valor: number; data: string; categoria: string };

const INFLOW_EVENTS = new Set(["pagamento", "mora", "capitalizacao"]);

function todayIso() { return new Date().toISOString().slice(0, 10); }
function firstDayOfCurrentMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }

export default function FluxoCaixaPage() {
  const user = getUser();
  const canManage = hasPermission(user, "visualizar.financeiro");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(firstDayOfCurrentMonth());
  const [to, setTo] = useState(todayIso());
  const [movements, setMovements] = useState<Movimento[]>([]);
  const [summary, setSummary] = useState({ cashIn: 0, cashOut: 0, netCash: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<any>(`/accounting/cash-flow/overview?from=${from}&to=${to}`);
        if (cancelled) return;
        setSummary({
          cashIn: Number(data.summary?.cashIn || 0),
          cashOut: Number(data.summary?.cashOut || 0),
          netCash: Number(data.summary?.netCash || 0),
        });
        setMovements(
          (data.recentMovements || []).map((row: any) => {
            const isInflow = INFLOW_EVENTS.has(String(row.eventType || ""));
            return {
              id: row.id,
              descricao: row.description || "-",
              tipo: (isInflow ? "entrada" : "saida") as "entrada" | "saida",
              valor: isInflow ? Number(row.creditTotal || row.debitTotal || 0) : Number(row.debitTotal || row.creditTotal || 0),
              data: String(row.entryDate || "").slice(0, 10),
              categoria: row.eventType || "-",
            };
          }),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar fluxo de caixa.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canManage, from, to]);

  const filtered = movements.filter((m) => m.descricao.toLowerCase().includes(search.toLowerCase()));

  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;



  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg"><ArrowUpDown className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Fluxo de Caixa</h1><p className="text-sm text-slate-500">Controlo de entradas e saídas financeiras</p></div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">De<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 h-10 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label className="text-xs text-slate-500">Até<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 h-10 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />A carregar movimentos...</p>}
      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Saldo do Período</p><p className={`text-2xl font-bold mt-1 ${summary.netCash >= 0 ? "text-emerald-600" : "text-red-600"}`}>{summary.netCash.toLocaleString("pt-PT")} MT</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Total Entradas</p><p className="text-2xl font-bold text-emerald-600 mt-1">{summary.cashIn.toLocaleString("pt-PT")} MT</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Total Saídas</p><p className="text-2xl font-bold text-red-600 mt-1">{summary.cashOut.toLocaleString("pt-PT")} MT</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Movimentos</p><p className="text-2xl font-bold text-indigo-600 mt-1">{movements.length}</p></div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Descrição</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Categoria</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Tipo</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Valor</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Data</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => (<tr key={m.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{m.descricao}</td><td className="px-4 py-3 text-slate-600">{m.categoria}</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${m.tipo === "entrada" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{m.tipo}</span></td>
                  <td className={`px-4 py-3 text-right font-medium ${m.tipo === "entrada" ? "text-emerald-600" : "text-red-600"}`}>{m.tipo === "entrada" ? "+" : "-"}{m.valor.toLocaleString("pt-PT")} MT</td>
                  <td className="px-4 py-3 text-center text-slate-500 text-xs">{m.data}</td></tr>))}
                {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sem movimentos no período.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}