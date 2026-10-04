/**
 * Serviço unificado para créditos ativos (desembolsados)
 * Centraliza o acesso a reembolsos, mora, estado de crédito
 */
import type { CreditoAtivo, Installment } from "../../../shared/types";
import { apiFetch } from "./api";
import { realtimeClient } from "./realtime";

const STORAGE_KEY = "msu_creditos_ativos";

// --- Persistência Local (fallback) ---

function normalizeCredito(c: any): CreditoAtivo {
  const raw = c || {};
  const total = Number(raw.totalAPagar ?? raw.principal ?? 0);
  const prazoVal = Math.max(1, Number(raw.prazo ?? 1));
  let parcelas: Installment[] = Array.isArray(raw.parcelas) && raw.parcelas.length > 0 ? raw.parcelas : [];

  if (parcelas.length === 0 && total > 0) {
    const valorParcela = Math.round((total / prazoVal) * 100) / 100;
    const now = new Date();
    parcelas = Array.from({ length: prazoVal }, (_, idx) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() + (idx + 1));
      const dia = String(d.getDate()).padStart(2, "0");
      const mes = String(d.getMonth() + 1).padStart(2, "0");
      const ano = d.getFullYear();
      return {
        numParcela: idx + 1,
        dataVencimento: `${dia}/${mes}/${ano}`,
        valor: idx === prazoVal - 1 ? Math.round((total - valorParcela * (prazoVal - 1)) * 100) / 100 : valorParcela,
        status: "pendente",
        valorPago: 0,
      };
    });
  }

  return {
    id: Number(raw.id ?? 0),
    pedidoId: Number(raw.pedidoId ?? raw.pedido_id ?? 0),
    clienteId: Number(raw.clienteId ?? raw.client_id ?? 0),
    cliente: String(raw.cliente ?? raw.client ?? "—"),
    clienteType: String(raw.clienteType ?? raw.client_type ?? "singular"),
    contrato: String(raw.contrato ?? raw.contract_no ?? "—"),
    valorSolicitado: Number(raw.valorSolicitado ?? raw.principal ?? 0),
    totalAPagar: total,
    totalPago: Number(raw.totalPago ?? 0),
    saldoDevedor: Number(raw.saldoDevedor ?? raw.balance ?? total),
    prazo: prazoVal,
    taxa: Number(raw.taxa ?? raw.interest_rate ?? 0),
    frequencia: String(raw.frequencia ?? raw.payment_frequency ?? "Mensal"),
    tipoCredito: String(raw.tipoCredito ?? raw.product ?? ""),
    mesReferencia: String(raw.mesReferencia ?? ""),
    reemprestimo: Boolean(raw.reemprestimo),
    membros: Array.isArray(raw.membros) ? raw.membros : [],
    parcelas,
    estado: (raw.estado === "liquidado" ? "liquidado" : raw.estado === "baixado" ? "baixado" : "ativo") as CreditoAtivo["estado"],
    dataDesembolso: String(
      raw.dataDesembolso ??
        (raw.disbursed_on
          ? new Date(raw.disbursed_on).toLocaleDateString("pt-PT")
          : raw.disbursed_at
            ? new Date(raw.disbursed_at).toLocaleDateString("pt-PT")
            : ""),
    ),
    mora: Number(raw.mora ?? 0),
    prestacoesAtrasadas: Number(raw.prestacoesAtrasadas ?? raw.days_overdue ?? 0),
  };
}

function loadCreditos(): CreditoAtivo[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data).map(normalizeCredito);
  } catch {}
  return [];
}

function saveCreditos(creditos: CreditoAtivo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creditos));
  } catch {}
}

// --- API Backend ---

async function syncToBackend(credito: CreditoAtivo) {
  try {
    await apiFetch("/loans/", {
      method: "POST",
      body: JSON.stringify({
        contractNo: credito.contrato,
        clientId: credito.clienteId,
        product: credito.tipoCredito,
        amount: credito.totalAPagar,
        balance: credito.saldoDevedor,
        rate: credito.taxa || 0,
        administrativeFeeMode: "isento",
        disbursed: "",
        maturity: "",
        nextPayment: "",
        daysOverdue: 0,
        status: credito.estado === "liquidado" ? "active" : "active",
        amortizationMethod: "price",
        paymentFrequency: "monthly",
      }),
    });
  } catch {
    // Silently fail - dados já salvos localmente
  }
}

// --- API Pública ---

export function getCreditosAtivos(): CreditoAtivo[] {
  return loadCreditos().filter(c => c.estado === "ativo");
}

export function getTodosCreditos(): CreditoAtivo[] {
  return loadCreditos();
}

export function getCreditoById(id: number): CreditoAtivo | null {
  return loadCreditos().find(c => c.id === id) || null;
}

export function getCreditosByClienteId(clienteId: number): CreditoAtivo[] {
  return loadCreditos().filter(c => c.clienteId === clienteId);
}

