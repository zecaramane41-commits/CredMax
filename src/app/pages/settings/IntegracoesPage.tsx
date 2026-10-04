import { useState, useEffect, useCallback } from "react";
import { Link, Plus, Search, Pencil, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";

type Integracao = { id: number; nome: string; url: string; tipo: string; ativo: boolean };

export default function IntegracoesPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.configuracoes.sistema");
  const [search, setSearch] = useState("");
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const loadIntegracoes = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<{ connectors: Array<{ id: number; providerCode: string; isEnabled: boolean; status: string; lastSyncAt: string }> }>("/integrations/connectors");
      setIntegracoes(data.connectors.map((c) => ({
        id: c.id,
        nome: c.providerCode,
        url: "",
        tipo: c.providerCode,
        ativo: c.isEnabled,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar integrações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntegracoes();
  }, [loadIntegracoes]);

  const filtered = integracoes.filter((i) => i.nome.toLowerCase().includes(search.toLowerCase()));
  const toggleAtivo = async (id: number) => {
    try {
      const integracao = integracoes.find((i) => i.id === id);
      if (!integracao) return;
      const newStatus = !integracao.ativo;
      await apiFetch(`/integrations/connectors/${integracao.tipo}`, {
        method: "PUT",
        body: JSON.stringify({ isEnabled: newStatus }),
      });
      setIntegracoes((prev) => prev.map((i) => i.id === id ? { ...i, ativo: newStatus } : i));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar status.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg"><Link className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Integrações</h1><p className="text-sm text-slate-500">APIs e serviços externos</p></div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Plus className="w-4 h-4" />Nova Integração</button>
      </div>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar integração..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-slate-400 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Link className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhuma integração cadastrada</h3>
          <p className="text-slate-500 max-w-md mx-auto">As integrações serão carregadas a partir do sistema.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Nome</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">URL</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Tipo</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Status</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Ações</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (<tr key={i.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{i.nome}</td><td className="px-4 py-3 text-slate-600 text-xs">{i.url}</td><td className="px-4 py-3 text-slate-600">{i.tipo}</td><td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${i.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{i.ativo ? "Ativa" : "Inativa"}</span></td><td className="px-4 py-3 text-right"><button onClick={() => toggleAtivo(i.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 mr-1">{i.ativo ? "Desativar" : "Ativar"}</button><button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200"><Pencil className="w-3 h-3 inline mr-1" />Editar</button></td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}