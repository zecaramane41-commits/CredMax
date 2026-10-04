/**
 * Serviço unificado para operações de crédito (pedidos + pipeline)
 * 100% Integrado com a API e Banco PostgreSQL em Tempo Real
 */
import type { Pedido, PedidoFormData } from "../../../shared/types";
import { apiFetch } from "./api";
import { realtimeClient } from "./realtime";
import { formatCurrencyMT } from "./format";

export function mapBackendStatus(s: string, hasLoan?: boolean, disbursementStatus?: string): Pedido["estado"] {
  const norm = String(s || "").toLowerCase();
  const disbNorm = String(disbursementStatus || "").toLowerCase();

  // Somente é 'desembolsado' se o status for explicitamente 'disbursed'
  if (norm === "disbursed" || disbNorm === "disbursed") {
    return "desembolsado";
  }
  switch (norm) {
    case "pending_analyst":
      return "em_analise";
    case "pending_manager":
      return "aprovado";
    case "pending_final":
      return "autorizado";
    case "approved":
      // Aprovado na fase de autorização -> Fica Pendente para Desembolso ("liberado")!
      return "liberado";
    case "rejected":
    case "risk_blocked":
      return "rejeitado";
    case "cancelled":
      return "cancelado";
    default:
      return "pendente";
  }
}

function mapProductLabel(codeOrName: string): string {
  const val = String(codeOrName || "").trim().toLowerCase();
  if (val === "consumo" || val.includes("normal")) return "Credito Normal";
  if (val === "negocio" || val.includes("acrescimo")) return "Acrescimo";
  if (val === "reemprestimo") return "Reemprestimo";
  if (val === "emergencia" || val.includes("especial")) return "Credito Especial";
  return codeOrName || "Credito Normal";
}

/**
 * Busca os pedidos de crédito reais do banco PostgreSQL via API.
 */
export async function fetchPedidos(): Promise<Pedido[]> {
  try {
    const data = await apiFetch<{ requests: any[] }>("/loans/approval/requests");
    const rows = data.requests || [];
    return rows.map((r) => {
      const payload = typeof r.payload === "object" && r.payload ? r.payload : {};
      const estado = mapBackendStatus(String(r.status || ""), false, r.disbursementStatus || r.disbursement_status);

      let freqLabel = "Mensal";
      const freqRaw = String(payload.paymentFrequency || r.paymentFrequency || "").toLowerCase();
      if (freqRaw === "semanal" || freqRaw === "weekly") freqLabel = "Semanal";
      else if (freqRaw === "quinzenal" || freqRaw === "biweekly") freqLabel = "Quinzenal";
      else if (freqRaw === "diario" || freqRaw === "daily") freqLabel = "Diário";

      return {
        id: Number(r.id),
        clienteId: Number(r.clientId || r.client_id || 0),
        cliente: String(r.clientName || r.client_name || "—"),
        clienteType: String(r.applicantType || r.clientType || r.client_type || "singular"),
        valor: Number(r.requestedAmount || r.requested_amount || 0),
        tipoCredito: mapProductLabel(payload.product || payload.tipoCredito || r.product),
        prazo: Math.max(1, Number(payload.periodMonths || payload.prazo || r.prazo || r.periodMonths || 1)),
        taxa: Number(payload.monthlyRatePercent || payload.taxa || r.taxa || 30),
        frequencia: freqLabel,
        mesReferencia: String(payload.mesReferencia || payload.note || "").replace("Mês de referência: ", ""),
        reemprestimo: Boolean(payload.reemprestimo),
        isGrupo: Boolean(r.applicantType === "grupo" || r.clientType === "grupo" || payload.isGrupo),
        membros: Array.isArray(payload.groupMembers) ? payload.groupMembers : [],
        estado,
        data: String(r.createdAt || r.created_at || "").slice(0, 10),
        valorAprovado: Number(r.requestedAmount || r.requested_amount || 0),
        valorAutorizado: Number(r.requestedAmount || r.requested_amount || 0),
        valorDesembolsado: Number(r.requestedAmount || r.requested_amount || 0),
        dataAnalise: r.analystDecisionAt || r.analyst_decision_at ? String(r.analystDecisionAt || r.analyst_decision_at).slice(0, 10) : undefined,
        dataAprovacao: r.managerDecisionAt || r.manager_decision_at ? String(r.managerDecisionAt || r.manager_decision_at).slice(0, 10) : undefined,
        dataAutorizacao: r.finalDecisionAt || r.final_decision_at ? String(r.finalDecisionAt || r.final_decision_at).slice(0, 10) : undefined,
        dataDesembolso: r.disbursedAt || r.disbursed_at ? String(r.disbursedAt || r.disbursed_at).slice(0, 10) : undefined,
        aprovadoPor: r.analystDecisionByName || r.analyst_decision_by_name || undefined,
        autorizadoPor: r.managerDecisionByName || r.manager_decision_by_name || undefined,
        desembolsadoPor: r.finalDecisionByName || r.final_decision_by_name || undefined,
      };
    });
  } catch (err) {
    console.error("[loans] Falha ao carregar pedidos:", err);
    return [];
  }
}

