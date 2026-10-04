import { useState, useEffect } from "react";
import { Landmark, Download, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients } from "../../lib/clients";

export default function FinanceiroReportPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.relatorios");
  const canExport = hasPermission(user, "exportar.relatorios");
  const [clients, setClients] = useState<{ name: string; income: number; debt: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    fetchClients().then((data) => { if (!ignore) { setClients(data.map((c) => ({ name: c.name, income: c.monthlyIncome || 0, debt: c.debt || 0 }))); setLoading(false); } }).catch(() => setLoading(false));
    return () => { ignore = true; };
  }, []);

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const totalRenda = clients.reduce((s, c) => s + c.income, 0);
  const totalDivida = clients.reduce((s, c) => s + c.debt, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg"><Landmark className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Relatório Financeiro</h1><p className="text-sm text-slate-500">Relatórios financeiros e fluxo de caixa</p></div>
        </div>
        {canExport && <button onClick={() => alert("Relatório financeiro exportado.")} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Download className="w-4 h-4" />Exportar</button>}
      </div>
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />A carregar...</div>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Renda Total (Clientes)</p><p className="text-2xl font-bold text-emerald-600 mt-1">{totalRenda.toLocaleString("pt-PT")} MT</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Dívida Total</p><p className="text-2xl font-bold text-red-600 mt-1">{totalDivida.toLocaleString("pt-PT")} MT</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Fluxo Líquido</p><p className="text-2xl font-bold text-indigo-600 mt-1">{(totalRenda - totalDivida).toLocaleString("pt-PT")} MT</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Rácio Dívida/Renda</p><p className="text-2xl font-bold text-amber-600 mt-1">{totalRenda > 0 ? (totalDivida / totalRenda).toFixed(2) : "0.00"}x</p></div>
      </div>
    </div>
  );
}