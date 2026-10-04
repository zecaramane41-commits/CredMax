import { useCallback, useEffect, useState } from "react";
import { Layers, Download, FileText, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { downloadTextFile, toCsv } from "../../lib/download";
import { openCorporatePrintWindow } from "../../lib/print";
import { getCarteirasConsolidado, getCarteiraExtrato, type ConsolidadoItem, type ExtratoPayload } from "../../lib/carteiras";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

const money = (v: number | string) => Number(v ?? 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2 });
const todayIso = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const pct = (v: number | string) => `${Number(v ?? 0).toFixed(2)}%`;

export default function CarteirasReportPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.relatorios");

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const [consolidado, setConsolidado] = useState<{
    totals: { totalClientes: number; clientesNovos: number; desembolsos: number; desembolsadoValor: number; reembolsos: number; reembolsadoValor: number; saldoAtual: number; mora: number; taxaMora: number };
    carteiras: ConsolidadoItem[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [extratoCarteiraId, setExtratoCarteiraId] = useState("");
  const [extratoFrom, setExtratoFrom] = useState(firstOfMonth());
  const [extratoTo, setExtratoTo] = useState(todayIso());
  const [extrato, setExtrato] = useState<ExtratoPayload | null>(null);
  const [extratoLoading, setExtratoLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCarteirasConsolidado({ from, to });
      setConsolidado(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar relatório consolidado.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  async function loadExtrato() {
    if (!extratoCarteiraId) return;
    setExtratoLoading(true);
    setError("");
    try {
      const data = await getCarteiraExtrato({ carteiraId: Number(extratoCarteiraId), from: extratoFrom, to: extratoTo });
      setExtrato(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar extrato.");
    } finally {
      setExtratoLoading(false);
    }
  }

  if (!canView) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;

  const exportConsolidadoCsv = () => {
    if (!consolidado) return;
    const rows = consolidado.carteiras.map((c) => ({
      carteira: c.name,
      codigo: c.code,
      gestor: c.gestorName,
      clientes: c.totalClientes,
      novos: c.clientesNovos,
      desembolsos_qtd: c.desembolsos,
      desembolsos_mt: c.desembolsadoValor,
      reembolsos_qtd: c.reembolsos,
      reembolsos_mt: c.reembolsadoValor,
      saldo_atual_mt: c.saldoAtual,
      mora_mt: c.mora,
      taxa_mora_pct: c.taxaMora,
    }));
    downloadTextFile(`consolidado-carteiras-${from}-${to}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };

  const exportConsolidadoPdf = () => {
    if (!consolidado) return;
    const t = consolidado.totals;
    const rowsHtml = consolidado.carteiras
      .map(
        (c) =>
          `<tr><td>${c.name}</td><td>${c.gestorName}</td><td class="r">${c.totalClientes}</td>` +
          `<td class="r">${money(c.desembolsadoValor)}</td><td class="r">${money(c.reembolsadoValor)}</td>` +
          `<td class="r">${money(c.saldoAtual)}</td><td class="r">${pct(c.taxaMora)}</td></tr>`,
      )
      .join("");
    openCorporatePrintWindow({
      title: "Relatório Consolidado de Carteiras",
      landscape: true,
      bodyHtml: `<style>
          table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
          th{background:#f1f5f9}.r{text-align:right}h2{margin:0 0 4px}h4{margin:0 0 14px;color:#475569}
          .kpi{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}.kpi div{flex:1;min-width:130px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px}
          .kpi .v{font-size:18px;font-weight:700}.kpi .l{font-size:10px;color:#64748b;text-transform:uppercase}
        </style>
        <h2>Relatório Consolidado da Empresa</h2>
        <h4>Período: ${from || "início"} a ${to || "hoje"} — drill-down por carteira</h4>
        <div class="kpi">
          <div><div class="v">${t.totalClientes}</div><div class="l">Clientes</div></div>
          <div><div class="v">${money(t.desembolsadoValor)} MT</div><div class="l">Desembolsos</div></div>
          <div><div class="v">${money(t.reembolsadoValor)} MT</div><div class="l">Reembolsos</div></div>
          <div><div class="v">${money(t.saldoAtual)} MT</div><div class="l">Saldo Ativo</div></div>
          <div><div class="v">${pct(t.taxaMora)}</div><div class="l">% Mora</div></div>
        </div>
        <table>
          <thead><tr><th>Carteira</th><th>Gestor</th><th class="r">Clientes</th><th class="r">Desembolsos (MT)</th><th class="r">Reembolsos (MT)</th><th class="r">Saldo (MT)</th><th class="r">% Mora</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>`,
    });
  };

  const exportExtratoCsv = () => {
    if (!extrato) return;
    const e = extrato.extrato;
    const rows = [
      { indicador: "Carteira", valor: extrato.carteira.name },
      { indicador: "Gestor Responsável", valor: extrato.carteira.gestorName },
      { indicador: "Desembolsos (qtd)", valor: e.desembolsos.total },
      { indicador: "Desembolsos (MT)", valor: e.desembolsos.valor },
      { indicador: "Reembolsos (qtd)", valor: e.reembolsos.total },
      { indicador: "Reembolsos (MT)", valor: e.reembolsos.valor },
      { indicador: "Mora (MT)", valor: e.mora },
      { indicador: "Clientes novos", valor: e.clientesNovos },
      { indicador: "Saldo inicial (MT)", valor: e.saldoInicial },
      { indicador: "Saldo final (MT)", valor: e.saldoFinal },
      { indicador: "Total créditos", valor: e.creditoTotal },
      { indicador: "Créditos em mora >=30d", valor: e.creditosMora30 },
      { indicador: "Taxa de mora (%)", valor: e.taxaMora },
    ];
    downloadTextFile(`extrato-${extrato.carteira.code}-${extratoFrom}-${extratoTo}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };

  const exportExtratoPdf = () => {
    if (!extrato) return;
    const e = extrato.extrato;
    openCorporatePrintWindow({
      title: "Extrato da Carteira",
      bodyHtml: `<style>
          table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}
          th{background:#f1f5f9}.r{text-align:right}h2{margin:0 0 4px}h4{margin:0 0 14px;color:#475569}
          .sign{margin-top:52px;max-width:340px}.sign .line{border-top:1px solid #334155;padding-top:6px;font-size:12px;text-align:center}
        </style>
        <h2>Extrato da Carteira</h2>
        <h4>${extrato.carteira.name} (${extrato.carteira.code}) — ${extratoFrom} a ${extratoTo}</h4>
        <h4>Gestor Responsável: ${extrato.carteira.gestorName}</h4>
        <table><tbody>
          <tr><th>Desembolsos</th><td class="r">${e.desembolsos.total} operações — ${money(e.desembolsos.valor)} MT</td></tr>
          <tr><th>Reembolsos</th><td class="r">${e.reembolsos.total} operações — ${money(e.reembolsos.valor)} MT</td></tr>
          <tr><th>Mora</th><td class="r">${money(e.mora)} MT</td></tr>
          <tr><th>Clientes novos</th><td class="r">${e.clientesNovos}</td></tr>
          <tr><th>Total de créditos</th><td class="r">${e.creditoTotal}</td></tr>
          <tr><th>Créditos em mora (≥30 dias)</th><td class="r">${e.creditosMora30}</td></tr>
          <tr><th>Saldo inicial (estimado)</th><td class="r">${money(e.saldoInicial)} MT</td></tr>
          <tr><th>Saldo final</th><td class="r">${money(e.saldoFinal)} MT</td></tr>
          <tr><th>Taxa de mora</th><td class="r">${pct(e.taxaMora)}</td></tr>
        </tbody></table>
        <div class="sign"><div class="line">Assinatura do Gestor Responsável — ${extrato.carteira.gestorName}</div></div>`,
    });
  };

  return (
<div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg"><Layers className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Relatório de Carteiras</h1><p className="text-sm text-slate-500">Consolidado da empresa com drill-down por carteira e extrato assinado pelo gestor</p></div>
      </div>
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Consolidado da Empresa</CardTitle>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">De<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 h-9 px-2 rounded-lg border border-slate-300 text-sm" /></label>
            <label className="text-xs text-slate-500">Até<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 h-9 px-2 rounded-lg border border-slate-300 text-sm" /></label>
            <Button size="sm" variant="outline" onClick={() => void load()}><Loader2 className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></Button>
            <Button size="sm" variant="outline" onClick={exportConsolidadoPdf} disabled={!consolidado}><FileText className="w-4 h-4 mr-1" />PDF</Button>
            <Button size="sm" variant="outline" onClick={exportConsolidadoCsv} disabled={!consolidado}><Download className="w-4 h-4 mr-1" />Excel</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!consolidado && loading && <p className="text-sm text-slate-500">A carregar relatório consolidado...</p>}
          {consolidado && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Clientes</p><p className="text-xl font-bold text-slate-800 mt-1">{consolidado.totals.totalClientes}</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Desembolsos (MT)</p><p className="text-xl font-bold text-emerald-600 mt-1">{money(consolidado.totals.desembolsadoValor)}</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Reembolsos (MT)</p><p className="text-xl font-bold text-indigo-600 mt-1">{money(consolidado.totals.reembolsadoValor)}</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Saldo Ativo (MT)</p><p className="text-xl font-bold text-amber-600 mt-1">{money(consolidado.totals.saldoAtual)}</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Taxa de Mora</p><p className="text-xl font-bold text-red-600 mt-1">{pct(consolidado.totals.taxaMora)}</p></div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Carteira</TableHead><TableHead>Gestor</TableHead>
                    <TableHead className="text-right">Clientes</TableHead><TableHead className="text-right">Novos</TableHead>
                    <TableHead className="text-right">Desembolsos (MT)</TableHead><TableHead className="text-right">Reembolsos (MT)</TableHead>
                    <TableHead className="text-right">Saldo (MT)</TableHead><TableHead className="text-right">Mora (MT)</TableHead><TableHead className="text-right">% Mora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consolidado.carteiras.map((c) => (
                    <TableRow key={c.carteiraId}>
                      <TableCell className="font-medium">{c.parentId ? `↳ ${c.name}` : c.name}</TableCell>
                      <TableCell>{c.gestorName}</TableCell>
                      <TableCell className="text-right">{c.totalClientes}</TableCell>
                      <TableCell className="text-right">{c.clientesNovos}</TableCell>
                      <TableCell className="text-right">{money(c.desembolsadoValor)}</TableCell>
                      <TableCell className="text-right">{money(c.reembolsadoValor)}</TableCell>
                      <TableCell className="text-right">{money(c.saldoAtual)}</TableCell>
                      <TableCell className="text-right text-red-600">{money(c.mora)}</TableCell>
                      <TableCell className="text-right">{pct(c.taxaMora)}</TableCell>
                    </TableRow>
                  ))}
                  {consolidado.carteiras.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-6">Sem carteiras no período.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Extrato da Carteira</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={extratoCarteiraId} onChange={(e) => setExtratoCarteiraId(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-300 text-sm">
              <option value="">Selecione a carteira...</option>
              {consolidado?.carteiras.map((c) => <option key={c.carteiraId} value={c.carteiraId}>{c.parentId ? `↳ ${c.name}` : c.name}</option>)}
            </select>
            <label className="text-xs text-slate-500">De<input type="date" value={extratoFrom} onChange={(e) => setExtratoFrom(e.target.value)} className="block mt-1 h-9 px-2 rounded-lg border border-slate-300 text-sm" /></label>
            <label className="text-xs text-slate-500">Até<input type="date" value={extratoTo} onChange={(e) => setExtratoTo(e.target.value)} className="block mt-1 h-9 px-2 rounded-lg border border-slate-300 text-sm" /></label>
            <Button size="sm" onClick={loadExtrato} disabled={!extratoCarteiraId || extratoLoading}>{extratoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerar extrato"}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {extrato && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Desembolsos (MT)</p><p className="text-lg font-bold text-emerald-600 mt-1">{money(extrato.extrato.desembolsos.valor)}</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Reembolsos (MT)</p><p className="text-lg font-bold text-indigo-600 mt-1">{money(extrato.extrato.reembolsos.valor)}</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Mora (MT)</p><p className="text-lg font-bold text-red-600 mt-1">{money(extrato.extrato.mora)}</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs text-slate-500 uppercase">Saldo final (MT)</p><p className="text-lg font-bold text-slate-800 mt-1">{money(extrato.extrato.saldoFinal)}</p></div>
              </div>
              <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm">
                <p><span className="text-slate-500">Clientes novos no período:</span> <strong>{extrato.extrato.clientesNovos}</strong></p>
                <p><span className="text-slate-500">Créditos totais:</span> <strong>{extrato.extrato.creditoTotal}</strong> · <span className="text-slate-500">em mora ≥30d:</span> <strong>{extrato.extrato.creditosMora30}</strong></p>
                <p><span className="text-slate-500">Taxa de mora:</span> <strong>{pct(extrato.extrato.taxaMora)}</strong></p>
                <p className="mt-2 text-slate-600">Assinado pelo Gestor Responsável: <strong>{extrato.carteira.gestorName}</strong></p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exportExtratoPdf}><FileText className="w-4 h-4 mr-1" />Baixar PDF assinado</Button>
                <Button variant="outline" onClick={exportExtratoCsv}><Download className="w-4 h-4 mr-1" />Excel</Button>
              </div>
            </>
          )}
          {!extrato && <p className="text-sm text-slate-400">Selecione uma carteira e clique em "Gerar extrato".</p>}
        </CardContent>
      </Card>
    </div>
  );
}