export async function syncCreditosFromBackend(): Promise<void> {
  try {
    const data = await apiFetch<{ loans: any[] }>("/loans/");
    const backend = (data.loans || [])
      .filter((l: any) => {
        const isDisbursed = String(l.disbursement_status || "").toLowerCase() === "disbursed";
        const isActive = String(l.status || "").toLowerCase() === "active";
        const hasBalance = Number(l.balance || l.saldoDevedor || 0) > 0;
        return isDisbursed || isActive || hasBalance;
      })
      .map(normalizeCredito);

    const locais = loadCreditos();

    for (const b of backend) {
      const idx = locais.findIndex((l) => (l.contrato && l.contrato === b.contrato) || (l.id && l.id === b.id));
      if (idx >= 0) {
        locais[idx] = {
          ...b,
          ...locais[idx],
          parcelas: locais[idx].parcelas.length ? locais[idx].parcelas : b.parcelas,
          membros: locais[idx].membros.length ? locais[idx].membros : b.membros,
        };
      } else {
        locais.push(b);
      }
    }

    saveCreditos(locais);
  } catch {
    // silently fail, keep local data
  }
}

export function registrarReembolso(
  creditoId: number,
  parcelaNum: number,
  valorPago: number,
  dataPagamento: string
): CreditoAtivo | null {
  const creditos = loadCreditos();
  const idx = creditos.findIndex(c => c.id === creditoId);
  if (idx === -1) return null;

  const credito = creditos[idx];
  const parcelaIdx = credito.parcelas.findIndex(p => p.numParcela === parcelaNum);
  if (parcelaIdx === -1) return null;

  // Atualizar parcela
  credito.parcelas[parcelaIdx] = {
    ...credito.parcelas[parcelaIdx],
    status: "pago",
    dataPagamento,
    valorPago,
  };

  // Recalcular totais
  credito.totalPago = credito.parcelas
    .filter(p => p.status === "pago")
    .reduce((sum, p) => sum + (p.valorPago || 0), 0);
  
  credito.saldoDevedor = Math.max(0, credito.totalAPagar - credito.totalPago);

  // Verificar se está liquidado
  const todasPagas = credito.parcelas.every(p => p.status === "pago") || credito.saldoDevedor <= 0.01;
  if (todasPagas) {
    credito.estado = "liquidado";
  }

  // Recalcular mora
  recalcularMora(credito);

  creditos[idx] = credito;
  saveCreditos(creditos);

  // Sync ao backend (assíncrono, não bloqueante)
  syncToBackend(credito);

  return credito;
}

export type ResultadoPagamentoCascata = {
  credito: CreditoAtivo;
  valorEntregue: number;
  valorAplicadoReal: number;
  moraCobrada: number;
  moraPerdoada: number;
  trocoDevolvido: number;
  novoSaldoDevedor: number;
  parcelasAfetadas: {
    numParcela: number;
    valorPagoAnterior: number;
    valorAlocadoAgora: number;
    valorPagoTotal: number;
    status: "pago" | "pendente" | "atrasado";
    saldoRestante: number;
  }[];
};

