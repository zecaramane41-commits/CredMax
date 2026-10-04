import { LogIn } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

type Sessao = { usuario: string; ip: string; inicio: string; ultimaAtividade: string; status: "ativa" | "encerrada" };

export default function AcessosPage() {
  const user = getUser();
  const canView = hasPermission(user, "consultar.auditoria");

  const sessoes: Sessao[] = [
    { usuario: "Admin", ip: "192.168.1.100", inicio: "17/06/2026 08:30", ultimaAtividade: "08:45", status: "ativa" },
    { usuario: "Analista", ip: "192.168.1.101", inicio: "17/06/2026 08:35", ultimaAtividade: "08:40", status: "ativa" },
    { usuario: "Gestor", ip: "192.168.1.102", inicio: "16/06/2026 14:00", ultimaAtividade: "16:30", status: "encerrada" },
  ];

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg"><LogIn className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Acessos</h1><p className="text-sm text-slate-500">Logins e sessões ativas no sistema</p></div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Usuário</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">IP</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Início</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Última Atividade</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {sessoes.map((s, i) => (<tr key={i} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{s.usuario}</td><td className="px-4 py-3 text-slate-600 text-xs">{s.ip}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">{s.inicio}</td><td className="px-4 py-3 text-slate-500 text-xs">{s.ultimaAtividade}</td>
              <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.status === "ativa" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{s.status}</span></td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}