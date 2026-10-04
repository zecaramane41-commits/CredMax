import { useEffect, useState } from "react";
import { BookOpen, Search, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";

type Lancamento = { id: number; data: string; descricao: string; conta: string; debito: number; credito: number; tipo: string };

function todayIso() { return new Date().toISOString().slice(0, 10); }
function firstDayOfCurrentMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }

export default function ContabilidadePage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.financeiro");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(firstDayOfCurrentMonth());
  const [to, setTo] = useState(todayIso());
  const [lines, setLines] = useState<Lancamento[]>([]);
  const [totals, setTotals] = useState({ totalDebito: 0, totalCredito: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<any>(`/accounting/ledger?from=${from}&to=${to}&pageSize=300`);
        if (cancelled) return;
        const items: Lancamento[] = (data.lines || []).map((line: any) => ({
          id: line.lineId,
          data: String(line.entryDate || "").slice(0, 10),
          descricao: line.description || "",
          conta: `${line.accountCode || ""}${line.accountName ? ` - ${line.accountName}` : ""}`,
          debito: Number(line.debit || 0),
          credito: Number(line.credit || 0),
          tipo: line.eventType || "-",
        }));
        setLines(items);
        setTotals({ totalDebito: Number(data.totals?.totalDebit || 0), totalCredito: Number(data.totals?.totalCredit || 0) });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar razão contábil.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canView, from, to]);

  const filtered = lines.filter((l) => l.descricao.toLowerCase().includes(search.toLowerCase()) || l.conta.toLowerCase().includes(search.toLowerCase()));

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">De<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 h-10 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label className="text-xs text-slate-500">Até<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 h-10 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />A carregar lançamentos...</p>}
      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Total Débito</p><p className="text-2xl font-bold text-emerald-600 mt-1">{totals.totalDebito.toLocaleString("pt-PT")} MT</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Total Crédito</p><p className="text-2xl font-bold text-red-600 mt-1">{totals.totalCredito.toLocaleString("pt-PT")} MT</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Lançamentos</p><p className="text-2xl font-bold text-indigo-600 mt-1">{lines.length}</p></div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Data</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Descrição</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Conta</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Débito</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Crédito</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Tipo</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((l) => (<tr key={l.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500 text-xs">{l.data}</td><td className="px-4 py-3 font-medium text-slate-700">{l.descricao}</td><td className="px-4 py-3 text-slate-600 text-xs">{l.conta}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{l.debito > 0 ? `${l.debito.toLocaleString("pt-PT")} MT` : "-"}</td>
                  <td className="px-4 py-3 text-right text-red-600">{l.credito > 0 ? `${l.credito.toLocaleString("pt-PT")} MT` : "-"}</td>
                  <td className="px-4 py-3 text-center"><span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{l.tipo}</span></td></tr>))}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sem lançamentos no período.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-lg"><BookOpen className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Contabilidade</h1><p className="text-sm text-slate-500">Razão contabilístico de todas as operações</p></div>
      </div>

