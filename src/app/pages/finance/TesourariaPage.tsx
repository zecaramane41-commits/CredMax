import { useState } from "react";
import { Wallet, Search } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";

export default function TesourariaPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.financeiro");
  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-xl shadow-lg"><Wallet className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Tesouraria</h1><p className="text-sm text-slate-500">Controlo de recursos financeiros disponíveis</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Disponível</p><p className="text-2xl font-bold text-emerald-600 mt-1">1,250,000.00 MT</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Comprometido</p><p className="text-2xl font-bold text-amber-600 mt-1">850,000.00 MT</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs text-slate-500 uppercase">Total</p><p className="text-2xl font-bold text-indigo-600 mt-1">2,100,000.00 MT</p></div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Fundos por Carteira</h3>
        <div className="space-y-3">
          {[
            { nome: "Microcrédito Padrão", valor: 520000, pct: 40 },
            { nome: "Crédito Grupo Solidário", valor: 280000, pct: 22 },
            { nome: "Crédito Comercial", valor: 350000, pct: 28 },
            { nome: "Reserva Técnica", valor: 100000, pct: 10 },
          ].map((f) => (
            <div key={f.nome}><div className="flex justify-between text-sm mb-1"><span className="text-slate-700">{f.nome}</span><span className="font-medium">{f.valor.toLocaleString("pt-PT")} MT</span></div>
              <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-cyan-500 h-2 rounded-full" style={{ width: `${f.pct}%` }} /></div></div>
          ))}
        </div>
      </div>
    </div>
  );
}