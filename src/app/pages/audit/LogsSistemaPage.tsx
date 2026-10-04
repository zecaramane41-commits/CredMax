import { useState, useEffect } from "react";
import { ScrollText, Search, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

type LogEntry = { id: number; data: string; hora: string; usuario: string; acao: string; entidade: string; detalhe: string };

export default function LogsSistemaPage() {
  const user = getUser();
  const canView = hasPermission(user, "consultar.auditoria");
  const [search, setSearch] = useState("");

  const logs: LogEntry[] = [
    { id: 1, data: "17/06/2026", hora: "08:32", usuario: "Admin", acao: "Login", entidade: "Sessão", detalhe: "Admin iniciou sessão" },
    { id: 2, data: "17/06/2026", hora: "08:35", usuario: "Admin", acao: "Criação", entidade: "Pedido", detalhe: "Criado pedido #1001" },
    { id: 3, data: "17/06/2026", hora: "09:10", usuario: "Analista", acao: "Análise", entidade: "Crédito", detalhe: "Análise do pedido #1001 aprovada" },
    { id: 4, data: "16/06/2026", hora: "14:22", usuario: "Gestor", acao: "Aprovação", entidade: "Crédito", detalhe: "Crédito #1001 aprovado" },
    { id: 5, data: "16/06/2026", hora: "15:00", usuario: "Admin", acao: "Desembolso", entidade: "Financeiro", detalhe: "Desembolso #1001 realizado" },
  ];

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const filtered = logs.filter((l) => l.usuario.toLowerCase().includes(search.toLowerCase()) || l.acao.toLowerCase().includes(search.toLowerCase()) || l.entidade.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl shadow-lg"><ScrollText className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Logs do Sistema</h1><p className="text-sm text-slate-500">Registo completo de ações no sistema</p></div>
      </div>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar logs..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" /></div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Data/Hora</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Usuário</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Ação</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Entidade</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Detalhe</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((l) => (<tr key={l.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500 text-xs">{l.data} {l.hora}</td><td className="px-4 py-3 font-medium text-slate-700">{l.usuario}</td><td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">{l.acao}</span></td><td className="px-4 py-3 text-slate-600">{l.entidade}</td><td className="px-4 py-3 text-slate-500 text-xs">{l.detalhe}</td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}