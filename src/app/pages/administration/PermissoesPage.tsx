import { useState, useEffect, useCallback } from "react";
import { Lock, Plus, Search, Shield, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";

type Permissao = { id: number; nome: string; modulo: string; descricao: string };

export default function PermissoesPage() {
  const user = getUser();
  const canManage = hasPermission(user, "gerir.permissoes");
  const [search, setSearch] = useState("");
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const loadPermissoes = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<{ catalog: string[]; defaults: string[] }>("/users/permissions/catalog");
      setPermissoes(data.catalog.map((nome, index) => ({
        id: index + 1,
        nome,
        modulo: "Sistema",
        descricao: `Permissão para ${nome}`,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar permissões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPermissoes();
  }, [loadPermissoes]);

  const filtered = permissoes.filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()));
  const modulos = [...new Set(permissoes.map((p) => p.modulo))];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg">
          <Lock className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Permissões</h1>
          <p className="text-sm text-slate-500">Definição de acessos</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar permissão..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Plus className="w-4 h-4" />Nova Permissão</button>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-slate-400 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhuma permissão cadastrada</h3>
          <p className="text-slate-500 max-w-md mx-auto">As permissões serão carregadas a partir do sistema.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {modulos.map((modulo) => {
            const perms = filtered.filter((p) => p.modulo === modulo);
            if (!perms.length) return null;
            return (
              <div key={modulo}>
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-indigo-500" />{modulo}</h3>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3 text-left font-medium text-slate-600">Permissão</th><th className="px-4 py-3 text-left font-medium text-slate-600">Descrição</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {perms.map((p) => (<tr key={p.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-mono text-xs font-medium text-indigo-700 bg-indigo-50/50">{p.nome}</td><td className="px-4 py-3 text-slate-600">{p.descricao}</td></tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}