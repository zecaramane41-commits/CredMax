import { HardDrive, Download, Upload, Clock } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

export default function BackupPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.configuracoes.sistema");
  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg"><HardDrive className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Backup</h1><p className="text-sm text-slate-500">Cópias de segurança do sistema</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={() => alert("Backup iniciado.")} className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-shadow text-left"><Download className="w-8 h-8 text-indigo-500 mb-2" /><h3 className="font-semibold text-slate-800">Criar Backup</h3><p className="text-xs text-slate-500 mt-1">Gerar nova cópia de segurança</p></button>
        <button onClick={() => alert("Selecione um arquivo para restaurar.")} className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-shadow text-left"><Upload className="w-8 h-8 text-amber-500 mb-2" /><h3 className="font-semibold text-slate-800">Restaurar Backup</h3><p className="text-xs text-slate-500 mt-1">Recuperar a partir de backup</p></button>
        <div className="bg-white border border-slate-200 rounded-xl p-6"><Clock className="w-8 h-8 text-slate-400 mb-2" /><h3 className="font-semibold text-slate-800">Último Backup</h3><p className="text-xs text-slate-500 mt-1">16/06/2026 às 23:00</p></div>
      </div>
    </div>
  );
}