export function aplicarPagamentoCascata(
  creditoId: number,
  valorEntregue: number,
  dataPagamento: string,
  opcoes?: {
    moraPerdoada?: number;
    devolverTroco?: boolean;
  }
): ResultadoPagamentoCascata | null {
  const creditos = loadCreditos();
  const idx = creditos.findIndex((c) => c.id === creditoId);
  if (idx === -1) return null;

  const credito = creditos[idx];
  const moraPerdoada = Math.max(0, Number(opcoes?.moraPerdoada || 0));
  const devolverTroco = opcoes?.devolverTroco !== false;

  recalcularMora(credito);
  const moraDevidaTotal = Math.max(0, Number(credito.mora || 0));
  const moraEfetiva = Math.max(0, moraDevidaTotal - moraPerdoada);

  // 1. Quitar Mora primeiro
  const moraCobrada = Math.min(valorEntregue, moraEfetiva);
  let valorRestante = Math.max(0, valorEntregue - moraCobrada);

  const parcelasAfetadas: ResultadoPagamentoCascata["parcelasAfetadas"] = [];
  let valorCapitalAmortizado = 0;

  // 2. Distribuir em cascata nas parcelas não pagas (ordenadas por numParcela)
  credito.parcelas.sort((a, b) => a.numParcela - b.numParcela);

  for (let i = 0; i < credito.parcelas.length; i++) {
    const p = credito.parcelas[i];
    const valorJaPago = Number(p.valorPago || 0);
    const saldoParcela = Math.max(0, p.valor - valorJaPago);

    if (p.status === "pago" || saldoParcela <= 0.001) {
      continue;
    }

    if (valorRestante <= 0) break;

    const alocacao = Math.min(valorRestante, saldoParcela);
    const novoValorPago = Math.round((valorJaPago + alocacao) * 100) / 100;
    const novoSaldoParcela = Math.max(0, Math.round((p.valor - novoValorPago) * 100) / 100);
    const isPaga = novoSaldoParcela <= 0.01;

    credito.parcelas[i] = {
      ...p,
      valorPago: novoValorPago,
      status: isPaga ? "pago" : "pendente",
      dataPagamento: dataPagamento || p.dataPagamento || new Date().toISOString().split("T")[0],
    };

    parcelasAfetadas.push({
      numParcela: p.numParcela,
      valorPagoAnterior: valorJaPago,
      valorAlocadoAgora: alocacao,
      valorPagoTotal: novoValorPago,
      status: isPaga ? "pago" : "pendente",
      saldoRestante: novoSaldoParcela,
    });

    valorCapitalAmortizado += alocacao;
    valorRestante = Math.round((valorRestante - alocacao) * 100) / 100;
  }

  // 3. Excedente / Troco
  let trocoDevolvido = 0;
  let valorAplicadoReal = moraCobrada + valorCapitalAmortizado;

  if (valorRestante > 0.01) {
    if (devolverTroco) {
      trocoDevolvido = valorRestante;
      valorAplicadoReal = moraCobrada + valorCapitalAmortizado;
    } else {
      valorAplicadoReal = valorEntregue;
    }
  }

  // 4. Recalcular totais do crédito
  credito.totalPago = Math.round(credito.parcelas.reduce((sum, p) => sum + (p.valorPago || 0), 0) * 100) / 100;
  credito.saldoDevedor = Math.max(0, Math.round((credito.totalAPagar - credito.totalPago) * 100) / 100);

  const todasPagas = credito.parcelas.every((p) => p.status === "pago") || credito.saldoDevedor <= 0.01;
  if (todasPagas) {
    credito.estado = "liquidado";
    credito.saldoDevedor = 0;
  }

  recalcularMora(credito);

  creditos[idx] = credito;
  saveCreditos(creditos);
  syncToBackend(credito);

  return {
    credito,
    valorEntregue,
    valorAplicadoReal,
    moraCobrada,
    moraPerdoada,
    trocoDevolvido,
    novoSaldoDevedor: credito.saldoDevedor,
    parcelasAfetadas,
  };
}

export function recalcularMora(credito: CreditoAtivo): void {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  let moraTotal = 0;
  let atrasadas = 0;

  for (const parcela of credito.parcelas) {
    if (parcela.status === "pago") continue;
    
    const vencimento = parseDate(parcela.dataVencimento);
    if (!vencimento) continue;
    vencimento.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      atrasadas++;
      // Mora simples: 0.5% ao dia sobre o saldo restante da parcela
      const taxaMoraDiaria = 0.005;
      const saldoParcela = Math.max(0, parcela.valor - (parcela.valorPago || 0));
      moraTotal += saldoParcela * taxaMoraDiaria * diffDays;
    }
  }

  credito.mora = Math.round(moraTotal * 100) / 100;
  credito.prestacoesAtrasadas = atrasadas;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
  } else if (dateStr.includes("-")) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export function getResumoCreditos(): {
  totalAtivos: number;
  valorTotalAPagar: number;
  valorTotalPago: number;
  saldoDevedorTotal: number;
  moraTotal: number;
} {
  const ativos = getCreditosAtivos();
  return {
    totalAtivos: ativos.length,
    valorTotalAPagar: ativos.reduce((s, c) => s + c.totalAPagar, 0),
    valorTotalPago: ativos.reduce((s, c) => s + c.totalPago, 0),
    saldoDevedorTotal: ativos.reduce((s, c) => s + c.saldoDevedor, 0),
    moraTotal: ativos.reduce((s, c) => s + c.mora, 0),
  };
}

// Função de sincronização com o banco de dados em tempo real
export function useCreditosPolling(
  setCreditos: (creditos: CreditoAtivo[]) => void,
): () => void {
  const reload = () => {
    void syncCreditosFromBackend().finally(() => {
      const creditos = loadCreditos();
      let altered = false;
      for (const c of creditos) {
        const moraAntes = c.mora;
        recalcularMora(c);
        if (c.mora !== moraAntes) altered = true;
      }
      if (altered) saveCreditos(creditos);
      setCreditos(creditos);
    });
  };

  // Carrega imediatamente
  reload();

  // Escuta eventos SSE em tempo real
  const unsub1 = realtimeClient.subscribe("LOAN_DISBURSED", reload);
  const unsub2 = realtimeClient.subscribe("REPAYMENT_APPLIED", reload);
  const unsub3 = realtimeClient.subscribe("LOAN_DECISION_UPDATED", reload);
  const unsub4 = realtimeClient.subscribe("CONNECTED", reload);

  return () => {
    unsub1();
    unsub2();
    unsub3();
    unsub4();
  };
}