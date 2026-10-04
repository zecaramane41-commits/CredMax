import { useState, useEffect } from "react";
import { AlertTriangle, Search, Loader2, Printer, Clock, DollarSign } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { formatCurrencyMT } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";
import { getCreditosAtivos, recalcularMora, useCreditosPolling } from "../../lib/credits";
import { getResumoCreditos } from "../../lib/credits";
import type { CreditoAtivo } from "../../../../shared/types";

type MoraRecord = {
  creditoId: number;
  cliente: string;
  clienteType: string;
  contrato: string;
  saldoDevedor: number;
  mora: number;
  prestacoesAtrasadas: number;
  diasAtrasoMax: number;
  parcelasAtraso: { numParcela: number; vencimento: string; valor: number; diasAtraso: number; mora: number }[];
};

function buildMoraRecords(creditos: CreditoAtivo[]): MoraRecord[] {
  const hoje = new Date();
  return creditos
    .filter(c => c.estado === "ativo")
    .map(c => {
      recalcularMora(c);
      const parcelasAtraso = c.parcelas
        .filter(p => p.status !== "pago")
        .map(p => {
          const parts = p.dataVencimento.split("/");
          const venc = parts.length === 3 ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])) : null;
          const diasAtraso = venc ? Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24)) : 0;
          const taxaMoraDiaria = 0.005;
          const mora = diasAtraso > 0 ? p.valor * taxaMoraDiaria * diasAtraso : 0;
          return { numParcela: p.numParcela, vencimento: p.dataVencimento, valor: p.valor, diasAtraso, mora };
        })
        .filter(p => p.diasAtraso > 0);
      return {
        creditoId: c.id,
        cliente: c.cliente,
        clienteType: c.clienteType,
        contrato: c.contrato,
        saldoDevedor: c.saldoDevedor,
        mora: c.mora,
        prestacoesAtrasadas: c.prestacoesAtrasadas,
        diasAtrasoMax: parcelasAtraso.length > 0 ? Math.max(...parcelasAtraso.map(p => p.diasAtraso)) : 0,
        parcelasAtraso,
      };
    })
    .filter(r => r.parcelasAtraso.length > 0)
    .sort((a, b) => b.diasAtrasoMax - a.diasAtrasoMax);
}