/**
 * Cria um novo pedido de crédito no PostgreSQL via API.
 */
export async function criarPedido(data: PedidoFormData): Promise<Pedido> {
  const productCode = mapProductLabel(data.tipoCredito);
  const freqMap: Record<string, string> = {
    monthly: "mensal",
    biweekly: "quinzenal",
    weekly: "semanal",
    daily: "diario",
  };

  const payload = {
    clientId: Number(data.clienteId),
    amount: Number(data.valor),
    product: productCode,
    applicantType: data.clienteType || "singular",
    periodMonths: Math.max(1, Number(data.prazo || 1)),
    prazo: Math.max(1, Number(data.prazo || 1)),
    monthlyRatePercent: Number(data.taxa || 30),
    paymentFrequency: freqMap[data.frequencia] || "mensal",
    amortizationMethod: data.metodoAmortizacao || "price",
    administrativeFeeMode: data.administrativeFeeMode || (data.comissaoAbertura === "aplicar" ? "aplicar" : "isento"),
    administrativeFeeRate: data.administrativeFeeRate !== undefined ? Number(data.administrativeFeeRate) : 2,
    administrativeFeeAmount: data.administrativeFeeAmount !== undefined ? Number(data.administrativeFeeAmount) : undefined,
    charges: Array.isArray(data.charges) ? data.charges : [],
    totalChargesAmount: data.totalChargesAmount !== undefined ? Number(data.totalChargesAmount) : 0,
    disbursementNetAmount: data.disbursementNetAmount !== undefined ? Number(data.disbursementNetAmount) : undefined,
    carteiraId: data.carteiraId || undefined,
    carteiraNome: data.carteiraNome || undefined,
    managerUserId: data.gestorUserId || undefined,
    gestorName: data.gestorName || undefined,
    purpose: data.finalidade || undefined,
    disbursementChannel: data.formaDesembolso || undefined,
    disbursementAccount: data.dadosDesembolso || undefined,
    guarantorName: data.avalistaNome || undefined,
    guarantorPhone: data.avalistaTelefone || undefined,
    guarantorNuit: data.avalistaNuit || undefined,
    collateralDescription: data.garantiaDescricao || undefined,
    collateralValue: data.garantiaValor || undefined,
    note: data.observacoes || (data.mesReferencia ? `Mês de referência: ${data.mesReferencia}` : ""),
    mesReferencia: data.mesReferencia,
    reemprestimo: Boolean(data.reemprestimo),
    isGrupo: Boolean(data.isGrupo),
    groupMembers: data.isGrupo ? data.membros : [],
  };

  const res = await apiFetch<{
    id: number;
    status: string;
    loanId?: number;
    contractNo?: string;
    message?: string;
  }>("/loans/approval/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    id: res.id,
    clienteId: data.clienteId,
    cliente: data.cliente,
    clienteType: data.clienteType,
    valor: data.valor,
    tipoCredito: productCode,
    prazo: data.prazo,
    taxa: data.taxa,
    frequencia: data.frequencia === "monthly" ? "Mensal" : data.frequencia === "biweekly" ? "Quinzenal" : data.frequencia === "weekly" ? "Semanal" : "Diário",
    mesReferencia: data.mesReferencia,
    reemprestimo: data.reemprestimo,
    isGrupo: data.isGrupo,
    membros: data.membros || [],
    estado: mapBackendStatus(res.status),
    data: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Atualiza o estágio/decisão do pedido de crédito (Análise, Aprovação, Autorização, Rejeição ou Reabertura).
 */
export async function decidirPedido(
  id: number,
  decision: "approve" | "reject" | "reopen",
  note = "",
  directApproval = false,
): Promise<{ status: string; loanId?: number; contractNo?: string }> {
  return apiFetch<{ status: string; loanId?: number; contractNo?: string }>(`/loans/approval/requests/${id}/decision`, {
    method: "PATCH",
    body: JSON.stringify({
      decision,
      note: note || (decision === "approve" ? "Aprovação efectuada" : decision === "reopen" ? "Reabertura de pedido" : "Rejeitado"),
      directApproval,
    }),
  });
}

/**
 * Reabre um pedido rejeitado, restaurando exatamente o estado/etapa em que estava antes da rejeição.
 */
export async function reabrirPedido(id: number, note = "Reabertura de pedido"): Promise<{ status: string }> {
  return decidirPedido(id, "reopen", note);
}

/**
 * Cancela ou rejeita um pedido de crédito no PostgreSQL.
 */
export async function cancelarPedido(id: number, reason = "Cancelado"): Promise<void> {
  await decidirPedido(id, "reject", reason);
}

/**
 * Desembolsa o empréstimo aprovado e gera os lançamentos no Caixa e Contabilidade.
 */
export async function desembolsarEmprestimo(
  loanId: number,
): Promise<{ message: string; contractNo: string; amount: number }> {
  return apiFetch(`/loans/${loanId}/disburse`, {
    method: "POST",
  });
}

export function verificarPedidoAtivo(
  clienteId: number,
  pedidos: Pedido[],
): Pedido | null {
  return pedidos.find((p) => {
    if (p.clienteId !== clienteId) return false;
    if (p.estado === "rejeitado" || p.estado === "cancelado") return false;
    return true;
  }) || null;
}

export function getPipelineStatus(pedido: Pedido): { label: string; status: "ok" | "pending" | "none"; value?: string }[] {
  const estado = pedido.estado;
  const fmt = (v: number) => formatCurrencyMT(v);
  return [
    {
      label: "Análise",
      status: estado === "em_analise" || estado === "aprovado" || estado === "autorizado" || estado === "liberado" || estado === "desembolsado" ? "ok"
             : estado === "rejeitado" || estado === "cancelado" ? "none" : "pending",
      value: pedido.dataAnalise ? `Concluída em ${pedido.dataAnalise}` : undefined,
    },
    {
      label: "Aprovação",
      status: estado === "aprovado" || estado === "autorizado" || estado === "liberado" || estado === "desembolsado" ? "ok"
             : estado === "rejeitado" || estado === "cancelado" ? "none" : "pending",
      value: pedido.valorAprovado ? `Valor: ${fmt(pedido.valorAprovado)}` : undefined,
    },
    {
      label: "Autorização",
      status: estado === "autorizado" || estado === "liberado" || estado === "desembolsado" ? "ok"
             : estado === "rejeitado" || estado === "cancelado" ? "none" : "pending",
      value: pedido.valorAutorizado ? `Valor: ${fmt(pedido.valorAutorizado)}` : undefined,
    },
    {
      label: "Desembolso",
      status: estado === "liberado" || estado === "desembolsado" ? "ok"
             : estado === "rejeitado" || estado === "cancelado" ? "none" : "pending",
      value: pedido.valorDesembolsado ? `Valor: ${fmt(pedido.valorDesembolsado)}` : undefined,
    },
  ];
}

/**
 * Sincronização em Tempo Real (SSE) dos pedidos de crédito.
 * Retorna uma função de cancelamento para uso direto em useEffect(() => usePedidosPolling(setPedidos), []).
 */
export function usePedidosPolling(
  setPedidos: (pedidos: Pedido[]) => void,
): () => void {
  const reload = () => {
    void fetchPedidos()
      .then((data) => {
        setPedidos(data);
      })
      .catch((err) => {
        console.error("[loans] Erro ao recarregar pedidos:", err);
      });
  };

  // Carrega imediatamente
  reload();

  // Escuta eventos SSE em tempo real sem sobrecarregar com polling
  const unsub1 = realtimeClient.subscribe("LOAN_REQUEST_CREATED", reload);
  const unsub2 = realtimeClient.subscribe("LOAN_DECISION_UPDATED", reload);
  const unsub3 = realtimeClient.subscribe("LOAN_DISBURSED", reload);
  const unsub4 = realtimeClient.subscribe("CONNECTED", reload);

  return () => {
    unsub1();
    unsub2();
    unsub3();
    unsub4();
  };
}

export function usePedidosRealtime(setPedidos: (pedidos: Pedido[]) => void): () => void {
  return usePedidosPolling(setPedidos);
}

// Compatibilidade
export async function syncPedidosFromBackend(): Promise<void> {
  await fetchPedidos();
}

export function getPedidos(): Pedido[] {
  return [];
}

export async function atualizarEstadoPedido(
  id: number,
  novoEstado: Pedido["estado"],
  extras?: Partial<Pedido>,
): Promise<Pedido[]> {
  if (extras && (extras as any).reabrir) {
    await decidirPedido(id, "reopen", "Reabertura de pedido");
  } else if (novoEstado === "rejeitado" || novoEstado === "cancelado") {
    const note = extras?.aprovadoPor || extras?.autorizadoPor || extras?.desembolsadoPor || "Rejeitado";
    await decidirPedido(id, "reject", note);
  } else {
    const note = extras?.aprovadoPor || extras?.autorizadoPor || extras?.desembolsadoPor || "Aprovado";
    await decidirPedido(id, "approve", note);
  }
  return fetchPedidos();
}
