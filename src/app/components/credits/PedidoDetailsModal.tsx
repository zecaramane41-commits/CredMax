import { useState, useEffect } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Percent,
  RefreshCcw,
  Users,
  XCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import type { Pedido } from "../../../../shared/types";
import { ESTADO_LABEL, ESTADO_COLOR } from "../../../../shared/types";
import { atualizarEstadoPedido as updatePedidoEstado } from "../../lib/loans";
import { formatCurrencyMT } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";

type Props = {
  pedido: Pedido | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
};

type StageEdit = {
  valor: string;
  data: string;
};

export default function PedidoDetailsModal({ pedido, open, onOpenChange, onUpdate }: Props) {
  const [editMode, setEditMode] = useState<"analise" | "aprovacao" | "autorizacao" | "desembolso" | null>(null);
  const [editValues, setEditValues] = useState<StageEdit>({ valor: "", data: "" });
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [activePedido, setActivePedido] = useState<Pedido | null>(null);

  useEffect(() => {
    if (open && pedido) {
      setActivePedido(pedido);
    }
  }, [open, pedido]);

  useEffect(() => {
    if (!open) {
      setActivePedido(null);
    }
  }, [open]);

  const currentPedido = activePedido || pedido;

  if (!currentPedido) return null;

  const isRejected = currentPedido.estado === "rejeitado" || currentPedido.estado === "cancelado";
  const isCompleted = currentPedido.estado === "liberado";

  const getDisplayEstado = (): string => {
    if (isCompleted) return "Aprovado";
    if (isRejected) return ESTADO_LABEL[currentPedido.estado];
    if (currentPedido.estado === "pendente") return "Em Análise";
    return ESTADO_LABEL[currentPedido.estado];
  };

  const canAnalise = !isRejected && !isCompleted && (currentPedido.estado === "pendente" || currentPedido.dataAnalise);
  const canAprovar = !isRejected && !isCompleted && !!currentPedido.dataAnalise;
  const canAutorizar = !isRejected && !isCompleted && !!currentPedido.valorAprovado;
  const canDesembolsar = !isRejected && !isCompleted && !!currentPedido.valorAutorizado;

  const handleAdvance = (toEstado: Pedido["estado"], stage: "analise" | "aprovacao" | "autorizacao" | "desembolso") => {
    const valor = Number(editValues.valor) || 0;
    const data = editValues.data || new Date().toISOString().split("T")[0];
    const extras: Partial<Pedido> = {};

    if (stage === "analise") {
      extras.dataAnalise = data;
    } else if (stage === "aprovacao") {
      extras.valorAprovado = valor > 0 ? valor : currentPedido.valor;
      extras.dataAprovacao = data;
    } else if (stage === "autorizacao") {
      extras.valorAutorizado = valor > 0 ? valor : currentPedido.valorAprovado || currentPedido.valor;
      extras.dataAutorizacao = data;
    } else if (stage === "desembolso") {
      extras.valorDesembolsado = valor > 0 ? valor : currentPedido.valorAutorizado || currentPedido.valorAprovado || currentPedido.valor;
      extras.dataDesembolso = data;
    }

    updatePedidoEstado(currentPedido.id, toEstado, extras);
    setEditMode(null);
    setEditValues({ valor: "", data: "" });
    setConfirmReopen(false);
    setActivePedido(null);
    onUpdate();
  };

  const handleReject = (toEstado: Pedido["estado"]) => {
    if (isRejected || isCompleted) return;
    updatePedidoEstado(currentPedido.id, toEstado, {});
    onUpdate();
  };

  const handleReopen = async () => {
    let restoredEstado: Pedido["estado"] = "em_analise";
    if (currentPedido.valorAutorizado || currentPedido.dataAutorizacao) {
      restoredEstado = "autorizado";
    } else if (currentPedido.valorAprovado || currentPedido.dataAprovacao) {
      restoredEstado = "aprovado";
    } else if (currentPedido.dataAnalise) {
      restoredEstado = "em_analise";
    }

    const updatedPedido = { ...currentPedido, estado: restoredEstado };
    setActivePedido(updatedPedido);
    setConfirmReopen(false);
    await updatePedidoEstado(currentPedido.id, restoredEstado, { reabrir: true } as any);
    onUpdate();
  };

  const openEditStage = (stage: "analise" | "aprovacao" | "autorizacao" | "desembolso") => {
    if (stage === "analise" && !canAnalise) return;
    if (stage === "aprovacao" && !canAprovar) return;
    if (stage === "autorizacao" && !canAutorizar) return;
    if (stage === "desembolso" && !canDesembolsar) return;

    let valorSugerido = 0;
    if (stage === "aprovacao") valorSugerido = currentPedido.valor;
    else if (stage === "autorizacao") valorSugerido = currentPedido.valorAprovado || currentPedido.valor;
    else if (stage === "desembolso") valorSugerido = currentPedido.valorAutorizado || currentPedido.valorAprovado || currentPedido.valor;

    setEditValues({
      valor: String(valorSugerido || ""),
      data: new Date().toISOString().split("T")[0],
    });
    setEditMode(stage);
  };

  const printPedidoReport = () => {
    const now = new Date().toLocaleString("pt-PT");
    const periodoLabel = currentPedido.tipoCredito === "diario" ? "Diário" :
                         currentPedido.tipoCredito === "semanal" ? "Semanal" :
                         currentPedido.tipoCredito === "quinzenal" ? "Quinzenal" :
                         currentPedido.tipoCredito === "mensal" ? "Mensal" : "Mensal";

    const totalParcelas = (currentPedido as any).parcelas?.length || currentPedido.prazo || 1;
    const valorBase = currentPedido.valorDesembolsado || currentPedido.valorAutorizado || currentPedido.valorAprovado || currentPedido.valor;
    const taxa = currentPedido.taxa || 0;
    const capital = valorBase / totalParcelas;
    const juros = (valorBase * taxa / 100) / totalParcelas;
    const prestacao = capital + juros;

    let parcelasHtml = "";
    const parcelas = (currentPedido as any).parcelas;
    if (parcelas && Array.isArray(parcelas) && parcelas.length > 0) {
      parcelasHtml = parcelas.map((p: any, idx: number) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; text-align: center;">${idx + 1}</td>
          <td style="padding: 6px 8px; text-align: center;">${p.vencimento || "—"}</td>
          <td style="padding: 6px 8px; text-align: right;">${formatCurrencyMT(p.capital || capital)}</td>
          <td style="padding: 6px 8px; text-align: right;">${formatCurrencyMT(p.juros || juros)}</td>
          <td style="padding: 6px 8px; text-align: right; font-weight: bold;">${formatCurrencyMT(p.prestacao || prestacao)}</td>
          <td style="padding: 6px 8px; text-align: right; color: #dc2626;">${formatCurrencyMT(p.mora || 0)}</td>
          <td style="padding: 6px 8px; text-align: right; color: #16a34a;">${formatCurrencyMT(p.pago || 0)}</td>
          <td style="padding: 6px 8px; text-align: right; font-weight: bold;">${formatCurrencyMT(p.remanescente || (prestacao - (p.pago || 0)))}</td>
        </tr>
      `).join("");
    } else {
      parcelasHtml = Array.from({ length: Math.min(totalParcelas, 12) }, (_, idx) => {
        const vencimento = new Date();
        vencimento.setMonth(vencimento.getMonth() + idx);
        const pago = 0;
        const remanescente = prestacao;
        return `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; text-align: center;">${idx + 1}</td>
            <td style="padding: 6px 8px; text-align: center;">${vencimento.toLocaleDateString("pt-PT")}</td>
            <td style="padding: 6px 8px; text-align: right;">${formatCurrencyMT(capital)}</td>
            <td style="padding: 6px 8px; text-align: right;">${formatCurrencyMT(juros)}</td>
            <td style="padding: 6px 8px; text-align: right; font-weight: bold;">${formatCurrencyMT(prestacao)}</td>
            <td style="padding: 6px 8px; text-align: right; color: #dc2626;">0</td>
            <td style="padding: 6px 8px; text-align: right; color: #16a34a;">${formatCurrencyMT(pago)}</td>
            <td style="padding: 6px 8px; text-align: right; font-weight: bold;">${formatCurrencyMT(remanescente)}</td>
          </tr>
        `;
      }).join("");
    }

    const html = `
      <h1 class="title">Plano de Pagamento - Pedido #${String(currentPedido.id).slice(-6)}</h1>
      <p class="sub">Cliente: ${currentPedido.cliente} | Gerado em ${now}</p>

      <div style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <p style="margin: 4px 0;"><strong>Valor Total:</strong> ${formatCurrencyMT(valorBase)}</p>
        <p style="margin: 4px 0;"><strong>Taxa de Juros:</strong> ${taxa}% a.m.</p>
        <p style="margin: 4px 0;"><strong>Prazo:</strong> ${totalParcelas} parcelas</p>
        <p style="margin: 4px 0;"><strong>Periodicidade:</strong> ${periodoLabel}</p>
        <p style="margin: 4px 0;"><strong>Prestação:</strong> ${formatCurrencyMT(prestacao)}</p>
      </div>

      <h2 style="font-size: 16px; margin-top: 20px; margin-bottom: 8px; color: #1e293b;">Quadro de Pagamentos</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 8px; text-align: center; border: 1px solid #cbd5e1;">Parcela</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #cbd5e1;">Vencimento</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">Capital</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">Juros</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">Prestação</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">Juros Moratórios</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">Pago</th>
            <th style="padding: 8px; text-align: right; border: 1px solid #cbd5e1;">Remanescente</th>
          </tr>
        </thead>
        <tbody>
          ${parcelasHtml}
        </tbody>
      </table>

      <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <p style="margin: 4px 0;"><strong>Estado do Pedido:</strong> ${getDisplayEstado()}</p>
        <p style="margin: 4px 0;"><strong>Tipo de Crédito:</strong> ${currentPedido.tipoCredito || "—"}</p>
        <p style="margin: 4px 0;"><strong>Prazo:</strong> ${currentPedido.prazo} meses</p>
        <p style="margin: 4px 0;"><strong>Taxa:</strong> ${currentPedido.taxa}%</p>
      </div>

      <div style="margin-top: 20px; padding-top: 12px; border-top: 1px dashed #ccc; font-size: 12px;">
        <p><strong>Emitido por:</strong> Sistema</p>
        <p style="margin-top: 20px;"><strong>Assinatura do Cliente:</strong></p>
        <div style="height: 40px; border-top: 1px solid #333; margin-top: 8px; width: 200px;"></div>
        <p style="margin-top: 4px;">${currentPedido.cliente}</p>
      </div>

      <div style="text-align: center; margin-top: 16px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px;">
        Documento gerado electronicamente em ${now} — Plano de pagamento do pedido de crédito.
      </div>
    `;
    openCorporatePrintWindow({
      title: `Plano_Pagamento_${String(currentPedido.id).slice(-6)}`,
      bodyHtml: html,
      browserControls: true,
    });
  };

  const navigateToStage = (stage: string) => {
    const routes: Record<string, string> = {
      analise: "/credits/analise",
      aprovacao: "/credits/aprovacao",
      autorizacao: "/credits/autorizacao",
      desembolso: "/credits/desembolso",
    };
    const path = routes[stage] || "/credits/analise";
    onOpenChange(false);
    window.location.href = path;
  };

  const getStageActionLabel = (stage: string): string => {
    if (stage === "analise") return "Concluir";
    if (stage === "aprovacao") return "Aprovar";
    if (stage === "autorizacao") return "Autorizar";
    if (stage === "desembolso") return "Avançar";
    return "Avançar";
  };

  const getCardStatusLabel = (stage: string): string | null => {
    if (isCompleted) return "Aprovado";
    if (isRejected) return null;
    if (stage === "analise" && currentPedido.dataAnalise) return "Aprovado";
    if (stage === "aprovacao" && currentPedido.valorAprovado) return "Aprovado";
    if (stage === "autorizacao" && currentPedido.valorAutorizado) return "Aprovado";
    if (stage === "desembolso" && currentPedido.valorDesembolsado) return "Aprovado";
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-600" />
            Pedido #{String(currentPedido.id).slice(-6)} — {currentPedido.cliente}
          </DialogTitle>
          <DialogDescription>
            Acompanhamento completo do pipeline: análise, aprovação, autorização e desembolso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Linha 1: Resumo + Reabrir (horizontal) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Resumo do pedido */}
            <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Valor Solicitado</p>
                <p className="text-lg font-bold text-slate-900">{formatCurrencyMT(currentPedido.valor)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Percent className="w-3 h-3" /> Taxa</p>
                <p className="text-lg font-bold text-slate-900">{currentPedido.taxa}%</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Prazo</p>
                <p className="text-lg font-bold text-slate-900">{currentPedido.prazo} meses</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">Estado</p>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium mt-1 ${isCompleted ? "bg-emerald-100 text-emerald-800" : ESTADO_COLOR[currentPedido.estado]}`}>
                  {getDisplayEstado()}
                </span>
              </div>
            </div>

            {/* Reabrir se rejeitado */}
            {isRejected && (
              <div className="md:col-span-4 rounded-lg border border-amber-200 bg-amber-50 p-2 flex items-start justify-between">
                <div className="flex items-center gap-2 text-xs text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Pedido <strong>{ESTADO_LABEL[currentPedido.estado]}</strong></span>
                </div>
                {!confirmReopen ? (
                  <button onClick={() => setConfirmReopen(true)} className="px-2 py-1 rounded bg-amber-600 text-white text-[10px] font-medium hover:bg-amber-700">
                    <RefreshCcw className="w-3 h-3 inline mr-1" />Reabrir
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button onClick={handleReopen} className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700">Confirmar</button>
                    <button onClick={() => setConfirmReopen(false)} className="px-2 py-1 rounded border border-slate-300 text-[10px] font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pipeline HORIZONTAL - 5 cards */}
          <div className="grid grid-cols-5 gap-2">
            {/* Solicitação - sem botões de ação, apenas data */}
            <div className="flex flex-col rounded-lg border border-emerald-200 bg-emerald-50">
              <div className="flex flex-col items-center text-center gap-1 p-2">
                <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <p className="font-semibold text-slate-900 text-[10px]">Solicitação</p>
                <p className="text-[10px] font-bold text-slate-800">{formatCurrencyMT(currentPedido.valor)}</p>
                <p className="text-[10px] text-slate-400">{currentPedido.data}</p>
              </div>
            </div>

            {/* Análise */}
            <div className="flex flex-col rounded-lg border border-blue-200 bg-blue-50">
              <div className="flex flex-col items-center text-center gap-1 p-2">
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white">
                  <BarChart3 className="w-3.5 h-3.5" />
                </div>
                <p className="font-semibold text-slate-900 text-[10px]">Análise</p>
                <p className="text-[10px] font-bold text-slate-800">{formatCurrencyMT(currentPedido.valor)}</p>
                <p className="text-[10px] text-slate-400">{currentPedido.dataAnalise || "—"}</p>
              </div>
              {!isCompleted && !isRejected && (
                <div className="flex gap-1 p-1 border-t border-blue-200">
                  <button onClick={() => openEditStage("analise")} disabled={!canAnalise} className="flex-1 px-1 py-0.5 rounded bg-white border border-slate-300 text-[9px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">{getStageActionLabel("analise")}</button>
                  <button onClick={() => handleReject("rejeitado")} disabled={!canAnalise} className="flex-1 px-1 py-0.5 rounded bg-red-50 border border-red-200 text-[9px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">Rejeitar</button>
                  <button onClick={() => navigateToStage("analise")} className="flex-1 px-1 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[9px] font-medium text-indigo-700 hover:bg-indigo-100">Detalhes</button>
                </div>
              )}
              {isCompleted && (
                <div className="p-1 border-t border-blue-200">
                  <p className="text-[9px] font-bold text-emerald-700 text-center py-0.5">Aprovado</p>
                </div>
              )}
            </div>

            {/* Aprovação */}
            <div className="flex flex-col rounded-lg border border-emerald-200 bg-emerald-50">
              <div className="flex flex-col items-center text-center gap-1 p-2">
                <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <p className="font-semibold text-slate-900 text-[10px]">Aprovação</p>
                <p className="text-[10px] font-bold text-slate-800">{formatCurrencyMT(currentPedido.valorAprovado || currentPedido.valor)}</p>
                <p className="text-[10px] text-slate-400">{currentPedido.dataAprovacao || "—"}</p>
              </div>
              {!isCompleted && !isRejected && (
                <div className="flex gap-1 p-1 border-t border-emerald-200">
                  <button onClick={() => openEditStage("aprovacao")} disabled={!canAprovar} className="flex-1 px-1 py-0.5 rounded bg-white border border-slate-300 text-[9px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">{getStageActionLabel("aprovacao")}</button>
                  <button onClick={() => handleReject("rejeitado")} disabled={!canAprovar} className="flex-1 px-1 py-0.5 rounded bg-red-50 border border-red-200 text-[9px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">Rejeitar</button>
                  <button onClick={() => navigateToStage("aprovacao")} className="flex-1 px-1 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[9px] font-medium text-indigo-700 hover:bg-indigo-100">Detalhes</button>
                </div>
              )}
              {isCompleted && (
                <div className="p-1 border-t border-emerald-200">
                  <p className="text-[9px] font-bold text-emerald-700 text-center py-0.5">Aprovado</p>
                </div>
              )}
            </div>

            {/* Autorização */}
            <div className="flex flex-col rounded-lg border border-indigo-200 bg-indigo-50">
              <div className="flex flex-col items-center text-center gap-1 p-2">
                <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <p className="font-semibold text-slate-900 text-[10px]">Autorização</p>
                <p className="text-[10px] font-bold text-slate-800">{formatCurrencyMT(currentPedido.valorAutorizado || currentPedido.valor)}</p>
                <p className="text-[10px] text-slate-400">{currentPedido.dataAutorizacao || "—"}</p>
              </div>
              {!isCompleted && !isRejected && (
                <div className="flex gap-1 p-1 border-t border-indigo-200">
                  <button onClick={() => openEditStage("autorizacao")} disabled={!canAutorizar} className="flex-1 px-1 py-0.5 rounded bg-white border border-slate-300 text-[9px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">{getStageActionLabel("autorizacao")}</button>
                  <button onClick={() => handleReject("rejeitado")} disabled={!canAutorizar} className="flex-1 px-1 py-0.5 rounded bg-red-50 border border-red-200 text-[9px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">Rejeitar</button>
                  <button onClick={() => navigateToStage("autorizacao")} className="flex-1 px-1 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[9px] font-medium text-indigo-700 hover:bg-indigo-100">Detalhes</button>
                </div>
              )}
              {isCompleted && (
                <div className="p-1 border-t border-indigo-200">
                  <p className="text-[9px] font-bold text-emerald-700 text-center py-0.5">Aprovado</p>
                </div>
              )}
            </div>

            {/* Desembolso */}
            <div className="flex flex-col rounded-lg border border-purple-200 bg-purple-50">
              <div className="flex flex-col items-center text-center gap-1 p-2">
                <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
                <p className="font-semibold text-slate-900 text-[10px]">Desembolso</p>
                <p className="text-[10px] font-bold text-slate-800">{formatCurrencyMT(currentPedido.valorDesembolsado || currentPedido.valor)}</p>
                <p className="text-[10px] text-slate-400">{currentPedido.dataDesembolso || "—"}</p>
              </div>
              {!isCompleted && !isRejected && (
                <div className="flex gap-1 p-1 border-t border-purple-200">
                  <button onClick={() => openEditStage("desembolso")} disabled={!canDesembolsar} className="flex-1 px-1 py-0.5 rounded bg-white border border-slate-300 text-[9px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">{getStageActionLabel("desembolso")}</button>
                  <button onClick={() => handleReject("rejeitado")} disabled={!canDesembolsar} className="flex-1 px-1 py-0.5 rounded bg-red-50 border border-red-200 text-[9px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">Rejeitar</button>
                  <button onClick={() => navigateToStage("desembolso")} className="flex-1 px-1 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[9px] font-medium text-indigo-700 hover:bg-indigo-100">Detalhes</button>
                </div>
              )}
              {isCompleted && (
                <div className="p-1 border-t border-purple-200">
                  <p className="text-[9px] font-bold text-emerald-700 text-center py-0.5">Aprovado</p>
                </div>
              )}
            </div>
          </div>

          {/* Linha 3: Grupo (ponta a ponta) + Botões */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Grupo */}
            {currentPedido.isGrupo && currentPedido.membros.length > 0 && (
              <div className="md:col-span-12 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <div className="flex items-center gap-2 text-indigo-700 font-medium text-xs mb-2">
                  <Users className="w-3.5 h-3.5" />
                  Membros do Grupo ({currentPedido.membros.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {currentPedido.membros.map((m, idx) => (
                    <div key={idx} className="bg-white rounded-lg px-2 py-1.5 text-xs border border-indigo-200 text-center">
                      <span className="text-slate-700">{m.memberName}: </span>
                      <span className="font-semibold text-indigo-700">{formatCurrencyMT(m.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botões */}
            {!isCompleted && (
              <div className="md:col-span-12 flex items-center justify-end gap-2">
                <Button variant="outline" onClick={printPedidoReport} size="sm">
                  <FileText className="w-4 h-4 mr-1" />
                  Imprimir Relatório
                </Button>
                {!isRejected && (
                  <Button variant="outline" onClick={() => handleReject("rejeitado")} size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                    <XCircle className="w-4 h-4 mr-1" />
                    Rejeitar
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal de edição de etapa */}
        {editMode && (
          <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setEditMode(null)}>
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-slate-900 text-lg">
                {editMode === "analise" ? "Concluir Análise" :
                 editMode === "aprovacao" ? "Registar Aprovação" :
                 editMode === "autorizacao" ? "Registar Autorização" :
                 "Registar Desembolso"}
              </h3>
              <p className="text-sm text-slate-500">
                {editMode === "analise"
                  ? "Confirme a conclusão da análise de crédito."
                  : `Defina o valor ${editMode === "aprovacao" ? "aprovado" : editMode === "autorizacao" ? "autorizado" : "desembolsado"} e a data.`}
              </p>
              <div className="space-y-3">
                {editMode !== "analise" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Valor {editMode === "aprovacao" ? "Aprovado" : editMode === "autorizacao" ? "Autorizado" : "Desembolsado"} (MT)
                    </label>
                    <input
                      type="number"
                      value={editValues.valor}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, valor: e.target.value }))}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                      placeholder="0"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Data</label>
                  <input
                    type="date"
                    value={editValues.data}
                    onChange={(e) => setEditValues((prev) => ({ ...prev, data: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (editMode === "analise") handleAdvance("em_analise", "analise");
                    else if (editMode === "aprovacao") handleAdvance("aprovado", "aprovacao");
                    else if (editMode === "autorizacao") handleAdvance("autorizado", "autorizacao");
                    else if (editMode === "desembolso") handleAdvance("liberado", "desembolso");
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setEditMode(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}