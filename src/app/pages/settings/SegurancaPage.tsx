import { useState } from "react";
import { Shield, Eye, EyeOff } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

export default function SegurancaPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.configuracoes.sistema");
  const [minLength, setMinLength] = useState(8);
  const [requireSpecial, setRequireSpecial] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg"><Shield className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Segurança</h1><p className="text-sm text-slate-500">Políticas de senha, autenticação e sessões ativas</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Políticas de Senha</h2>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Tamanho mínimo</label><input type="number" value={minLength} onChange={(e) => setMinLength(Number(e.target.value))} className="w-24 h-10 px-3 rounded-lg border border-slate-300 text-sm" /></div>
          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer"><input type="checkbox" checked={requireSpecial} onChange={(e) => setRequireSpecial(e.target.checked)} className="rounded text-indigo-600" /><span className="text-sm text-slate-700">Exigir caracteres especiais</span></label>
          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer"><input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} className="rounded text-indigo-600" /><span className="text-sm text-slate-700">Autenticação de dois fatores (2FA)</span></label>
          <button onClick={() => alert("Configurações de segurança salvas.")} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm">Salvar</button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Sessões Ativas</h2>
          <div className="space-y-3">
            {[{ usuario: "Admin", ip: "192.168.1.100", inicio: "08:30", status: "Atual" }, { usuario: "Analista", ip: "192.168.1.101", inicio: "08:35", status: "Ativa" }].map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"><div><p className="font-medium text-slate-800 text-sm">{s.usuario}</p><p className="text-xs text-slate-500">{s.ip} · desde {s.inicio}</p></div>
                <span className="text-xs text-emerald-600 font-medium">{s.status}</span></div>))}
          </div>
        </div>
      </div>
    </div>
  );
}