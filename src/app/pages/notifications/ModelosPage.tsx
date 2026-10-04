import { FileText } from "lucide-react";

export default function ModelosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg">
          <FileText className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Modelos</h1>
          <p className="text-sm text-slate-500">Templates de mensagens</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Modelos de Mensagens</h3>
        <p className="text-slate-500 max-w-md mx-auto">Painel de templates em construção.</p>
      </div>
    </div>
  );
}