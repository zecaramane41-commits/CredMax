import { UserCheck, Shield, Users, UserCog, User } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

export default function PerfisPage() {
  const user = getUser();
  const canView = hasPermission(user, "gerir.perfis");
  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg"><UserCheck className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Perfis</h1><p className="text-sm text-slate-500">Perfis de acesso ao sistema</p></div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Perfis de Acesso</h3>
        <p className="text-slate-500 max-w-md mx-auto">Configure os perfis e suas permissões no sistema.</p>
      </div>
    </div>
  );
}