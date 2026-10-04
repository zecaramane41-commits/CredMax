import { useCallback, useEffect, useState } from "react";
import { ScrollText, Plus, Search, CheckCircle, XCircle, Edit3, Loader2, AlertTriangle, Gauge } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { getCarteirasRisco, type RiscoCarteira } from "../../lib/carteiras";

type Regra = { id: number; nome: string; descricao: string; limite: string; ativa: boolean; prioridade: string };

export default function RegrasRiscoPage() {
  const user = getUser();
  const canManage = hasPermission(user, "gerir.regras.risco");
  const [search, setSearch] = useState("");
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Regra | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", limite: "", prioridade: "Media" });
  const [riscoItems, setRiscoItems] = useState<RiscoCarteira[]>([]);
  const [riscoAlerts, setRiscoAlerts] = useState<Array<{ severity: string; code: string; message: string; manager?: string }>>([]);
  const [riscoLoading, setRiscoLoading] = useState(false);

  const filtered = regras.filter(
    (r) =>
      r.nome.toLowerCase().includes(search.toLowerCase()) ||
      r.descricao.toLowerCase().includes(search.toLowerCase()),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ items: Regra[] }>("/risk/rules");
      setRegras(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar regras de risco.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRisco = useCallback(async () => {
    setRiscoLoading(true);
    try {
      const data = await getCarteirasRisco();
      setRiscoItems(data.items || []);
      setRiscoAlerts(data.alerts || []);
    } catch {
      setRiscoItems([]);
      setRiscoAlerts([]);
    } finally {
      setRiscoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) { load(); loadRisco(); }
  }, [canManage, load, loadRisco]);

  const toggleRegra = async (r: Regra) => {
    setError("");
    setMessage("");
    try {
      await apiFetch(`/risk/rules/${r.id}`, { method: "PUT", body: JSON.stringify({ ativa: !r.ativa }) });
      setMessage(`Regra "${r.nome}" ${!r.ativa ? "ativada" : "desativada"}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar regra.");
    }
  };

  const openNew = () => { setEditing(null); setForm({ nome: "", descricao: "", limite: "", prioridade: "Media" }); setFormOpen(true); };
  const openEdit = (r: Regra) => { setEditing(r); setForm({ nome: r.nome, descricao: r.descricao, limite: r.limite, prioridade: r.prioridade }); setFormOpen(true); };

  const submitForm = async () => {
    if (!form.nome.trim()) { setError("Nome da regra é obrigatório."); return; }
    setError("");
    try {
      if (editing) {
        await apiFetch(`/risk/rules/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        setMessage("Regra atualizada.");
      } else {
        await apiFetch("/risk/rules", { method: "POST", body: JSON.stringify({ ...form, ativa: true }) });
        setMessage("Regra criada.");
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao guardar regra.");
    }
  };

  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg"><ScrollText className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Regras de Risco</h1><p className="text-sm text-slate-500">Políticas de concessão de crédito — {regras.length} regras</p></div>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"><Plus className="w-4 h-4" />Nova Regra</button>
      </div>
      {formOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-slate-700">{editing ? "Editar regra" : "Nova regra de risco"}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome da regra *" className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
            <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descrição" className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
            <input value={form.limite} onChange={(e) => setForm({ ...form, limite: e.target.value })} placeholder="Limite (ex: Score ≥ 500)" className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
            <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} className="h-10 px-3 rounded-lg border border-slate-300 text-sm">
              <option value="Alta">Alta</option><option value="Media">Média</option><option value="Baixa">Baixa</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={submitForm} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Guardar</button>
            <button onClick={() => setFormOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200">Cancelar</button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="font-medium text-slate-800 flex items-center gap-2"><Gauge className="w-4 h-4 text-red-600" />Rácios de Risco por Carteira</h2>
          {riscoLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        {riscoAlerts.length > 0 && (
          <div className="px-5 pt-3 space-y-2">
            {riscoAlerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${a.severity === "critical" ? "border-red-300 bg-red-50 text-red-800" : a.severity === "high" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-yellow-300 bg-yellow-50 text-yellow-800"}`}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{a.message}</span>
              </div>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="px-4 py-3 text-left font-medium text-slate-600">Carteira</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Gestor</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Saldo (MT)</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">% Mora</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">PAR30</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">NPL90</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Recuperação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {riscoItems.map((r) => (
                <tr key={r.carteiraId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{r.carteiraName}</td>
                  <td className="px-4 py-3 text-slate-600">{r.gestorName}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.outstanding.toLocaleString("pt-MZ", { minimumFractionDigits: 2 })}</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.taxaMora >= 10 ? "text-red-600" : "text-slate-700"}`}>{r.taxaMora.toFixed(2)}%</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.par30 >= 10 ? "text-red-600" : "text-slate-700"}`}>{r.par30.toFixed(2)}%</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.npl90 >= 5 ? "text-red-600" : "text-slate-700"}`}>{r.npl90.toFixed(2)}%</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.recoveryRate < 70 ? "text-amber-600" : "text-emerald-600"}`}>{r.recoveryRate.toFixed(2)}%</td>
                </tr>
              ))}
              {riscoItems.length === 0 && !riscoLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Sem carteiras com dados de risco.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />A carregar regras...</p>}
      {!loading && (
        <>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar regra..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-800">{r.nome}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.prioridade === "Alta" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{r.prioridade}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.descricao}</p>
                  <p className="text-xs text-indigo-600 font-medium mt-0.5">{r.limite}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleRegra(r)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${r.ativa ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    {r.ativa ? <><CheckCircle className="w-3.5 h-3.5 inline mr-1" />Ativa</> : <><XCircle className="w-3.5 h-3.5 inline mr-1" />Inativa</>}
                  </button>
                  {canManage && <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><Edit3 className="w-4 h-4" /></button>}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-center text-slate-400 py-8">Sem regras de risco registadas.</p>}
          </div>
        </>
      )}
    </div>
  );
}