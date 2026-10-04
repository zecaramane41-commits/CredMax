import { useEffect, useState } from "react";
import { PieChart, RefreshCw, FileText, Download } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { getCarteiraStats, type StatRow } from "../../lib/carteiras";
import { getUser } from "../../lib/auth";
import { hasPermission } from "../../lib/permissions";
import { downloadTextFile, toCsv } from "../../lib/download";
import { openCorporatePrintWindow } from "../../lib/print";

const money = (v: string | number) => Number(v ?? 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2 });

export default function SegmentacaoPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.carteiras");
  const [stats, setStats] = useState<StatRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!canView) return;
    setLoading(true);
    try {
      const data = await getCarteiraStats();
      setStats(data.stats || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar estatísticas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    const rows = stats.map((s) => ({
      carteira: s.carteira_name,
      gestor: s.gestor_name || "",
      clientes: Number(s.total_clientes || 0),
      novos_mes: Number(s.clientes_novos_mes || 0),
      desembolsos_qtd: Number(s.total_creditos || 0),
      desembolsos_mt: Number(s.total_desembolsado || 0),
      reembolsos_mt: Number(s.total_reembolsado || 0),
      mora_mt: Number(s.mora_acumulada || 0),
    }));
    downloadTextFile(`segmentacao-carteiras-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };

  const exportPdf = () => {
    const rowsHtml = stats
      .map(
        (s) =>
          `<tr><td>${s.carteira_name}</td><td>${s.gestor_name || "-"}</td><td class="r">${Number(s.total_clientes || 0)}</td>` +
          `<td class="r">${money(Number(s.total_desembolsado || 0))}</td><td class="r">${money(Number(s.total_reembolsado || 0))}</td>` +
          `<td class="r">${money(Number(s.mora_acumulada || 0))}</td></tr>`,
      )
      .join("");
    openCorporatePrintWindow({
      title: "Segmentação por Carteira",
      landscape: true,
      bodyHtml: `<style>
          table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
          th{background:#f1f5f9}.r{text-align:right}h2{margin:0 0 4px}h4{margin:0 0 14px;color:#475569}
        </style>
        <h2>Segmentação por Carteira / Gestor</h2>
        <h4>Desembolsos, reembolsos e mora — gerado em ${new Date().toLocaleString("pt-PT")}</h4>
        <table>
          <thead><tr><th>Carteira</th><th>Gestor</th><th class="r">Clientes</th><th class="r">Desembolsos (MT)</th><th class="r">Reembolsos (MT)</th><th class="r">Mora (MT)</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>`,
    });
  };

  if (!canView)
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>Sem permissão.</p>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PieChart className="w-6 h-6 text-emerald-600" />
            Segmentação por Carteira
          </h1>
          <p className="text-sm text-slate-600 mt-1">Desembolsos e reembolsos por carteira / gestor responsável.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportPdf} disabled={stats.length === 0}><FileText className="w-4 h-4 mr-1" />PDF</Button>
          <Button variant="outline" onClick={exportCsv} disabled={stats.length === 0}><Download className="w-4 h-4 mr-1" />Excel</Button>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="w-4 h-4" />
        </Button>
        </div>
      </div>
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo por carteira</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carteira</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead className="text-right">Clientes totais</TableHead>
                <TableHead className="text-right">Novos no mês</TableHead>
                <TableHead className="text-right">Desembolsos</TableHead>
                <TableHead className="text-right">Reembolsos</TableHead>
                <TableHead className="text-right">Desembolsado (MT)</TableHead>
                <TableHead className="text-right">Reembolsado (MT)</TableHead>
                <TableHead className="text-right">Mora (MT)</TableHead>
                <TableHead className="text-right">% Mora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((s) => {
                const mora = Number(s.mora_acumulada ?? 0);
                const saldoActivo = Number(s.saldo_activo ?? 0);
                const pctMora = saldoActivo > 0 ? (mora / saldoActivo) * 100 : 0;
                return (
                  <TableRow key={s.carteira_id}>
                    <TableCell className="font-medium">
                      {s.carteira_name}
                      {s.parent_id ? " (sub)" : ""}
                    </TableCell>
                    <TableCell>{s.gestor_user_name || s.gestor_name || "—"}</TableCell>
                    <TableCell className="text-right">{s.total_clientes}</TableCell>
                    <TableCell className="text-right">{Number(s.clientes_novos_mes ?? 0)}</TableCell>
                    <TableCell className="text-right">{s.total_creditos}</TableCell>
                    <TableCell className="text-right">{Number(s.total_reembolsos ?? 0)}</TableCell>
                    <TableCell className="text-right">{money(s.total_desembolsado)}</TableCell>
                    <TableCell className="text-right">{money(s.total_reembolsado)}</TableCell>
                    <TableCell className={`text-right ${mora > 0 ? "text-red-600 font-medium" : ""}`}>{money(mora)}</TableCell>
                    <TableCell className={`text-right ${pctMora >= 10 ? "text-red-600 font-semibold" : pctMora > 0 ? "text-amber-600" : ""}`}>
                      {pctMora.toFixed(2)}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {stats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-slate-500 py-8">
                    Sem dados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
