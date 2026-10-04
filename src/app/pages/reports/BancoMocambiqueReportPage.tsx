import { Building2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

export default function BancoMocambiqueReportPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.relatorios");
  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg"><Building2 className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Banco de Moçambique</h1><p className="text-sm text-slate-500">Relatórios regulatórios para o Banco Central</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer"><h3 className="font-semibold text-slate-800">Mapa de Crédito</h3><p className="text-xs text-slate-500 mt-1">Relatório mensal de concessão de crédito</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer"><h3 className="font-semibold text-slate-800">Taxas de Juro</h3><p className="text-xs text-slate-500 mt-1">Reporte de taxas praticadas</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer"><h3 className="font-semibold text-slate-800">Inadimplência</h3><p className="text-xs text-slate-500 mt-1">Indicadores de mora e recuperação</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer"><h3 className="font-semibold text-slate-800">Demonstrações Financeiras</h3><p className="text-xs text-slate-500 mt-1">Balanço e demonstração de resultados</p></div>
      </div>
    </div>
  );
}