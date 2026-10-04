import { useState, useEffect, useMemo } from "react";
import {
  RefreshCcw, Search, Printer, CheckCircle, Loader2, AlertTriangle,
  RotateCcw, Sparkles, Check, FileText, Layers, TrendingUp,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Label } from "../../components/ui/label";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients, type ClientSummary } from "../../lib/clients";
import { formatCurrencyMT } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";
import { getCreditosAtivos, useCreditosPolling } from "../../lib/credits";
import { apiFetch } from "../../lib/api";
import { toast } from "sonner";
import type { CreditoAtivo } from "../../../../shared/types";

export type CapitalizacaoRecord = {
  id: number;
  loanId: number;
  originalContractNo: string;
  newContractNo?: string;
  clientId: number;
  clientName: string;
  mode: "renovacao_remanescente" | "capitalizacao_encargos";
  previousBalance: number;
  capitalizedAmount: number;
  newBalance: number;
  newMonths?: number;
  newRate?: number;
  operationDate: string;
  operatorName: string;
  notes?: string;
};

const CAPITALIZACAO_STORAGE_KEY = "msu_capitalizacao_history_v2";

export function loadStoredCapitalizacao(): CapitalizacaoRecord[] {
  try {
    return JSON.parse(localStorage.getItem(CAPITALIZACAO_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveStoredCapitalizacao(items: CapitalizacaoRecord[]) {
  try {
    localStorage.setItem(CAPITALIZACAO_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}
export default function CapitalizacaoPage() {
  const user = getUser();
  const canApply = hasPermission(user, "registrar.pagamento");

  const [creditos, setCreditos] = useState<CreditoAtivo[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [history, setHistory] = useState<CapitalizacaoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<CreditoAtivo | null>(null);

  const [mode, setMode] = useState<"renovacao_remanescente" | "capitalizacao_encargos">("renovacao_remanescente");
  const [encargosPercent, setEncargosPercent] = useState("5");
  const [newMonths, setNewMonths] = useState("2");
  const [newRate, setNewRate] = useState("3.5");
  const [notes, setNotes] = useState("Renovação da dívida no valor remanescente");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => useCreditosPolling(setCreditos), []);

  useEffect(() => {
    fetchClients().then(setClients).catch(() => setClients([]));
    setHistory(loadStoredCapitalizacao());
  }, []);

  const handleOpenModal = (c: CreditoAtivo) => {
    setSelectedCredit(c);
    setMode("renovacao_remanescente");
    setNewMonths("2");
    setNewRate(String(c.taxa || 3.5));
    setNotes(`Renovação de crédito pelo saldo devedor remanescente de ${formatCurrencyMT(c.saldoDevedor)}`);
    setShowModal(true);
  };

  const handleConfirmOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredit) return;

    setSubmitting(true);
    try {
      const prevBal = selectedCredit.saldoDevedor;
      let capAmt = 0;
      let nextBal = prevBal;
      let newContractNo = `RNV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

      if (mode === "renovacao_remanescente") {
        capAmt = prevBal;
        nextBal = prevBal;
      } else {
        const perc = Number(encargosPercent) || 0;
        capAmt = Math.round(prevBal * (perc / 100));
        nextBal = prevBal + capAmt;
        newContractNo = undefined as any;
      }

      try {
        await apiFetch(`/loans/${selectedCredit.id}/financial-events`, {
          method: "POST",
          body: JSON.stringify({
            eventType: "capitalizacao",
            amount: capAmt,
            note: `${notes} (${mode === "renovacao_remanescente" ? `Renovação por ${newMonths} meses` : `Capitalização de ${encargosPercent}%`})`,
            payload: {
              mode,
              newContractNo,
              newMonths: mode === "renovacao_remanescente" ? Number(newMonths) : undefined,
              newRate: mode === "renovacao_remanescente" ? Number(newRate) : undefined,
              newBalance: nextBal,
            },
          }),
        });
      } catch {}

      const newRecord: CapitalizacaoRecord = {
        id: Date.now(),
        loanId: selectedCredit.id,
        originalContractNo: selectedCredit.contrato,
        newContractNo,
        clientId: selectedCredit.clienteId,
        clientName: selectedCredit.cliente,
        mode,
        previousBalance: prevBal,
        capitalizedAmount: capAmt,
        newBalance: nextBal,
        newMonths: mode === "renovacao_remanescente" ? Number(newMonths) : undefined,
        newRate: mode === "renovacao_remanescente" ? Number(newRate) : undefined,
        operationDate: new Date().toISOString().split("T")[0],
        operatorName: user?.name || "Operador",
        notes,
      };

      const updated = [newRecord, ...loadStoredCapitalizacao()];
      saveStoredCapitalizacao(updated);
      setHistory(updated);

      toast.success(
        mode === "renovacao_remanescente"
          ? `Dívida renovada com sucesso! Novo Contrato emitido: ${newContractNo} (${formatCurrencyMT(nextBal)} por ${newMonths} meses).`
          : `Encargos de ${formatCurrencyMT(capAmt)} capitalizados com sucesso. Novo saldo devedor: ${formatCurrencyMT(nextBal)}.`
      );

      setShowModal(false);
      setSelectedCredit(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar capitalização.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintCapitalizacao = (item: CapitalizacaoRecord) => {
    const now = new Date().toLocaleString("pt-PT");
    openCorporatePrintWindow({
      title: `Termo_Capitalizacao_${item.originalContractNo}`,
      bodyHtml: `
        <div style="font-family:Arial,sans-serif;padding:24px;color:#1e293b">
          <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px">
            <h2 style="margin:0;color:#6b21a8;font-size:22px">TERMO DE RENOVAÇÃO / CAPITALIZAÇÃO DE CRÉDITO</h2>
            <p style="margin:4px 0 0;color:#64748b;font-size:12px">Documento de Renegociação e Consolidação de Dívida</p>
          </div>
          <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin-bottom:16px">
            <p style="margin:0 0 4px;font-size:12px;color:#6b21a8;font-weight:bold">MODALIDADE: ${item.mode === "renovacao_remanescente" ? "RENOVAÇÃO DO CRÉDITO PELO SALDO REMANESCENTE" : "CAPITALIZAÇÃO DE ENCARGOS E JUROS"}</p>
            <p style="margin:0;font-size:12px;color:#581c87">Consolidação e repactuação das condições de pagamento do crédito.</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
            <tbody>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold;width:35%">Cliente:</td><td style="padding:8px">${item.clientName} (ID: #${item.clientId})</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Contrato Original:</td><td style="padding:8px;font-family:monospace">${item.originalContractNo}</td></tr>
              ${item.newContractNo ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold;color:#16a34a">Novo Contrato Renovado:</td><td style="padding:8px;font-weight:bold;color:#16a34a">${item.newContractNo}</td></tr>` : ""}
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Saldo Anterior:</td><td style="padding:8px">${formatCurrencyMT(item.previousBalance)}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Montante Capitalizado/Renovado:</td><td style="padding:8px;font-weight:bold;color:#6b21a8">${formatCurrencyMT(item.capitalizedAmount)}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Novo Saldo Devedor Consolidado:</td><td style="padding:8px;font-weight:bold">${formatCurrencyMT(item.newBalance)}</td></tr>
              ${item.newMonths ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Novo Prazo Repactuado:</td><td style="padding:8px">${item.newMonths} meses (${item.newRate}% taxa)</td></tr>` : ""}
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Data da Operação:</td><td style="padding:8px">${item.operationDate}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Operador:</td><td style="padding:8px">${item.operatorName}</td></tr>
            </tbody>
          </table>
          <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:40px">Documento processado por computador aos ${now}</p>
        </div>
      `,
    });
  };
  const filteredActive = creditos.filter((c) =>
    c.estado === "ativo" &&
    c.saldoDevedor > 0 &&
    (c.cliente.toLowerCase().includes(search.toLowerCase()) || c.contrato.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredHistory = history.filter((h) =>
    h.clientName.toLowerCase().includes(search.toLowerCase()) ||
    h.originalContractNo.toLowerCase().includes(search.toLowerCase()) ||
    (h.newContractNo && h.newContractNo.toLowerCase().includes(search.toLowerCase()))
  );

  const totalRenovado = history.filter(h => h.mode === "renovacao_remanescente").reduce((s, h) => s + h.capitalizedAmount, 0);
  const totalEncargosCap = history.filter(h => h.mode === "capitalizacao_encargos").reduce((s, h) => s + h.capitalizedAmount, 0);

  if (!canApply) {
    return <div className="p-8 text-center text-slate-500">Sem permissão para gerir capitalização.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg text-white">
          <RefreshCcw className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Módulo de Capitalização e Renovação</h1>
          <p className="text-sm text-slate-500">Renovação de crédito pelo saldo remanescente da dívida e capitalização de encargos</p>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total em Dívidas Renovadas</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{formatCurrencyMT(totalRenovado)}</p>
          <p className="text-xs text-slate-400 mt-1">{history.filter(h => h.mode === "renovacao_remanescente").length} contratos refinanciados no saldo devedor</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Encargos Capitalizados</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrencyMT(totalEncargosCap)}</p>
          <p className="text-xs text-slate-400 mt-1">Juros vencidos incorporados ao saldo principal</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total de Operações</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{history.length}</p>
          <p className="text-xs text-slate-400 mt-1">Repactuações concluídas</p>
        </div>
      </div>

      {/* Busca */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por cliente ou contrato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: Créditos Ativos Elegíveis para Renovação */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm">Créditos Ativos com Saldo Remanescente</h3>
            <p className="text-xs text-slate-500">Selecione para renovar o crédito no valor restante da dívida</p>
          </div>
          <div className="p-4 overflow-y-auto max-h-[500px] space-y-3">
            {filteredActive.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Nenhum crédito em aberto encontrado.</p>
            ) : (
              filteredActive.map((c) => (
                <div key={c.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{c.cliente}</div>
                    <div className="text-xs text-slate-500 font-mono">{c.contrato}</div>
                    <div className="text-xs font-semibold text-slate-700 mt-1">
                      Saldo Remanescente: <span className="text-purple-600 font-bold">{formatCurrencyMT(c.saldoDevedor)}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenModal(c)}
                    className="h-8 px-3 text-xs text-purple-600 border-purple-200 hover:bg-purple-50 font-medium"
                  >
                    <RefreshCcw className="w-3.5 h-3.5 mr-1" />
                    Renovar / Capitalizar
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Coluna 2: Histórico de Renovações e Capitalizações */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm">Histórico de Renovações e Capitalizações</h3>
            <p className="text-xs text-slate-500">Contratos repactuados e encargos consolidados</p>
          </div>
          <div className="p-4 overflow-y-auto max-h-[500px] space-y-3">
            {filteredHistory.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Nenhuma operação realizada até o momento.</p>
            ) : (
              filteredHistory.map((h) => (
                <div key={h.id} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 text-sm">{h.clientName}</span>
                      <span className="text-xs text-slate-400 font-mono ml-2">({h.originalContractNo})</span>
                    </div>
                    <Badge className="bg-purple-100 text-purple-700 border-none text-[11px]">
                      {h.mode === "renovacao_remanescente" ? "Renovação de Dívida" : "Capitalização"}
                    </Badge>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    {h.newContractNo && (
                      <div className="text-purple-700 font-semibold">
                        Novo Contrato Renovado: {h.newContractNo} ({h.newMonths} meses a {h.newRate}%)
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span><strong>Saldo Repactuado:</strong> {formatCurrencyMT(h.newBalance)}</span>
                      <span><strong>Data:</strong> {h.operationDate}</span>
                    </div>
                    <p className="italic text-slate-500 pt-1">"{h.notes}"</p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePrintCapitalizacao(h)}
                      className="h-7 px-2 text-xs text-slate-600"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" />
                      Termo
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Processar Renovação / Capitalização */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-purple-600">
              <RefreshCcw className="w-5 h-5" />
              Renovação e Capitalização de Crédito
            </DialogTitle>
            <DialogDescription>
              Repactue a dívida remanescente em novo contrato ou incorpore juros ao saldo.
            </DialogDescription>
          </DialogHeader>

          {selectedCredit && (
            <form onSubmit={handleConfirmOperation} className="space-y-4 pt-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><span className="font-bold text-slate-800">{selectedCredit.cliente}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Contrato Original:</span><span className="font-mono text-slate-800">{selectedCredit.contrato}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Saldo Devedor Remanescente:</span><span className="font-bold text-purple-600 text-sm">{formatCurrencyMT(selectedCredit.saldoDevedor)}</span></div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700">Modalidade da Operação</Label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Button
                    type="button"
                    variant={mode === "renovacao_remanescente" ? "default" : "outline"}
                    onClick={() => setMode("renovacao_remanescente")}
                    className="h-10 text-xs"
                  >
                    Renovar Saldo Remanescente
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "capitalizacao_encargos" ? "default" : "outline"}
                    onClick={() => setMode("capitalizacao_encargos")}
                    className="h-10 text-xs"
                  >
                    Capitalizar Encargos (%)
                  </Button>
                </div>
              </div>

              {mode === "renovacao_remanescente" ? (
                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg space-y-3">
                  <div className="font-semibold text-xs text-purple-900 flex items-center gap-1">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    Condições do Novo Financiamento
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-700">Novo Prazo (Meses)</Label>
                      <select
                        value={newMonths}
                        onChange={(e) => setNewMonths(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white"
                      >
                        {[1, 2, 3, 4, 6, 12].map((m) => (
                          <option key={m} value={m}>{m} {m === 1 ? "Mês" : "Meses"}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-700">Taxa Mensal (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                        className="h-10 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-700">Percentagem de Encargos a Capitalizar (%)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={encargosPercent}
                      onChange={(e) => setEncargosPercent(e.target.value)}
                      className="h-10 text-sm font-bold"
                    />
                  </div>
                  <div className="text-xs text-slate-600">
                    Encargos calculados: <strong>{formatCurrencyMT(Math.round(selectedCredit.saldoDevedor * (Number(encargosPercent || 0) / 100)))}</strong>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Observações da Renegociação</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações adicionais..."
                  className="h-10 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="bg-purple-600 hover:bg-purple-700 text-white font-medium">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Operação"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
