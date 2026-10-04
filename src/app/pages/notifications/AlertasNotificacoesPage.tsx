import { useState } from "react";
import { Bell, Search, CheckCircle } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

type AlertaNotif = { id: number; tipo: string; mensagem: string; data: string; lido: boolean };

export default function AlertasNotificacoesPage() {
  const user = getUser();
  const canView = hasPermission(user, "enviar.notificacoes");
  const [alertas, setAlertas] = useState<AlertaNotif[]>([
    { id: 1, tipo: "Operacional", mensagem: "Cliente João Pedro tem prestação em atraso", data: "15/06/2026", lido: false },
    { id: 2, tipo: "Financeiro", mensagem: "Saldo da tesouraria abaixo do mínimo", data: "14/06/2026", lido: false },
    { id: 3, tipo: "Operacional", mensagem: "Novo pedido de crédito pendente de análise", data: "14/06/2026", lido: true },
  ]);

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg"><Bell className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Alertas</h1><p className="text-sm text-slate-500">Alertas operacionais e financeiros — {alertas.filter((a) => !a.lido).length} não lidos</p></div>
      </div>
      <div className="space-y-2">
        {alertas.map((a) => (
          <div key={a.id} className={`bg-white border rounded-xl p-4 flex items-center justify-between ${a.lido ? "border-slate-200" : "border-amber-200 bg-amber-50/30"}`}>
            <div className="flex-1"><div className="flex items-center gap-2"><h3 className="font-medium text-slate-800 text-sm">{a.tipo}</h3>{!a.lido && <span className="w-2 h-2 rounded-full bg-amber-500" />}</div>
              <p className="text-xs text-slate-600 mt-0.5">{a.mensagem}</p><p className="text-[10px] text-slate-400 mt-0.5">{a.data}</p></div>
            {!a.lido && <button onClick={() => setAlertas((prev) => prev.map((x) => x.id === a.id ? { ...x, lido: true } : x))} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200"><CheckCircle className="w-3.5 h-3.5 inline mr-1" />Marcar Lido</button>}
          </div>
        ))}
      </div>
    </div>
  );
}