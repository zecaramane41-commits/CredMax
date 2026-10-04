import { useState } from "react";
import { Gauge, Plus, Search, Pencil } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

type Limite = { id: number; nome: string; valorMax: string; unidade: string; categoria: string; ativo: boolean };

export default function LimitesPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.parametros.negocio");
  const [search, setSearch] = useState("");
  const [limites, setLimites] = useState<Limite[]>([]);
  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const filtered = limites.filter((l) => l.nome.toLowerCase().includes(search.toLowerCase()));
  const toggleAtivo = (id: number) => setLimites((prev) => prev.map((l) => l.id === id ? { ...l, ativo: !l.ativo } : l));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg"><Gauge className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Limites</h1><p className="text-sm text-slate-500">Limites operacionais do sistema</p></div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Plus className="w-4 h-4" />Novo Limite</button>
      </div>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar limite..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Gauge className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhum limite cadastrado</h3>
          <p className="text-slate-500 max-w-md mx-auto">Os limites serão carregados a partir do sistema.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Nome</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Valor Máximo</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Categoria</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Status</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Ações</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((l) => (<tr key={l.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{l.nome}</td><td className="px-4 py-3 text-slate-600">{l.valorMax} {l.unidade}</td><td className="px-4 py-3 text-slate-600">{l.categoria}</td><td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${l.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{l.ativo ? "Ativo" : "Inativo"}</span></td><td className="px-4 py-3 text-right"><button onClick={() => toggleAtivo(l.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 mr-1">{l.ativo ? "Desativar" : "Ativar"}</button><button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200"><Pencil className="w-3 h-3 inline mr-1" />Editar</button></td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}