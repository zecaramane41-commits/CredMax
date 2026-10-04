import { ScrollText } from "lucide-react";

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <ScrollText className="w-6 h-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditoria</h1>
          <p className="text-sm text-slate-500">Registo de auditoria e logs do sistema</p>
        </div>
      </div>
      <div className="border border-slate-200 rounded-lg p-8 text-center">
        <ScrollText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Página de auditoria em construção.</p>
      </div>
    </div>
  );
}