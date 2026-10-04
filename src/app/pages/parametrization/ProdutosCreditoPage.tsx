import { useState } from "react";
import { Package, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

type Produto = { id: number; nome: string; taxaJuro: string; prazoMax: string; descricao: string; ativo: boolean };

export default function ProdutosCreditoPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.parametros.negocio");
  const [search, setSearch] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const filtered = produtos.filter((p) => p.nome.toLowerCase().includes(search.toLowerCase()));
  const toggleAtivo = (id: number) => setProdutos((prev) => prev.map((p) => p.id === id ? { ...p, ativo: !p.ativo } : p));
  const remover = (id: number) => setProdutos((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg"><Package className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Produtos de Crédito</h1><p className="text-sm text-slate-500">Tipos de empréstimos disponíveis</p></div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Plus className="w-4 h-4" />Novo Produto</button>
      </div>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhum produto cadastrado</h3>
          <p className="text-slate-500 max-w-md mx-auto">Os produtos de crédito serão carregados a partir do sistema.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Nome</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Taxa Juro</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Prazo Máx.</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Status</th><th className="px-4 py-3.5 text-right font-medium text-slate-600">Ações</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (<tr key={p.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{p.nome}</td><td className="px-4 py-3 text-slate-600">{p.taxaJuro}</td><td className="px-4 py-3 text-slate-600">{p.prazoMax}</td><td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{p.ativo ? "Ativo" : "Inativo"}</span></td><td className="px-4 py-3 text-right"><button onClick={() => toggleAtivo(p.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 mr-1">{p.ativo ? "Desativar" : "Ativar"}</button><button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 mr-1"><Pencil className="w-3 h-3 inline mr-1" />Editar</button><button onClick={() => remover(p.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100"><Trash2 className="w-3 h-3 inline mr-1" />Remover</button></td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}