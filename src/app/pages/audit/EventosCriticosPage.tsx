import { Shield } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

export default function EventosCriticosPage() {
  const user = getUser();
  const canView = hasPermission(user, "consultar.auditoria");
  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const eventos = [
    { data: "17/06/2026 09:10", tipo: "Aprovação", descricao: "Crédito #1001 aprovado por Gestor", usuario: "João Gestor", severidade: "Média" },
    { data: "16/06/2026 15:00", tipo: "Desembolso", descricao: "Desembolso de 75.000 MT realizado", usuario: "Admin", severidade: "Alta" },
    { data: "15/06/2026 11:30", tipo: "Extorno", descricao: "Extorno de pagamento duplicado #5001", usuario: "Ana Auditora", severidade: "Alta" },
    { data: "14/06/2026 08:00", tipo: "Reestruturação", descricao: "Contrato #2001 reestruturado", usuario: "Maria Analista", severidade: "Média" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg"><Shield className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Eventos Críticos</h1><p className="text-sm text-slate-500">Operações sensíveis: aprovações, extornos e desembolsos</p></div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3.5 text-left font-medium text-slate-600">Data/Hora</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Tipo</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Descrição</th><th className="px-4 py-3.5 text-left font-medium text-slate-600">Usuário</th><th className="px-4 py-3.5 text-center font-medium text-slate-600">Severidade</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {eventos.map((e, i) => (<tr key={i} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-500 text-xs">{e.data}</td><td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{e.tipo}</span></td>
              <td className="px-4 py-3 text-slate-700">{e.descricao}</td><td className="px-4 py-3 text-slate-600">{e.usuario}</td>
              <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${e.severidade === "Alta" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{e.severidade}</span></td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}