export default function MoraPage() {
  const user = getUser();
  const canView = hasPermission(user, "registrar.mora");
  const [creditos, setCreditos] = useState<CreditoAtivo[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => useCreditosPolling(setCreditos), []);

  const moraRecords = buildMoraRecords(creditos);
  const filtered = moraRecords.filter(r =>
    r.cliente.toLowerCase().includes(search.toLowerCase()) ||
    r.contrato.toLowerCase().includes(search.toLowerCase())
  );

  const getDiasColor = (dias: number) => {
    if (dias <= 30) return "text-amber-600 bg-amber-50";
    if (dias <= 60) return "text-orange-600 bg-orange-50";
    return "text-red-600 bg-red-50";
  };

  const handlePrint = () => {
    const now = new Date().toLocaleString("pt-PT");
    const rows = filtered.map((r, idx) => `
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${idx + 1}</td>
        <td style="padding:6px;border:1px solid #cbd5e1">${r.cliente}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${r.contrato}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;text-align:right">${formatCurrencyMT(r.saldoDevedor)}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;color:#dc2626">${formatCurrencyMT(r.mora)}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${r.prestacoesAtrasadas}</td>
        <td style="padding:6px;border:1px solid #cbd5e1;text-align:center">${r.diasAtrasoMax}</td>
      </tr>
    `).join("");

    const totals = {
      saldo: filtered.reduce((s, r) => s + r.saldoDevedor, 0),
      mora: filtered.reduce((s, r) => s + r.mora, 0),
      atrasadas: filtered.reduce((s, r) => s + r.prestacoesAtrasadas, 0),
    };

    openCorporatePrintWindow({
      title: `Relatorio_Mora_${new Date().toISOString().split("T")[0]}`,
      bodyHtml: `
        <h1 style="text-align:center">Relatório de Mora</h1>
        <p style="text-align:center">Gerado em ${now}</p>
        <p style="text-align:center;color:#dc2626;font-weight:bold">Total em Mora: ${formatCurrencyMT(totals.mora)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:16px">
          <thead><tr style="background:#f1f5f9">
            <th style="padding:6px;border:1px solid #cbd5e1;text-align:center">#</th>
            <th style="padding:6px;border:1px solid #cbd5e1">Cliente</th>
            <th style="padding:6px;border:1px solid #cbd5e1">Contrato</th>
            <th style="padding:6px;border:1px solid #cbd5e1;text-align:right">Saldo</th>
            <th style="padding:6px;border:1px solid #cbd5e1;text-align:right">Mora</th>
            <th style="padding:6px;border:1px solid #cbd5e1;text-align:center">Prest. Atraso</th>
            <th style="padding:6px;border:1px solid #cbd5e1;text-align:center">Máx Dias</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:16px;padding:12px;background:#fef2f2;border-radius:8px">
          <p><strong>Total Clientes:</strong> ${filtered.length}</p>
          <p><strong>Total Saldo:</strong> ${formatCurrencyMT(totals.saldo)}</p>
          <p><strong>Total Mora:</strong> <span style="color:#dc2626">${formatCurrencyMT(totals.mora)}</span></p>
          <p><strong>Prestações Atrasadas:</strong> ${totals.atrasadas}</p>
        </div>
        <p style="text-align:center;font-size:10px;color:#94a3b8;margin-top:16px">Documento gerado em ${now}</p>`,
      browserControls: true,
    });
  };

  if (!canView) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão paraaceder à mora.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Controlo de Mora</h1>
            <p className="text-sm text-slate-500">Acompanhamento de prestações em atraso e juros moratórios</p>
          </div>
        </div>
        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Clientes em Mora</p>
          <p className="text-2xl font-bold text-red-700">{filtered.length}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-600">Saldo Devedor</p>
          <p className="text-2xl font-bold text-amber-700">{formatCurrencyMT(filtered.reduce((s, r) => s + r.saldoDevedor, 0))}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-600 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Mora Total</p>
          <p className="text-2xl font-bold text-red-700">{formatCurrencyMT(filtered.reduce((s, r) => s + r.mora, 0))}</p>
        </div>
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs text-purple-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Prestações Atrasadas</p>
          <p className="text-2xl font-bold text-purple-700">{filtered.reduce((s, r) => s + r.prestacoesAtrasadas, 0)}</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente ou contrato..."
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-red-500" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left font-medium text-slate-600">Cliente</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Contrato</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Saldo</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Mora</th>
              <th className="px-4 py-3 text-center font-medium text-slate-600">Prest. Atraso</th>
              <th className="px-4 py-3 text-center font-medium text-slate-600">Máx Dias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Nenhum crédito em mora. ✅</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.creditoId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{r.cliente}</div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      r.clienteType === "singular" ? "bg-blue-100 text-blue-700"
                      : r.clienteType === "grupo" ? "bg-purple-100 text-purple-700"
                      : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {r.clienteType === "singular" ? "Individual" : r.clienteType === "grupo" ? "Grupo" : "Empresa"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.contrato}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrencyMT(r.saldoDevedor)}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrencyMT(r.mora)}</td>
                  <td className="px-4 py-3 text-center">{r.prestacoesAtrasadas}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getDiasColor(r.diasAtrasoMax)}`}>
                      {r.diasAtrasoMax} dias
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-800">Detalhes das Prestações em Atraso</h2>
          {filtered.map((r) => (
            <div key={r.creditoId} className="bg-white border border-red-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-slate-800">{r.cliente} — {r.contrato}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getDiasColor(r.diasAtrasoMax)}`}>
                  {r.diasAtrasoMax} dias
                </span>
              </div>
              <div className="space-y-2">
                {r.parcelasAtraso.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-red-50 rounded-lg border border-red-100">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">Parcela #{p.numParcela}</span>
                      <span className="text-xs text-slate-500">Venc: {p.vencimento}</span>
                      <span className="text-xs text-red-600">{p.diasAtraso} dias</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm">{formatCurrencyMT(p.valor)}</span>
                      <span className="text-sm font-bold text-red-600">+{formatCurrencyMT(p.mora)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}