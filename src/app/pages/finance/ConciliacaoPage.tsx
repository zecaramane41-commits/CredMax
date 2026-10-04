import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Search, Upload, RefreshCcw, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";

type Divergencia = {
  id: number;
  postedAt: string;
  description: string;
  counterparty: string;
  matchedAmount: number | null;
  amount: number;
  difference: number | null;
  status: "conciliado" | "pendente" | "divergente";
};

export default function ConciliacaoPage() {
  const user = getUser();
  const canView = hasPermission(user, "conciliar.operacoes");
  const [items, setItems] = useState<Divergencia[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ items: Divergencia[] }>("/integrations/transactions");
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar transações externas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const runReconcile = async () => {
    setError("");
    setMessage("");
    try {
      const res = await apiFetch<any>("/integrations/reconcile", {
        method: "POST",
        body: JSON.stringify({ providerCode: "bank" }),
      });
      setMessage(`Conciliação executada: ${res?.matchedCount ?? 0} correspondências.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao executar conciliação.");
    }
  };

  const importStatement = async () => {
    setError("");
    setMessage("");
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg"><CheckCircle className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Conciliação</h1><p className="text-sm text-slate-500">Validação entre sistema e extratos bancários</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={runReconcile} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 shadow-sm disabled:opacity-50"><RefreshCcw className="w-4 h-4" />Executar Conciliação</button>
          <button onClick={() => setImportOpen(!importOpen)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Upload className="w-4 h-4" />Importar Extrato</button>
        </div>
      </div>
      {importOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-300 text-xs p-2 font-mono" placeholder='[{"externalRef":"REF1","amount":1000,"postedAt":"2026-06-15","direction":"credit","counterparty":"Cliente","description":"Pagamento"}]' />
          <button onClick={importStatement} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Importar</button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {loading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />A carregar transações...</p>}
      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Total Movimentos</p><p className="text-2xl font-bold text-slate-800 mt-1">{items.length}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Conciliados</p><p className="text-2xl font-bold text-emerald-600 mt-1">{items.filter((d) => d.status === "conciliado").length}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Pendentes / Divergentes</p><p className="text-2xl font-bold text-red-600 mt-1">{items.filter((d) => d.status !== "conciliado").length}</p></div>
          </div>
          <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Data</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Descrição</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Sistema</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Extrato</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Diferença</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => (<tr key={d.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500 text-xs">{String(d.postedAt || "").slice(0, 10)}</td><td className="px-4 py-3 text-slate-700">{d.description || d.counterparty || "-"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{d.matchedAmount === null ? "-" : `${d.matchedAmount.toLocaleString("pt-PT")} MT`}</td><td className="px-4 py-3 text-right text-slate-700">{d.amount.toLocaleString("pt-PT")} MT</td>
                  <td className={`px-4 py-3 text-right font-medium ${!d.difference ? "text-slate-400" : d.difference === 0 ? "text-emerald-600" : "text-red-600"}`}>{!d.difference ? "-" : `${Math.abs(d.difference).toLocaleString("pt-PT")} MT`}</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${d.status === "conciliado" ? "bg-emerald-100 text-emerald-700" : d.status === "divergente" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{d.status}</span></td></tr>))}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sem transações externas importadas.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

  const filtered = items.filter((d) =>
    `${d.description} ${d.counterparty}`.toLowerCase().includes(search.toLowerCase()),
  );

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-lg"><CheckCircle className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Conciliação</h1><p className="text-sm text-slate-500">Validação entre sistema e extratos bancários</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={runReconcile} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 shadow-sm disabled:opacity-50"><RefreshCcw className="w-4 h-4" />Executar Conciliação</button>
          <button onClick={() => setImportOpen(!importOpen)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Upload className="w-4 h-4" />Importar Extrato</button>
        </div>
      </div>
      {importOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-300 text-xs p-2 font-mono" placeholder='[{"externalRef":"REF1","amount":1000,"postedAt":"2026-06-15","direction":"credit","counterparty":"Cliente","description":"Pagamento"}]' />
          <button onClick={importStatement} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Importar</button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {loading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />A carregar transações...</p>}
      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Total Movimentos</p><p className="text-2xl font-bold text-slate-800 mt-1">{items.length}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Conciliados</p><p className="text-2xl font-bold text-emerald-600 mt-1">{items.filter((d) => d.status === "conciliado").length}</p></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Pendentes / Divergentes</p><p className="text-2xl font-bold text-red-600 mt-1">{items.filter((d) => d.status !== "conciliado").length}</p></div>
          </div>
          <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>


          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Data</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Descrição</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Sistema</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Extrato</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Diferença</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => (<tr key={d.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500 text-xs">{String(d.postedAt || "").slice(0, 10)}</td><td className="px-4 py-3 text-slate-700">{d.description || d.counterparty || "-"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{d.matchedAmount === null ? "-" : `${d.matchedAmount.toLocaleString("pt-PT")} MT`}</td><td className="px-4 py-3 text-right text-slate-700">{d.amount.toLocaleString("pt-PT")} MT</td>
                  <td className={`px-4 py-3 text-right font-medium ${!d.difference ? "text-slate-400" : d.difference === 0 ? "text-emerald-600" : "text-red-600"}`}>{!d.difference ? "-" : `${Math.abs(d.difference).toLocaleString("pt-PT")} MT`}</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${d.status === "conciliado" ? "bg-emerald-100 text-emerald-700" : d.status === "divergente" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{d.status}</span></td></tr>))}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sem transações externas importadas.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}