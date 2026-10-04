import { useState, useEffect, useMemo } from "react";
import {
  Undo2, Search, Printer, CheckCircle, Loader2, AlertTriangle,
  RotateCcw, ArrowRightLeft, Check, FileText, UserCheck, Banknote,
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
import type { ReembolsoRecord } from "./ReembolsosPage";

export type ExtornoRecord = {
  id: number;
  originalReceiptNo: string;
  reversalDate: string;
  sourceClientId: number;
  sourceClientName: string;
  sourceContractNo: string;
  destinationClientId?: number;
  destinationClientName?: string;
  destinationContractNo?: string;
  newReceiptNo?: string;
  amount: number;
  reversalType: "simples" | "transferencia_cliente";
  reason: string;
  reversedBy: string;
  status: "executado" | "pendente";
};

const EXTORNOS_STORAGE_KEY = "msu_extornos_history_v2";

export function loadStoredExtornos(): ExtornoRecord[] {
  try {
    return JSON.parse(localStorage.getItem(EXTORNOS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveStoredExtornos(items: ExtornoRecord[]) {
  try {
    localStorage.setItem(EXTORNOS_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}
export default function ExtornosPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.operacoes");

  const [creditos, setCreditos] = useState<CreditoAtivo[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [reembolsos, setReembolsos] = useState<ReembolsoRecord[]>([]);
  const [extornos, setExtornos] = useState<ExtornoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [targetReembolso, setTargetReembolso] = useState<ReembolsoRecord | null>(null);

  const [reversalType, setReversalType] = useState<"simples" | "transferencia_cliente">("transferencia_cliente");
  const [destClientId, setDestClientId] = useState<number | "">("");
  const [destLoanId, setDestLoanId] = useState<number | "">("");
  const [reversalReason, setReversalReason] = useState("Pagamento lançado para cliente incorreto");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => useCreditosPolling(setCreditos), []);

  useEffect(() => {
    fetchClients().then(setClients).catch(() => setClients([]));
    setExtornos(loadStoredExtornos());

    // Carrega histórico de reembolsos elegíveis para estorno
    try {
      const stored = JSON.parse(localStorage.getItem("msu_historico_reembolsos_v2") || "[]");
      setReembolsos(stored);
    } catch {}

    apiFetch<{ items?: any[]; reimbursements?: any[] }>("/loans/payments/reimbursements")
      .then((res) => {
        const raw = res.items || res.reimbursements || [];
        if (raw.length > 0) {
          const mapped: ReembolsoRecord[] = raw.map((r: any) => ({
            id: Number(r.id || Date.now()),
            receiptNo: String(r.receiptNo || r.receipt_no || `REC-${r.id}`),
            paymentDate: String(r.paymentDate || r.payment_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
            clientId: Number(r.clientId || r.client_id || 0),
            clientName: String(r.clientName || r.client_name || r.client || "Cliente"),
            loanId: r.loanId || r.loan_id ? Number(r.loanId || r.loan_id) : undefined,
            contractNo: String(r.contractNo || r.contract_no || "—"),
            managerName: String(r.managerName || r.manager_name || "Gestor"),
            carteiraName: String(r.carteiraName || r.product || "Geral"),
            amountReceived: Number(r.amountReceived || r.amount_received || r.amount || 0),
            principalApplied: Number(r.principalApplied || r.principal_applied || 0),
            interestApplied: Number(r.interestApplied || r.interest_applied || 0),
            moraApplied: Number(r.moraApplied || r.mora_applied || 0),
            destinationAccount: String(r.destinationAccount || r.destination_account || "Caixa Geral"),
            notes: String(r.notes || r.note || ""),
          }));
          setReembolsos((prev) => {
            const combined = [...mapped];
            prev.forEach((p) => {
              if (!combined.some((c) => c.receiptNo === p.receiptNo || c.id === p.id)) combined.push(p);
            });
            return combined;
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleOpenExtornoModal = (r: ReembolsoRecord) => {
    setTargetReembolso(r);
    setReversalType("transferencia_cliente");
    setDestClientId("");
    setDestLoanId("");
    setReversalReason("Pagamento creditado no contrato errado. Transferência para o cliente/contrato correto.");
    setShowModal(true);
  };

  const handleExecuteExtorno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetReembolso) return;

    if (reversalType === "transferencia_cliente" && (!destClientId || !destLoanId)) {
      toast.error("Por favor, selecione o cliente e contrato correto de destino.");
      return;
    }

    setSubmitting(true);
    try {
      const destClient = clients.find((c) => c.id === destClientId);
      const destLoan = creditos.find((c) => c.id === destLoanId);
      const newRecNo = `REC-CORR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

      try {
        await apiFetch(`/loans/${targetReembolso.loanId || 0}/financial-events`, {
          method: "POST",
          body: JSON.stringify({
            eventType: "estorno",
            amount: targetReembolso.amountReceived,
            note: `${reversalReason} (Recibo original: ${targetReembolso.receiptNo})`,
            payload: {
              reversalType,
              sourceReceiptNo: targetReembolso.receiptNo,
              sourceClientId: targetReembolso.clientId,
              destinationClientId: destClientId || undefined,
              destinationLoanId: destLoanId || undefined,
              newReceiptNo: reversalType === "transferencia_cliente" ? newRecNo : undefined,
            },
          }),
        });

        if (reversalType === "transferencia_cliente" && destClientId && destLoanId) {
          await apiFetch("/loans/payments/apply", {
            method: "POST",
            body: JSON.stringify({
              clientId: Number(destClientId),
              loanId: Number(destLoanId),
              amount: targetReembolso.amountReceived,
              paymentDate: new Date().toISOString().split("T")[0],
              note: `Transferência de pagamento estornado do recibo ${targetReembolso.receiptNo} (${targetReembolso.clientName})`,
            }),
          });
        }
      } catch {}

      const newExtorno: ExtornoRecord = {
        id: Date.now(),
        originalReceiptNo: targetReembolso.receiptNo,
        reversalDate: new Date().toISOString().split("T")[0],
        sourceClientId: targetReembolso.clientId,
        sourceClientName: targetReembolso.clientName,
        sourceContractNo: targetReembolso.contractNo,
        destinationClientId: destClientId ? Number(destClientId) : undefined,
        destinationClientName: destClient?.name,
        destinationContractNo: destLoan?.contrato,
        newReceiptNo: reversalType === "transferencia_cliente" ? newRecNo : undefined,
        amount: targetReembolso.amountReceived,
        reversalType,
        reason: reversalReason,
        reversedBy: user?.name || "Operador",
        status: "executado",
      };

      const updatedExtornos = [newExtorno, ...loadStoredExtornos()];
      saveStoredExtornos(updatedExtornos);
      setExtornos(updatedExtornos);

      // Remove ou marca o recibo no histórico de reembolsos local
      const updatedReembolsos = reembolsos.filter((r) => r.receiptNo !== targetReembolso.receiptNo);
      setReembolsos(updatedReembolsos);
      try {
        localStorage.setItem("msu_historico_reembolsos_v2", JSON.stringify(updatedReembolsos));
      } catch {}

      toast.success(
        reversalType === "transferencia_cliente"
          ? `Estorno e transferência concluídos! Novo recibo ${newRecNo} emitido para ${destClient?.name}.`
          : `Estorno simples concluído. O lançamento do recibo ${targetReembolso.receiptNo} foi anulado.`
      );

      setShowModal(false);
      setTargetReembolso(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar estorno.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintExtorno = (item: ExtornoRecord) => {
    const now = new Date().toLocaleString("pt-PT");
    openCorporatePrintWindow({
      title: `Termo_Estorno_${item.originalReceiptNo}`,
      bodyHtml: `
        <div style="font-family:Arial,sans-serif;padding:24px;color:#1e293b">
          <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px">
            <h2 style="margin:0;color:#c2410c;font-size:22px">TERMO DE ESTORNO E CORREÇÃO DE PAGAMENTO</h2>
            <p style="margin:4px 0 0;color:#64748b;font-size:12px">Documento de Retificação e Ajuste Contábil</p>
          </div>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-bottom:16px">
            <p style="margin:0 0 4px;font-size:12px;color:#9a3412;font-weight:bold">TIPO DE OPERAÇÃO: ${item.reversalType === "transferencia_cliente" ? "ESTORNO COM REAPLICAÇÃO / TRANSFERÊNCIA DE CLIENTE" : "ESTORNO SIMPLES (ANULAÇÃO)"}</p>
            <p style="margin:0;font-size:12px;color:#7c2d12">O lançamento original do Recibo <strong>${item.originalReceiptNo}</strong> foi devidamente revertido no sistema.</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
            <tbody>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold;width:35%">Cliente de Origem (Incorreto):</td><td style="padding:8px">${item.sourceClientName} (${item.sourceContractNo})</td></tr>
              ${item.destinationClientName ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold;color:#16a34a">Cliente de Destino (Correto):</td><td style="padding:8px;font-weight:bold;color:#16a34a">${item.destinationClientName} (${item.destinationContractNo}) - Novo Recibo: ${item.newReceiptNo}</td></tr>` : ""}
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Montante Estornado:</td><td style="padding:8px;font-weight:bold;color:#c2410c">${formatCurrencyMT(item.amount)}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Justificativa da Correção:</td><td style="padding:8px">${item.reason}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Data do Estorno:</td><td style="padding:8px">${item.reversalDate}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:8px;font-weight:bold">Operador Responsável:</td><td style="padding:8px">${item.reversedBy}</td></tr>
            </tbody>
          </table>
          <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:40px">Processado aos ${now}</p>
        </div>
      `,
    });
  };
  const filteredReembolsos = reembolsos.filter((r) =>
    r.clientName.toLowerCase().includes(search.toLowerCase()) ||
    r.contractNo.toLowerCase().includes(search.toLowerCase()) ||
    r.receiptNo.toLowerCase().includes(search.toLowerCase())
  );

  const filteredExtornos = extornos.filter((e) =>
    e.sourceClientName.toLowerCase().includes(search.toLowerCase()) ||
    e.originalReceiptNo.toLowerCase().includes(search.toLowerCase()) ||
    (e.destinationClientName && e.destinationClientName.toLowerCase().includes(search.toLowerCase()))
  );

  const totalEstornado = extornos.reduce((s, e) => s + e.amount, 0);

  if (!canView) {
    return <div className="p-8 text-center text-slate-500">Sem permissão para aceder aos extornos.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl shadow-lg text-white">
          <Undo2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Módulo de Extornos e Transferências</h1>
          <p className="text-sm text-slate-500">Reversão de pagamentos errados e reaplicação imediata para o cliente/contrato correto</p>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total em Valores Estornados</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{formatCurrencyMT(totalEstornado)}</p>
          <p className="text-xs text-slate-400 mt-1">{extornos.length} operações de estorno concluídas</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Transferências entre Clientes</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{extornos.filter(e => e.reversalType === "transferencia_cliente").length}</p>
          <p className="text-xs text-slate-400 mt-1">Pagamentos corrigidos com novo recibo emitido</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Estornos Simples (Anulações)</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{extornos.filter(e => e.reversalType === "simples").length}</p>
          <p className="text-xs text-slate-400 mt-1">Lançamentos anulados por duplicidade/erro</p>
        </div>
      </div>

      {/* Busca */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por cliente, contrato ou recibo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: Pagamentos Elegíveis para Estorno */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm">Pagamentos e Reembolsos Recentes</h3>
            <p className="text-xs text-slate-500">Selecione um pagamento para estornar ou transferir</p>
          </div>
          <div className="p-4 overflow-y-auto max-h-[500px] space-y-3">
            {filteredReembolsos.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Nenhum pagamento recente encontrado.</p>
            ) : (
              filteredReembolsos.map((r) => (
                <div key={r.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{r.clientName}</span>
                      <span className="font-mono text-xs px-1.5 py-0.5 bg-slate-200 rounded text-slate-700">{r.receiptNo}</span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{r.contractNo} • {r.paymentDate}</div>
                    <div className="text-xs font-bold text-emerald-600 mt-1">
                      {formatCurrencyMT(r.amountReceived)} <span className="text-[11px] font-normal text-slate-500">({r.destinationAccount})</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenExtornoModal(r)}
                    className="h-8 px-3 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 font-medium"
                  >
                    <Undo2 className="w-3.5 h-3.5 mr-1" />
                    Estornar
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Coluna 2: Histórico de Extornos e Reversões */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm">Histórico de Extornos e Transferências Realizadas</h3>
            <p className="text-xs text-slate-500">Registo oficial de retificações e transferências</p>
          </div>
          <div className="p-4 overflow-y-auto max-h-[500px] space-y-3">
            {filteredExtornos.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Nenhum estorno realizado até o momento.</p>
            ) : (
              filteredExtornos.map((e) => (
                <div key={e.id} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 text-sm">Recibo Origem: {e.originalReceiptNo}</span>
                    </div>
                    <Badge className="bg-orange-100 text-orange-700 border-none text-[11px]">
                      {e.reversalType === "transferencia_cliente" ? "Transferência" : "Estorno Simples"}
                    </Badge>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    <div><strong>Cliente Errado (Origem):</strong> {e.sourceClientName} ({e.sourceContractNo})</div>
                    {e.destinationClientName && (
                      <div className="text-emerald-700 font-medium">
                        <strong>Cliente Correto (Destino):</strong> {e.destinationClientName} ({e.destinationContractNo}) • Recibo: {e.newReceiptNo}
                      </div>
                    )}
                    <div className="flex justify-between pt-1">
                      <span><strong>Valor:</strong> {formatCurrencyMT(e.amount)}</span>
                      <span><strong>Data:</strong> {e.reversalDate}</span>
                    </div>
                    <p className="italic text-slate-500 pt-1">"{e.reason}"</p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePrintExtorno(e)}
                      className="h-7 px-2 text-xs text-slate-600"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" />
                      Termo de Estorno
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Processar Estorno */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-orange-600">
              <Undo2 className="w-5 h-5" />
              Estorno e Retificação de Pagamento
            </DialogTitle>
            <DialogDescription>
              Reverta o pagamento lançado incorretamente e, opcionalmente, aplique-o para o cliente correto.
            </DialogDescription>
          </DialogHeader>

          {targetReembolso && (
            <form onSubmit={handleExecuteExtorno} className="space-y-4 pt-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Recibo Original:</span><span className="font-mono font-bold text-slate-800">{targetReembolso.receiptNo}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Cliente Atual (Incorreto):</span><span className="font-bold text-slate-800">{targetReembolso.clientName}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Contrato:</span><span className="font-mono text-slate-800">{targetReembolso.contractNo}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Valor Pago a Estornar:</span><span className="font-bold text-orange-600 text-sm">{formatCurrencyMT(targetReembolso.amountReceived)}</span></div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700">Modalidade de Estorno</Label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Button
                    type="button"
                    variant={reversalType === "transferencia_cliente" ? "default" : "outline"}
                    onClick={() => setReversalType("transferencia_cliente")}
                    className="h-10 text-xs"
                  >
                    Estornar e Pagar p/ Outro Cliente
                  </Button>
                  <Button
                    type="button"
                    variant={reversalType === "simples" ? "default" : "outline"}
                    onClick={() => setReversalType("simples")}
                    className="h-10 text-xs"
                  >
                    Estorno Simples (Anular)
                  </Button>
                </div>
              </div>

              {reversalType === "transferencia_cliente" && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-3">
                  <div className="font-semibold text-xs text-emerald-900 flex items-center gap-1">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    Destino do Pagamento (Cliente Correto)
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-700">Cliente Correto *</Label>
                    <select
                      required
                      value={destClientId}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : "";
                        setDestClientId(id);
                        const userCredit = creditos.find((c) => c.clienteId === id && c.estado === "ativo");
                        if (userCredit) setDestLoanId(userCredit.id);
                      }}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      <option value="">Selecione o Cliente Correto</option>
                      {clients
                        .filter((c) => c.id !== targetReembolso.clientId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.phone || "Sem tel"})</option>
                        ))}
                    </select>
                  </div>

                  {destClientId && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-700">Contrato de Destino *</Label>
                      <select
                        required
                        value={destLoanId}
                        onChange={(e) => setDestLoanId(e.target.value ? Number(e.target.value) : "")}
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white"
                      >
                        <option value="">Selecione o Contrato</option>
                        {creditos
                          .filter((c) => c.clienteId === destClientId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.contrato} — Saldo: {formatCurrencyMT(c.saldoDevedor)}</option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Justificativa da Reversão *</Label>
                <Input
                  required
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Explique o motivo do estorno..."
                  className="h-10 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="bg-orange-600 hover:bg-orange-700 text-white font-medium">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Estorno"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
