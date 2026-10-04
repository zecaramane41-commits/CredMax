import { History } from "lucide-react";

export default function HistoricoAlteracoesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
          <History className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Histórico de Alterações</h1>
          <p className="text-sm text-slate-500">Alterações realizadas</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <History className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Histórico de Alterações</h3>
        <p className="text-slate-500 max-w-md mx-auto">Painel de alterações em construção.</p>
      </div>
    </div>
  );
}