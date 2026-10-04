import { useState } from "react";
import { Building2, Plus, Search, Users } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

type Departamento = { id: number; nome: string; responsavel: string; quantidade: number; ativo: boolean };

export default function DepartamentosPage() {
  const user = getUser();
  const canManage = hasPermission(user, "gerir.perfis");
  const [search, setSearch] = useState("");
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const filtered = departamentos.filter((d) => d.nome.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg"><Building2 className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Departamentos</h1><p className="text-sm text-slate-500">Estrutura organizacional</p></div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Plus className="w-4 h-4" />Novo Departamento</button>
      </div>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar departamento..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhum departamento cadastrado</h3>
          <p className="text-slate-500 max-w-md mx-auto">Os departamentos serão carregados a partir do sistema.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Nome</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Responsável</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Usuários</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => (<tr key={d.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{d.nome}</td><td className="px-4 py-3 text-slate-600">{d.responsavel}</td><td className="px-4 py-3 text-center"><Users className="w-3.5 h-3.5 inline mr-1 text-slate-400" />{d.quantidade}</td><td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${d.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{d.ativo ? "Ativo" : "Inativo"}</span></td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}