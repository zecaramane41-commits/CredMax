import { useState } from "react";
import { Calendar, Plus, Search, Pencil } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

type DiaCalendario = { id: number; data: string; descricao: string; tipo: string };

export default function CalendarioFinanceiroPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.parametros.negocio");
  const [search, setSearch] = useState("");
  const [dias, setDias] = useState<DiaCalendario[]>([]);
  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const filtered = dias.filter((d) => d.descricao.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-xl shadow-lg"><Calendar className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Calendário Financeiro</h1><p className="text-sm text-slate-500">Dias úteis e feriados</p></div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Plus className="w-4 h-4" />Novo Dia</button>
      </div>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar dia..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhum dia cadastrado</h3>
          <p className="text-slate-500 max-w-md mx-auto">Os dias serão carregados a partir do sistema.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Data</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Descrição</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Tipo</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => (<tr key={d.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{d.data}</td><td className="px-4 py-3 text-slate-600">{d.descricao}</td><td className="px-4 py-3"><span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{d.tipo}</span></td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}