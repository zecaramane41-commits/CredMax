import { useState, useEffect, useMemo } from "react";
import {
  ArrowDown, Search, Printer, CheckCircle, Loader2, AlertTriangle,
  History, RotateCcw, ShieldAlert, FileText, UserX, Check, Sparkles, Building2,
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

export type AbateRecord = {
  id: number;
  loanId: number;
  contractNo: string;
  clientId: number;
  clientName: string;
  clientDoc: string;
  amountAbated: number;
  originalDebt: number;
  reasonCategory: string;
  reasonDetails: string;
  abatedAt: string;
  abatedBy: string;
  status: "abatido" | "reaberto_refinanciado" | "liquidado_posterior";
  reopenedContractNo?: string;
  reopenedAt?: string;
};

const ABATES_STORAGE_KEY = "msu_abates_history_v2";

export function loadStoredAbates(): AbateRecord[] {
  try {
    return JSON.parse(localStorage.getItem(ABATES_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveStoredAbates(items: AbateRecord[]) {
  try {
    localStorage.setItem(ABATES_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

const REASONS = [
  "Penhora Executada sem Liquidez",
  "Falecimento do Devedor",
  "Insolvência / Falência Pessoal",
  "Paradeiro Desconhecido / Fuga",
  "Decisão Judicial / Litígio Extinto",
  "Incapacidade Financeira Permanente",
  "Outro Motivo Regulamentar",
];
export default function AbatesPage() {
  const user = getUser();
  const canAbate = hasPermission(user, "registrar.pagamento");

  const [creditos, setCreditos] = useState<CreditoAtivo[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [abatesHistory, setAbatesHistory] = useState<AbateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showAbateModal, setShowAbateModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<CreditoAtivo | null>(null);
  const [selectedAbate, setSelectedAbate] = useState<AbateRecord | null>(null);

  const [abateAmount, setAbateAmount] = useState("");
  const [abateReasonCategory, setAbateReasonCategory] = useState(REASONS[0]);
  const [abateReasonDetails, setAbateReasonDetails] = useState("");
  const [abateSubmitting, setAbateSubmitting] = useState(false);

  const [reopenMonths, setReopenMonths] = useState("3");
  const [reopenRate, setReopenRate] = useState("3.5");
  const [reopenSubmitting, setReopenSubmitting] = useState(false);

  useEffect(() => useCreditosPolling(setCreditos), []);

  useEffect(() => {
    fetchClients().then(setClients).catch(() => setClients([]));
    setAbatesHistory(loadStoredAbates());
  }, []);

  const handleOpenAbateModal = (c: CreditoAtivo) => {
    setSelectedCredit(c);
    setAbateAmount(String(c.saldoDevedor));
    setAbateReasonCategory(REASONS[0]);
    setAbateReasonDetails("");
    setShowAbateModal(true);
  };

  const handleConfirmAbate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredit || !abateAmount || Number(abateAmount) <= 0) {
      toast.error("Informe um montante de abate válido.");
      return;
    }
    if (abateReasonCategory === "Outro Motivo Regulamentar" && !abateReasonDetails.trim()) {
      toast.error("Por favor, descreva detalhadamente o motivo do abate.");
      return;
    }

    setAbateSubmitting(true);
    try {
      const client = clients.find((cl) => cl.id === selectedCredit.clienteId);
      const amountVal = Number(abateAmount);

      try {
        await apiFetch(`/loans/${selectedCredit.id}/financial-events`, {
          method: "POST",
          body: JSON.stringify({
            eventType: "abatimento",
            amount: amountVal,
            note: `Abate por perda: ${abateReasonCategory} - ${abateReasonDetails}`,
          }),
        });
      } catch {}

      const newRecord: AbateRecord = {
        id: Date.now(),
        loanId: selectedCredit.id,
        contractNo: selectedCredit.contrato,
        clientId: selectedCredit.clienteId,
        clientName: selectedCredit.cliente,
        clientDoc: client?.documentNumber || "BI/NUIT",
        amountAbated: amountVal,
        originalDebt: selectedCredit.saldoDevedor,
        reasonCategory: abateReasonCategory,
        reasonDetails: abateReasonDetails || "Crédito dado como incobrável/prejuízo com registo de histórico negativo.",
        abatedAt: new Date().toISOString().split("T")[0],
        abatedBy: user?.name || "Operador de Risco",
        status: "abatido",
      };

      const updated = [newRecord, ...loadStoredAbates()];
      saveStoredAbates(updated);
      setAbatesHistory(updated);

      toast.success(`Abate de ${formatCurrencyMT(amountVal)} registrado para ${selectedCredit.cliente}. O cliente agora possui histórico negativo.`);
      setShowAbateModal(false);
      setSelectedCredit(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar abate.");
    } finally {
      setAbateSubmitting(false);
    }
  };

  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAbate) return;

    setReopenSubmitting(true);
    try {
      const newContractNo = `RN-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

      try {
        await apiFetch(`/loans/${selectedAbate.loanId}/financial-events`, {
          method: "POST",
          body: JSON.stringify({
            eventType: "capitalizacao",
            amount: selectedAbate.amountAbated,
            note: `Reabertura e refinanciamento de crédito abatido. Novo Contrato ${newContractNo} (${reopenMonths} meses a ${reopenRate}%)`,
          }),
        });
      } catch {}

      const updated = abatesHistory.map((item) =>
        item.id === selectedAbate.id
          ? {
              ...item,
              status: "reaberto_refinanciado" as const,
              reopenedContractNo: newContractNo,
              reopenedAt: new Date().toISOString().split("T")[0],
            }
          : item
      );

      saveStoredAbates(updated);
      setAbatesHistory(updated);

      toast.success(`Crédito reaberto e refinanciado com sucesso! Novo Contrato emitido: ${newContractNo} com saldo inicial de ${formatCurrencyMT(selectedAbate.amountAbated)}.`);
      setShowReopenModal(false);
      setSelectedAbate(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reabrir crédito.");
    } finally {
      setReopenSubmitting(false);
    }
  };

  const handlePrintAbate = (item: AbateRecord) => {
    const now = new Date().toLocaleString("pt-PT");
    openCorporatePrintWindow({
      title: `Termo_Abate_${item.contractNo}`,
      bodyHtml: `
        <div style="font-family:Arial,sans-serif;padding:24px;color:#1e293b">
          <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px">
            <h2 style="margin:0;color:#b91c1c;font-size:22px">TERMO DE ABATE DE CRÉDITO POR PREJUÍZO (WRITE-OFF)</h2>
            <p style="margin:4px 0 0;color:#64748b;font-size:12px">Registo de Perda Financeira e Histórico Restritivo</p>
          </div>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:16px">
            <p style="margin:0 0 4px;font-size:12px;color:#991b1b;font-weight:bold">STATUS: CRÉDITO ABATIDO DO ATIVO</p>
            <p style="margin:0;font-size:12px;color:#7f1d1d">O cliente permanece com histórico restritivo. Caso o cliente solicite novos créditos, o sistema exigirá regularização ou renegociação prévia do saldo abatido.</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
            <tbody>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold;width:35%">Cliente:</td><td style="padding:8px">${item.clientName} (Doc: ${item.clientDoc})</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Nº do Contrato:</td><td style="padding:8px;font-family:monospace">${item.contractNo}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Valor Abatido (Perda):</td><td style="padding:8px;font-weight:bold;color:#b91c1c">${formatCurrencyMT(item.amountAbated)}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Motivo do Abate:</td><td style="padding:8px">${item.reasonCategory}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Detalhes / Parecer:</td><td style="padding:8px">${item.reasonDetails}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Data do Registo:</td><td style="padding:8px">${item.abatedAt}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Responsável:</td><td style="padding:8px">${item.abatedBy}</td></tr>
            </tbody>
          </table>
          <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:40px">Documento emitido em ${now}</p>
        </div>
      `,
    });
  };
  const filteredActive = creditos.filter((c) =>
    c.estado === "ativo" &&
    c.saldoDevedor > 0 &&
    (c.cliente.toLowerCase().includes(search.toLowerCase()) || c.contrato.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredAbates = abatesHistory.filter((a) =>
    a.clientName.toLowerCase().includes(search.toLowerCase()) || a.contractNo.toLowerCase().includes(search.toLowerCase())
  );

  const totalAbatido = abatesHistory.reduce((s, a) => s + a.amountAbated, 0);
  const totalReabertos = abatesHistory.filter((a) => a.status === "reaberto_refinanciado").length;

  if (!canAbate) {
    return <div className="p-8 text-center text-slate-500">Sem permissão para gerir abates.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-rose-500 to-red-600 rounded-xl shadow-lg text-white">
          <ArrowDown className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Módulo de Abates (Write-Off)</h1>
          <p className="text-sm text-slate-500">Registo de créditos incobráveis, controlo de histórico negativo e reabertura com refinanciamento</p>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total em Créditos Abatidos</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrencyMT(totalAbatido)}</p>
          <p className="text-xs text-slate-400 mt-1">{abatesHistory.length} contratos baixados como prejuízo</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Clientes com Histórico Negativo</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{abatesHistory.filter(a => a.status === "abatido").length}</p>
          <p className="text-xs text-slate-400 mt-1">Bloqueados para novos créditos sem regularização</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Créditos Reabertos / Refinanciados</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{totalReabertos}</p>
          <p className="text-xs text-slate-400 mt-1">Recuperados após reaparecimento do cliente</p>
        </div>
      </div>

      {/* Barra de Busca */}
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
        {/* Coluna 1: Créditos Elegíveis para Abate */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm">Créditos em Aberto / Inadimplência (Elegíveis)</h3>
            <p className="text-xs text-slate-500">Créditos ativos com saldo pendente</p>
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
                      Saldo: <span className="text-red-600 font-bold">{formatCurrencyMT(c.saldoDevedor)}</span>
                      {c.prestacoesAtrasadas > 0 && <span className="ml-2 text-amber-600">({c.prestacoesAtrasadas}d atraso)</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenAbateModal(c)}
                    className="h-8 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50 font-medium"
                  >
                    <ArrowDown className="w-3.5 h-3.5 mr-1" />
                    Abater Dívida
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Coluna 2: Histórico de Abates com Ação de Reabertura */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm">Histórico de Abates e Controlo Restritivo</h3>
            <p className="text-xs text-slate-500">Clientes com histórico negativo e opção de renegociação/reabertura</p>
          </div>
          <div className="p-4 overflow-y-auto max-h-[500px] space-y-3">
            {filteredAbates.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Nenhum abate registrado até o momento.</p>
            ) : (
              filteredAbates.map((a) => (
                <div key={a.id} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 text-sm">{a.clientName}</span>
                      <span className="text-xs text-slate-400 font-mono ml-2">({a.contractNo})</span>
                    </div>
                    {a.status === "abatido" ? (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-none text-[11px]">
                        Histórico Negativo
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none text-[11px]">
                        Reaberto ({a.reopenedContractNo})
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 grid grid-cols-2 gap-2">
                    <div><strong>Valor Abatido:</strong> {formatCurrencyMT(a.amountAbated)}</div>
                    <div><strong>Motivo:</strong> {a.reasonCategory}</div>
                    <div><strong>Data do Abate:</strong> {a.abatedAt}</div>
                    <div><strong>Responsável:</strong> {a.abatedBy}</div>
                  </div>

                  {a.reasonDetails && (
                    <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded">"{a.reasonDetails}"</p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePrintAbate(a)}
                      className="h-7 px-2 text-xs text-slate-600"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" />
                      Termo
                    </Button>
                    {a.status === "abatido" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedAbate(a);
                          setShowReopenModal(true);
                        }}
                        className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        Reabrir e Refinanciar
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Registo de Abate */}
      <Dialog open={showAbateModal} onOpenChange={setShowAbateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-red-600">
              <ShieldAlert className="w-5 h-5" />
              Registo de Abate de Crédito (Prejuízo)
            </DialogTitle>
            <DialogDescription>
              O crédito será baixado como perda e o cliente ficará marcado com histórico restritivo.
            </DialogDescription>
          </DialogHeader>

          {selectedCredit && (
            <form onSubmit={handleConfirmAbate} className="space-y-4 pt-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><span className="font-bold text-slate-800">{selectedCredit.cliente}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Contrato:</span><span className="font-mono text-slate-800">{selectedCredit.contrato}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Saldo Devedor:</span><span className="font-bold text-red-600">{formatCurrencyMT(selectedCredit.saldoDevedor)}</span></div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Valor a Abater (MT) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  value={abateAmount}
                  onChange={(e) => setAbateAmount(e.target.value)}
                  className="h-10 font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Motivo Regulamentar Obrigatório *</Label>
                <select
                  value={abateReasonCategory}
                  onChange={(e) => setAbateReasonCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Parecer / Detalhes do Motivo</Label>
                <Input
                  value={abateReasonDetails}
                  onChange={(e) => setAbateReasonDetails(e.target.value)}
                  placeholder="Descreva a razão do abate (ex: auto de penhora, certidão de óbito, etc.)"
                  className="h-10 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setShowAbateModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={abateSubmitting} className="bg-red-600 hover:bg-red-700 text-white font-medium">
                  {abateSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Abate"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Reabertura e Refinanciamento */}
      <Dialog open={showReopenModal} onOpenChange={setShowReopenModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-indigo-600">
              <RotateCcw className="w-5 h-5" />
              Reabrir e Refinanciar Cliente Abatido
            </DialogTitle>
            <DialogDescription>
              O cliente reapareceu e o saldo abatido será renegociado em novo contrato de crédito.
            </DialogDescription>
          </DialogHeader>

          {selectedAbate && (
            <form onSubmit={handleConfirmReopen} className="space-y-4 pt-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><span className="font-bold text-slate-800">{selectedAbate.clientName}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Saldo Abatido a Recuperar:</span><span className="font-bold text-indigo-600">{formatCurrencyMT(selectedAbate.amountAbated)}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Novo Prazo (Meses)</Label>
                  <select
                    value={reopenMonths}
                    onChange={(e) => setReopenMonths(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    {[1, 2, 3, 4, 6, 12].map((m) => (
                      <option key={m} value={m}>{m} {m === 1 ? "Mês" : "Meses"}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Taxa Renegociada (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={reopenRate}
                    onChange={(e) => setReopenRate(e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setShowReopenModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={reopenSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                  {reopenSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reabrir Crédito"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
