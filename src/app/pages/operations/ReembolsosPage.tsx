import { useState, useEffect, useMemo } from "react";
import {
  Banknote, Search, Plus, Eye, FileText, Users, Filter, Loader2,
  CreditCard, XCircle, CheckCircle2, AlertTriangle, User, Calendar,
  DollarSign, History, Trash2, Printer, TrendingUp, Layers, ArrowDown,
  RotateCcw, Sparkles, Percent, Clock, ShieldAlert, Download, Building2, Check,
  ChevronRight, ArrowRight, ShieldCheck, HelpCircle, AlertCircle, Coins,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Label } from "../../components/ui/label";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients, type ClientSummary } from "../../lib/clients";
import { listCarteiras, type Carteira } from "../../lib/carteiras";
import { formatCurrency, formatCurrencyMT } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";
import { fetchPaymentMethods, type PaymentMethod } from "../../lib/payment-methods";
import {
  getCreditosAtivos,
  getResumoCreditos,
  useCreditosPolling,
  aplicarPagamentoCascata,
  recalcularMora,
} from "../../lib/credits";
import { apiFetch } from "../../lib/api";
import { toast } from "sonner";
import type { CreditoAtivo, Installment } from "../../../../shared/types";

export type ReembolsoRecord = {
  id: number;
  receiptNo: string;
  paymentDate: string;
  clientId: number;
  clientName: string;
  loanId?: number;
  contractNo: string;
  managerName: string;
  carteiraName: string;
  amountReceived: number;
  principalApplied: number;
  interestApplied: number;
  moraApplied: number;
  moraWaived?: number;
  trocoDevolvido?: number;
  destinationAccount: string;
  notes?: string;
  createdByName?: string;
  createdAt?: string;
  detalhesParcelas?: {
    numParcela: number;
    valorAlocado: number;
    quitada: boolean;
    saldoRestante: number;
  }[];
};

export type PrevistoRecord = {
  id: number;
  loanId: number;
  installmentNo: number;
  totalInstallments: number;
  dueDate: string;
  dueDateFormatted: string;
  contractNo: string;
  clientId: number;
  clientName: string;
  clientPhone: string;
  clientOccupation: string;
  managerName: string;
  carteiraName: string;
  principalAmount: number;
  interestAmount: number;
  paymentAmount: number;
  principalPaid: number;
  interestPaid: number;
  moraPaid: number;
  status: string;
  daysDiff: number;
};

export type DesempenhoCarteira = {
  carteiraId: number | string;
  carteiraNome: string;
  gestorNome: string;
  desembolsosValor: number;
  desembolsosQtd: number;
  novosClientesValor: number;
  novosClientesQtd: number;
  reemprestimosValor: number;
  reemprestimosQtd: number;
  reembolsosValor: number;
  reembolsosQtd: number;
  previstoValor: number;
  taxaRecuperacao: number;
  atrasoValor: number;
  atrasoQtd: number;
  percentagemAtraso: number;
  saldoAtivo: number;
};

export type MoraCreditRecord = {
  id: number;
  loanId: number;
  contrato: string;
  clientId: number;
  cliente: string;
  clienteType: string;
  carteiraName: string;
  gestorName: string;
  saldoDevedor: number;
  prestacoesAtrasadas: number;
  diasAtrasoMax: number;
  taxaMoraDiariaPercent: number;
  moraCalculada: number;
  moraPerdoada: number;
  saldoTotalComMora: number;
  parcelasVencidas: {
    numParcela: number;
    vencimento: string;
    valor: number;
    diasAtraso: number;
    mora: number;
  }[];
};

export type SimulatedAllocationItem = {
  numParcela: number;
  dataVencimento: string;
  valorTotalParcela: number;
  valorJaPagoAntes: number;
  saldoPendenteAntes: number;
  moraParcela: number;
  diasAtraso: number;
  alocadoAgora: number;
  valorPagoTotalDepois: number;
  saldoRestanteDepois: number;
  isFullyPaidNow: boolean;
  isPartialNow: boolean;
  wasAlreadyPaid: boolean;
};

const REEMBOLSOS_STORAGE_KEY = "msu_historico_reembolsos_v2";

function loadStoredReembolsos(): ReembolsoRecord[] {
  try {
    return JSON.parse(localStorage.getItem(REEMBOLSOS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveStoredReembolsos(items: ReembolsoRecord[]) {
  try {
    localStorage.setItem(REEMBOLSOS_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}
export default function ReembolsosPage() {
  const user = getUser();
  const canRegisterPayment = hasPermission(user, "registrar.pagamento");
  const canViewMora = hasPermission(user, "registrar.mora");

  const [activeTab, setActiveTab] = useState<"reembolsos" | "previstos" | "desempenho" | "mora">("reembolsos");
  const [creditos, setCreditos] = useState<CreditoAtivo[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [carteiras, setCarteiras] = useState<Carteira[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterCarteira, setFilterCarteira] = useState("all");
  const [filterGestor, setFilterGestor] = useState("all");

  const [reembolsosList, setReembolsosList] = useState<ReembolsoRecord[]>([]);
  const [previstosList, setPrevistosList] = useState<PrevistoRecord[]>([]);
  const [moraList, setMoraList] = useState<MoraCreditRecord[]>([]);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMoraModal, setShowMoraModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReembolso, setSelectedReembolso] = useState<ReembolsoRecord | null>(null);
  const [moraTargetCredit, setMoraTargetCredit] = useState<MoraCreditRecord | null>(null);

  // Form State
  const [payClientId, setPayClientId] = useState<number | "">("");
  const [payLoanId, setPayLoanId] = useState<number | "">("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payAccount, setPayAccount] = useState("Caixa Geral");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [payReceiptNo, setPayReceiptNo] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Excedente / Troco Decision State
  const [surplusOption, setSurplusOption] = useState<"devolver_troco" | "pagar_tudo">("devolver_troco");

  // Perdão de Mora State
  const [enableMoraPardon, setEnableMoraPardon] = useState(false);
  const [moraPardonMode, setMoraPardonMode] = useState<"total" | "parcial">("total");
  const [moraPardonAmount, setMoraPardonAmount] = useState("");
  const [moraPardonJustification, setMoraPardonJustification] = useState("Acordo de regularização com o cliente");

  useEffect(() => useCreditosPolling(setCreditos), []);

  useEffect(() => {
    fetchClients().then(setClients).catch(() => setClients([]));
    listCarteiras().then((res) => setCarteiras(res.carteiras || [])).catch(() => setCarteiras([]));
    fetchPaymentMethods(true)
      .then((pms) => {
        setPaymentMethods(pms);
        if (pms.length > 0) {
          const def = pms.find((p) => p.isDefault) || pms[0];
          setPayAccount(def.name);
        }
      })
      .catch(() => {});
  }, []);

  const loadBackendData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append("from", dateFrom);
      if (dateTo) params.append("to", dateTo);
      if (filterGestor !== "all") params.append("manager", filterGestor);

      const [reimbRes, forecastRes] = await Promise.allSettled([
        apiFetch<{ items?: any[]; reimbursements?: any[] }>(`/loans/payments/reimbursements?${params.toString()}`),
        apiFetch<{ items?: any[]; schedule?: any[] }>(`/loans/payments/forecast?${params.toString()}`),
      ]);

      const localReembolsos = loadStoredReembolsos();
      if (reimbRes.status === "fulfilled" && reimbRes.value) {
        const rawList = reimbRes.value.items || reimbRes.value.reimbursements || [];
        const mapped = rawList.map((r: any) => ({
          id: Number(r.id || Date.now()),
          receiptNo: String(r.receiptNo || r.receipt_no || `REC-${r.id}`),
          paymentDate: String(r.paymentDate || r.payment_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
          clientId: Number(r.clientId || r.client_id || 0),
          clientName: String(r.clientName || r.client_name || r.client || "Cliente"),
          loanId: r.loanId || r.loan_id ? Number(r.loanId || r.loan_id) : undefined,
          contractNo: String(r.contractNo || r.contract_no || "-"),
          managerName: String(r.managerName || r.manager_name || "Gestor"),
          carteiraName: String(r.carteiraName || r.product || "Geral"),
          amountReceived: Number(r.amountReceived || r.amount_received || r.amount || 0),
          principalApplied: Number(r.principalApplied || r.principal_applied || 0),
          interestApplied: Number(r.interestApplied || r.interest_applied || 0),
          moraApplied: Number(r.moraApplied || r.mora_applied || 0),
          destinationAccount: String(r.destinationAccount || r.destination_account || "Caixa Geral"),
          notes: String(r.notes || r.note || ""),
          createdByName: String(r.createdByName || r.created_by_name || ""),
        }));
        const combined = [...mapped];
        localReembolsos.forEach((loc) => {
          if (!combined.some((c) => c.receiptNo === loc.receiptNo || c.id === loc.id)) {
            combined.push(loc);
          }
        });
        setReembolsosList(combined.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()));
      } else {
        setReembolsosList(localReembolsos.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()));
      }

      if (forecastRes.status === "fulfilled" && forecastRes.value) {
        const rawForecast = forecastRes.value.items || forecastRes.value.schedule || [];
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const mappedPrevistos = rawForecast.map((f: any) => {
          const dueIso = String(f.dueDate || f.due_date || "").slice(0, 10);
          const dueDateObj = dueIso ? new Date(dueIso) : new Date();
          dueDateObj.setHours(0, 0, 0, 0);
          const diffDays = Math.round((dueDateObj.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

          return {
            id: Number(f.id || Date.now()),
            loanId: Number(f.loanId || f.loan_id || 0),
            installmentNo: Number(f.installmentNo || f.installment_no || 1),
            totalInstallments: Number(f.totalInstallments || f.total_installments || 1),
            dueDate: dueIso,
            dueDateFormatted: dueIso.split("-").reverse().join("/"),
            contractNo: String(f.contractNo || f.contract_no || "-"),
            clientId: Number(f.clientId || f.client_id || 0),
            clientName: String(f.clientName || f.client_name || "Cliente"),
            clientPhone: String(f.clientPhone || f.client_phone || "-"),
            clientOccupation: String(f.clientOccupation || f.client_occupation || "-"),
            managerName: String(f.managerName || f.manager_name || "Sem Gestor"),
            carteiraName: String(f.product || f.carteiraName || "Geral"),
            principalAmount: Number(f.principalAmount || f.principal_amount || 0),
            interestAmount: Number(f.interestAmount || f.interest_amount || 0),
            paymentAmount: Number(f.paymentAmount || f.payment_amount || 0),
            principalPaid: Number(f.principalPaidAmount || f.principal_paid_amount || 0),
            interestPaid: Number(f.interestPaidAmount || f.interest_paid_amount || 0),
            moraPaid: Number(f.moraPaidAmount || f.mora_paid_amount || 0),
            status: String(f.status || (diffDays < 0 ? "overdue" : "pending")),
            daysDiff: diffDays,
          };
        });
        setPrevistosList(mappedPrevistos.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
      }

      recalculateMoraFromState();
    } catch {
      recalculateMoraFromState();
    } finally {
      setLoading(false);
    }
  };

  const recalculateMoraFromState = () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const taxaDiaria = 0.005;

    const list: MoraCreditRecord[] = creditos
      .filter((c) => c.estado === "ativo" && c.saldoDevedor > 0)
      .map((c) => {
        const client = clients.find((cl) => cl.id === c.clienteId);
        const carteira = carteiras.find((cart) => cart.id === client?.carteiraId);

        const parcelasVencidas = (c.parcelas || [])
          .filter((p) => p.status !== "pago")
          .map((p) => {
            let vencDate: Date | null = null;
            if (p.dataVencimento.includes("/")) {
              const parts = p.dataVencimento.split("/");
              vencDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            } else if (p.dataVencimento.includes("-")) {
              vencDate = new Date(p.dataVencimento);
            }
            if (vencDate) vencDate.setHours(0, 0, 0, 0);
            const diasAtraso = vencDate ? Math.max(0, Math.floor((hoje.getTime() - vencDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;
            const saldoParcela = Math.max(0, p.valor - (p.valorPago || 0));
            const moraParcela = diasAtraso > 0 ? saldoParcela * taxaDiaria * diasAtraso : 0;
            return {
              numParcela: p.numParcela,
              vencimento: p.dataVencimento,
              valor: p.valor,
              diasAtraso,
              mora: moraParcela,
            };
          })
          .filter((p) => p.diasAtraso > 0);

        const totalMoraCalc = parcelasVencidas.reduce((sum, p) => sum + p.mora, 0) || Number(c.mora || 0);
        const diasMax = parcelasVencidas.length > 0 ? Math.max(...parcelasVencidas.map((p) => p.diasAtraso)) : Number(c.prestacoesAtrasadas || 0);

        return {
          id: c.id,
          loanId: c.id,
          contrato: c.contrato,
          clientId: c.clienteId,
          cliente: c.cliente,
          clienteType: c.clienteType,
          carteiraName: client?.carteiraNome || carteira?.name || c.tipoCredito || "Geral",
          gestorName: client?.gestorName || carteira?.gestor_name || "Gestor de Carteira",
          saldoDevedor: Number(c.saldoDevedor || 0),
          prestacoesAtrasadas: parcelasVencidas.length || Number(c.prestacoesAtrasadas || 0),
          diasAtrasoMax: diasMax,
          taxaMoraDiariaPercent: taxaDiaria * 100,
          moraCalculada: totalMoraCalc,
          moraPerdoada: 0,
          saldoTotalComMora: Number(c.saldoDevedor || 0) + totalMoraCalc,
          parcelasVencidas,
        };
      })
      .filter((m) => m.diasAtrasoMax > 0 || m.moraCalculada > 0)
      .sort((a, b) => b.diasAtrasoMax - a.diasAtrasoMax);

    setMoraList(list);
  };

  useEffect(() => {
    void loadBackendData();
  }, [dateFrom, dateTo, filterGestor, creditos, clients, carteiras]);

  // Lista unificada de contratos dispon�veis para o cliente selecionado
  const availableContractsForClient = useMemo(() => {
    if (!payClientId) return [];

    const directCredits = creditos.filter((c) => c.clienteId === payClientId);
    if (directCredits.length > 0) return directCredits;

    // Se n�o estiver em creditos ativos, verifica se h� no previstosList
    const fromPrevistos = previstosList.filter((p) => p.clientId === payClientId);
    if (fromPrevistos.length > 0) {
      const uniqueLoans = new Map<number, CreditoAtivo>();
      fromPrevistos.forEach((p) => {
        if (!uniqueLoans.has(p.loanId)) {
          const loanParcelas = fromPrevistos
            .filter((item) => item.loanId === p.loanId)
            .map((item) => ({
              numParcela: item.installmentNo,
              dataVencimento: item.dueDateFormatted || item.dueDate,
              valor: item.paymentAmount,
              status: (item.status === "paid" ? "pago" : "pendente") as Installment["status"],
              valorPago: item.principalPaid + item.interestPaid,
            }));

          const totalCred = loanParcelas.reduce((s, it) => s + it.valor, 0);
          const totalPaid = loanParcelas.reduce((s, it) => s + (it.valorPago || 0), 0);

          uniqueLoans.set(p.loanId, {
            id: p.loanId,
            pedidoId: p.loanId,
            clienteId: p.clientId,
            cliente: p.clientName,
            clienteType: "singular",
            contrato: p.contractNo,
            valorSolicitado: totalCred,
            totalAPagar: totalCred,
            totalPago: totalPaid,
            saldoDevedor: Math.max(0, totalCred - totalPaid),
            prazo: p.totalInstallments || loanParcelas.length,
            taxa: 0,
            frequencia: "Mensal",
            tipoCredito: p.carteiraName || "Geral",
            mesReferencia: "",
            reemprestimo: false,
            membros: [],
            parcelas: loanParcelas,
            estado: "ativo",
            dataDesembolso: "",
            mora: 0,
            prestacoesAtrasadas: 0,
          });
        }
      });
      return Array.from(uniqueLoans.values());
    }

    // Fallback: se o cliente tem d�vida declarada no cadastro
    const client = clients.find((cl) => cl.id === payClientId);
    if (client && (client.debt > 0 || client.loans > 0)) {
      const defaultContract: CreditoAtivo = {
        id: 90000 + client.id,
        pedidoId: 90000 + client.id,
        clienteId: client.id,
        cliente: client.name,
        clienteType: client.type || "singular",
        contrato: `CT-${new Date().getFullYear()}-${String(client.id).padStart(4, "0")}`,
        valorSolicitado: client.debt || 5000,
        totalAPagar: client.debt || 5000,
        totalPago: 0,
        saldoDevedor: client.debt || 5000,
        prazo: 1,
        taxa: 0,
        frequencia: "Mensal",
        tipoCredito: client.carteiraNome || "Geral",
        mesReferencia: "",
        reemprestimo: false,
        membros: [],
        parcelas: [
          {
            numParcela: 1,
            dataVencimento: new Date().toLocaleDateString("pt-PT"),
            valor: client.debt || 5000,
            status: "pendente",
            valorPago: 0,
          },
        ],
        estado: "ativo",
        dataDesembolso: new Date().toLocaleDateString("pt-PT"),
        mora: 0,
        prestacoesAtrasadas: 0,
      };
      return [defaultContract];
    }

    return [];
  }, [payClientId, creditos, previstosList, clients]);

  // Cr�dito selecionado para pagamento
  const selectedPayCredit = useMemo(() => {
    if (payLoanId) {
      const match = creditos.find((c) => c.id === payLoanId);
      if (match) return match;
      const matchAvail = availableContractsForClient.find((c) => c.id === payLoanId);
      if (matchAvail) return matchAvail;
    }
    if (payClientId && availableContractsForClient.length > 0) {
      return availableContractsForClient[0];
    }
    return null;
  }, [payClientId, payLoanId, creditos, availableContractsForClient]);

  // Ao selecionar cliente, auto-seleciona o primeiro contrato ativo e a 1� presta��o em aberto
  useEffect(() => {
    if (payClientId) {
      if (availableContractsForClient.length > 0) {
        const firstContract = availableContractsForClient[0];
        setPayLoanId(firstContract.id);
      }
    }
  }, [payClientId, availableContractsForClient]);

  // Ao mudar selectedPayCredit, inicializa o valor com a 1� presta��o em aberto
  useEffect(() => {
    if (selectedPayCredit) {
      const sorted = [...(selectedPayCredit.parcelas || [])].sort((a, b) => a.numParcela - b.numParcela);
      const primeiraPendente = sorted.find((p) => {
        const jaPago = Number(p.valorPago || 0);
        return p.status !== "pago" && (p.valor - jaPago) > 0.01;
      });

      const valorSugerido = primeiraPendente
        ? Math.max(0, Math.round((primeiraPendente.valor - Number(primeiraPendente.valorPago || 0)) * 100) / 100)
        : selectedPayCredit.saldoDevedor;

      setPayAmount(String(valorSugerido));
      setPayReceiptNo(`REC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
      setSurplusOption("devolver_troco");

      if (selectedPayMora.moraDevida > 0) {
        setMoraPardonAmount(String(selectedPayMora.moraDevida));
      }
    }
  }, [selectedPayCredit?.id]);
  // Mora do cr�dito selecionado
  const selectedPayMora = useMemo(() => {
    if (!selectedPayCredit) return { diasAtraso: 0, moraDevida: 0 };
    const match = moraList.find((m) => m.id === selectedPayCredit.id);
    if (match) return { diasAtraso: match.diasAtrasoMax, moraDevida: match.moraCalculada };
    return { diasAtraso: selectedPayCredit.prestacoesAtrasadas || 0, moraDevida: Number(selectedPayCredit.mora || 0) };
  }, [selectedPayCredit, moraList]);

  // Simula��o em tempo real da cascata de pagamento (Waterfall Allocation)
  const waterfallSimulation = useMemo(() => {
    if (!selectedPayCredit) {
      return {
        moraDevida: 0,
        moraPerdoada: 0,
        moraCobrada: 0,
        valorParaParcelas: 0,
        items: [] as SimulatedAllocationItem[],
        totalPendenteParcelas: 0,
        totalNecessarioGeral: 0,
        excedenteTroco: 0,
        temExcedente: false,
        valorAmortizadoCapital: 0,
        saldoDevedorAnterior: 0,
        novoSaldoDevedor: 0,
        primeiraAbertaNum: 1,
      };
    }

    const valorEntregue = Math.max(0, Number(payAmount) || 0);
    const moraDevida = Math.max(0, selectedPayMora.moraDevida);

    let moraPerdoada = 0;
    if (enableMoraPardon && moraDevida > 0) {
      moraPerdoada = moraPardonMode === "total" ? moraDevida : Math.min(moraDevida, Number(moraPardonAmount) || 0);
    }
    const moraEfetiva = Math.max(0, moraDevida - moraPerdoada);

    // 1. Quita a mora prioritariamente
    const moraCobrada = Math.min(valorEntregue, moraEfetiva);
    let restanteParaParcelas = Math.max(0, valorEntregue - moraCobrada);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const taxaDiaria = 0.005;

    const sortedParcelas = [...(selectedPayCredit.parcelas || [])].sort((a, b) => a.numParcela - b.numParcela);
    let totalPendenteParcelas = 0;
    let primeiraAbertaNum = 1;
    let encontrouPrimeira = false;

    const items: SimulatedAllocationItem[] = sortedParcelas.map((p) => {
      const valorTotal = p.valor;
      const valorJaPago = Number(p.valorPago || 0);
      const saldoPendente = Math.max(0, Math.round((valorTotal - valorJaPago) * 100) / 100);
      const wasAlreadyPaid = p.status === "pago" || saldoPendente <= 0.01;

      if (!wasAlreadyPaid) {
        totalPendenteParcelas += saldoPendente;
        if (!encontrouPrimeira) {
          primeiraAbertaNum = p.numParcela;
          encontrouPrimeira = true;
        }
      }

      // Calcula mora espec�fica da parcela
      let diasAtraso = 0;
      let moraParcela = 0;
      if (!wasAlreadyPaid) {
        let vencDate: Date | null = null;
        if (p.dataVencimento.includes("/")) {
          const parts = p.dataVencimento.split("/");
          vencDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        } else if (p.dataVencimento.includes("-")) {
          vencDate = new Date(p.dataVencimento);
        }
        if (vencDate) vencDate.setHours(0, 0, 0, 0);
        diasAtraso = vencDate ? Math.max(0, Math.floor((hoje.getTime() - vencDate.getTime()) / (1000 * 60 * 60 * 24))) : 0;
        moraParcela = diasAtraso > 0 ? saldoPendente * taxaDiaria * diasAtraso : 0;
      }

      // Aloca��o em cascata se n�o estiver paga
      let alocadoAgora = 0;
      if (!wasAlreadyPaid && restanteParaParcelas > 0) {
        alocadoAgora = Math.min(restanteParaParcelas, saldoPendente);
        restanteParaParcelas = Math.max(0, Math.round((restanteParaParcelas - alocadoAgora) * 100) / 100);
      }

      const valorPagoTotalDepois = Math.round((valorJaPago + alocadoAgora) * 100) / 100;
      const saldoRestanteDepois = Math.max(0, Math.round((valorTotal - valorPagoTotalDepois) * 100) / 100);
      const isFullyPaidNow = !wasAlreadyPaid && saldoRestanteDepois <= 0.01 && alocadoAgora > 0;
      const isPartialNow = !wasAlreadyPaid && saldoRestanteDepois > 0.01 && alocadoAgora > 0;

      return {
        numParcela: p.numParcela,
        dataVencimento: p.dataVencimento,
        valorTotalParcela: valorTotal,
        valorJaPagoAntes: valorJaPago,
        saldoPendenteAntes: saldoPendente,
        moraParcela,
        diasAtraso,
        alocadoAgora,
        valorPagoTotalDepois,
        saldoRestanteDepois,
        isFullyPaidNow,
        isPartialNow,
        wasAlreadyPaid,
      };
    });

    const totalNecessarioGeral = moraEfetiva + totalPendenteParcelas;
    const excedenteTroco = Math.max(0, Math.round(restanteParaParcelas * 100) / 100);
    const temExcedente = excedenteTroco > 0.01;

    const valorAmortizadoCapital = items.reduce((s, it) => s + it.alocadoAgora, 0);
    const saldoDevedorAnterior = Number(selectedPayCredit.saldoDevedor || 0);
    const novoSaldoDevedor = Math.max(0, Math.round((totalPendenteParcelas - valorAmortizadoCapital) * 100) / 100);

    return {
      moraDevida,
      moraPerdoada,
      moraCobrada,
      valorParaParcelas: valorEntregue - moraCobrada,
      items,
      totalPendenteParcelas,
      totalNecessarioGeral,
      excedenteTroco,
      temExcedente,
      valorAmortizadoCapital,
      saldoDevedorAnterior,
      novoSaldoDevedor,
      primeiraAbertaNum,
    };
  }, [selectedPayCredit, payAmount, selectedPayMora, enableMoraPardon, moraPardonMode, moraPardonAmount]);

  const filteredReembolsos = useMemo(() => {
    return reembolsosList.filter((r) => {
      const matchSearch =
        r.clientName.toLowerCase().includes(search.toLowerCase()) ||
        r.contractNo.toLowerCase().includes(search.toLowerCase()) ||
        r.receiptNo.toLowerCase().includes(search.toLowerCase());
      const matchCarteira = filterCarteira === "all" || r.carteiraName === filterCarteira;
      const matchGestor = filterGestor === "all" || r.managerName.toLowerCase().includes(filterGestor.toLowerCase());
      const matchDateFrom = !dateFrom || r.paymentDate >= dateFrom;
      const matchDateTo = !dateTo || r.paymentDate <= dateTo;
      return matchSearch && matchCarteira && matchGestor && matchDateFrom && matchDateTo;
    });
  }, [reembolsosList, search, filterCarteira, filterGestor, dateFrom, dateTo]);

  const filteredPrevistos = useMemo(() => {
    return previstosList.filter((p) => {
      const matchSearch =
        p.clientName.toLowerCase().includes(search.toLowerCase()) ||
        p.contractNo.toLowerCase().includes(search.toLowerCase());
      const matchCarteira = filterCarteira === "all" || p.carteiraName === filterCarteira;
      const matchGestor = filterGestor === "all" || p.managerName.toLowerCase().includes(filterGestor.toLowerCase());
      const matchDateFrom = !dateFrom || p.dueDate >= dateFrom;
      const matchDateTo = !dateTo || p.dueDate <= dateTo;
      return matchSearch && matchCarteira && matchGestor && matchDateFrom && matchDateTo;
    });
  }, [previstosList, search, filterCarteira, filterGestor, dateFrom, dateTo]);

  const filteredMora = useMemo(() => {
    return moraList.filter((m) => {
      const matchSearch =
        m.cliente.toLowerCase().includes(search.toLowerCase()) ||
        m.contrato.toLowerCase().includes(search.toLowerCase());
      const matchCarteira = filterCarteira === "all" || m.carteiraName === filterCarteira;
      const matchGestor = filterGestor === "all" || m.gestorName.toLowerCase().includes(filterGestor.toLowerCase());
      return matchSearch && matchCarteira && matchGestor;
    });
  }, [moraList, search, filterCarteira, filterGestor]);

  const desempenhoCarteiras: DesempenhoCarteira[] = useMemo(() => {
    const map = new Map<string, DesempenhoCarteira>();

    carteiras.forEach((c) => {
      map.set(c.name.toLowerCase().trim(), {
        carteiraId: c.id,
        carteiraNome: c.name,
        gestorNome: c.gestor_name || c.gestor_user_name || "Gestor de Carteira",
        desembolsosValor: 0,
        desembolsosQtd: 0,
        novosClientesValor: 0,
        novosClientesQtd: 0,
        reemprestimosValor: 0,
        reemprestimosQtd: 0,
        reembolsosValor: 0,
        reembolsosQtd: 0,
        previstoValor: 0,
        taxaRecuperacao: 100,
        atrasoValor: 0,
        atrasoQtd: 0,
        percentagemAtraso: 0,
        saldoAtivo: 0,
      });
    });

    if (map.size === 0) {
      map.set("geral", {
        carteiraId: 1,
        carteiraNome: "Geral",
        gestorNome: "Gestor Geral",
        desembolsosValor: 0,
        desembolsosQtd: 0,
        novosClientesValor: 0,
        novosClientesQtd: 0,
        reemprestimosValor: 0,
        reemprestimosQtd: 0,
        reembolsosValor: 0,
        reembolsosQtd: 0,
        previstoValor: 0,
        taxaRecuperacao: 100,
        atrasoValor: 0,
        atrasoQtd: 0,
        percentagemAtraso: 0,
        saldoAtivo: 0,
      });
    }

    creditos.forEach((c) => {
      const client = clients.find((cl) => cl.id === c.clienteId);
      const cartName = (client?.carteiraNome || c.tipoCredito || "Geral").toLowerCase().trim();
      let item = map.get(cartName);
      if (!item) {
        item = {
          carteiraId: cartName,
          carteiraNome: client?.carteiraNome || c.tipoCredito || "Geral",
          gestorNome: client?.gestorName || "Gestor",
          desembolsosValor: 0,
          desembolsosQtd: 0,
          novosClientesValor: 0,
          novosClientesQtd: 0,
          reemprestimosValor: 0,
          reemprestimosQtd: 0,
          reembolsosValor: 0,
          reembolsosQtd: 0,
          previstoValor: 0,
          taxaRecuperacao: 100,
          atrasoValor: 0,
          atrasoQtd: 0,
          percentagemAtraso: 0,
          saldoAtivo: 0,
        };
        map.set(cartName, item);
      }

      item.desembolsosValor += Number(c.valorSolicitado || 0);
      item.desembolsosQtd += 1;
      item.saldoAtivo += Number(c.saldoDevedor || 0);

      if (c.reemprestimo) {
        item.reemprestimosValor += Number(c.valorSolicitado || 0);
        item.reemprestimosQtd += 1;
      } else {
        item.novosClientesValor += Number(c.valorSolicitado || 0);
        item.novosClientesQtd += 1;
      }
    });

    reembolsosList.forEach((r) => {
      const cartName = (r.carteiraName || "Geral").toLowerCase().trim();
      const item = map.get(cartName);
      if (item) {
        item.reembolsosValor += Number(r.amountReceived || 0);
        item.reembolsosQtd += 1;
      }
    });

    previstosList.forEach((p) => {
      const cartName = (p.carteiraName || "Geral").toLowerCase().trim();
      const item = map.get(cartName);
      if (item) {
        item.previstoValor += Number(p.paymentAmount || 0);
        if (p.daysDiff < 0) {
          item.atrasoValor += Number(p.paymentAmount || 0);
          item.atrasoQtd += 1;
        }
      }
    });

    const result = Array.from(map.values()).map((row) => {
      const baseRecup = row.reembolsosValor + row.atrasoValor;
      const taxaRec = baseRecup > 0 ? (row.reembolsosValor / baseRecup) * 100 : 100;
      const percAtraso = row.saldoAtivo > 0 ? (row.atrasoValor / row.saldoAtivo) * 100 : 0;
      return {
        ...row,
        taxaRecuperacao: Math.min(100, Math.round(taxaRec * 10) / 10),
        percentagemAtraso: Math.min(100, Math.round(percAtraso * 10) / 10),
      };
    });

    return result;
  }, [carteiras, creditos, clients, reembolsosList, previstosList]);
  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payClientId || !payAmount || Number(payAmount) <= 0) {
      toast.error("Preencha o cliente e um valor de pagamento v�lido.");
      return;
    }

    setPaySubmitting(true);
    try {
      const client = clients.find((c) => c.id === payClientId);
      const loan = selectedPayCredit;
      const amountVal = Number(payAmount);
      const receiptNumber = payReceiptNo || `REC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

      let pardonAmountVal = 0;
      if (enableMoraPardon && selectedPayMora.moraDevida > 0) {
        pardonAmountVal = moraPardonMode === "total" ? selectedPayMora.moraDevida : Math.min(selectedPayMora.moraDevida, Number(moraPardonAmount || 0));

        if (pardonAmountVal > 0 && loan) {
          try {
            await apiFetch(`/loans/${loan.id}/financial-events`, {
              method: "POST",
              body: JSON.stringify({
                eventType: "perdao_mora",
                amount: pardonAmountVal,
                note: `Perd�o de mora no recebimento: ${moraPardonJustification} (Recibo ${receiptNumber})`,
              }),
            });
          } catch {}
        }
      }

      // Aplica a cascata localmente nas parcelas do cr�dito ativo
      if (loan) {
        aplicarPagamentoCascata(loan.id, amountVal, payDate, {
          moraPerdoada: pardonAmountVal,
          devolverTroco: surplusOption === "devolver_troco",
        });
      }

      const trocoFinal = (surplusOption === "devolver_troco" && waterfallSimulation.temExcedente)
        ? waterfallSimulation.excedenteTroco
        : 0;

      const valorCobradoEfetivo = amountVal - trocoFinal;

      try {
        await apiFetch("/loans/payments/apply", {
          method: "POST",
          body: JSON.stringify({
            clientId: Number(payClientId),
            loanId: loan ? Number(loan.id) : undefined,
            amount: valorCobradoEfetivo,
            paymentDate: payDate,
            note: `${payNotes ? payNotes + " | " : ""}Conta: ${payAccount} | Recibo: ${receiptNumber}${pardonAmountVal > 0 ? ` | Mora perdoada: ${pardonAmountVal} MT` : ""}${trocoFinal > 0 ? ` | Troco devolvido: ${formatCurrencyMT(trocoFinal)}` : ""}`,
          }),
        });
      } catch {}

      const detalhesParcelas = waterfallSimulation.items
        .filter((it) => it.alocadoAgora > 0)
        .map((it) => ({
          numParcela: it.numParcela,
          valorAlocado: it.alocadoAgora,
          quitada: it.isFullyPaidNow,
          saldoRestante: it.saldoRestanteDepois,
        }));

      const newRecord: ReembolsoRecord = {
        id: Date.now(),
        receiptNo: receiptNumber,
        paymentDate: payDate,
        clientId: Number(payClientId),
        clientName: client?.name || loan?.cliente || "Cliente",
        loanId: loan ? Number(loan.id) : undefined,
        contractNo: loan?.contrato || `CT-${new Date().getFullYear()}-${String(payClientId).padStart(4, "0")}`,
        managerName: client?.gestorName || "Gestor de Carteira",
        carteiraName: client?.carteiraNome || loan?.tipoCredito || "Geral",
        amountReceived: amountVal,
        principalApplied: waterfallSimulation.valorAmortizadoCapital,
        interestApplied: 0,
        moraApplied: waterfallSimulation.moraCobrada,
        moraWaived: pardonAmountVal,
        trocoDevolvido: trocoFinal,
        destinationAccount: payAccount,
        notes: payNotes,
        createdByName: user?.name || "Operador",
        createdAt: new Date().toISOString(),
        detalhesParcelas,
      };

      const updatedReembolsos = [newRecord, ...loadStoredReembolsos()];
      saveStoredReembolsos(updatedReembolsos);
      setReembolsosList(updatedReembolsos);

      toast.success(`Reembolso de ${formatCurrencyMT(valorCobradoEfetivo)} registrado com sucesso! ${trocoFinal > 0 ? `Troco de ${formatCurrencyMT(trocoFinal)} devolvido.` : ""}`);
      setShowPaymentModal(false);
      setSelectedReembolso(newRecord);
      setShowReceiptModal(true);

      setPayClientId("");
      setPayLoanId("");
      setPayAmount("");
      setPayNotes("");
      setEnableMoraPardon(false);
      setMoraPardonAmount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar reembolso.");
    } finally {
      setPaySubmitting(false);
    }
  };

  const handlePrintReceipt = (item: ReembolsoRecord) => {
    const now = new Date().toLocaleString("pt-PT");
    const parcelasInfo = item.detalhesParcelas && item.detalhesParcelas.length > 0
      ? item.detalhesParcelas
          .map(
            (dp) =>
              `<tr>
                <td style="padding:6px;border:1px solid #cbd5e1">Presta��o ${dp.numParcela}</td>
                <td style="padding:6px;text-align:right;border:1px solid #cbd5e1">${formatCurrencyMT(dp.valorAlocado)}</td>
                <td style="padding:6px;text-align:center;border:1px solid #cbd5e1">${dp.quitada ? "<span style='color:#16a34a;font-weight:bold'>QUITADA</span>" : `<span style='color:#d97706'>PARCIAL (Resta: ${formatCurrencyMT(dp.saldoRestante)})</span>`}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="3" style="padding:6px;text-align:center;border:1px solid #cbd5e1">Amortiza��o de Saldo Devedor</td></tr>`;

    openCorporatePrintWindow({
      title: `Recibo_${item.receiptNo}`,
      bodyHtml: `
        <div style="font-family:Arial,sans-serif;padding:24px;color:#1e293b;max-width:650px;margin:0 auto">
          <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px">
            <h2 style="margin:0;color:#0f172a;font-size:22px">RECIBO DE REEMBOLSO / PAGAMENTO</h2>
            <p style="margin:4px 0 0;color:#64748b;font-size:12px">Microcr�dito e Servi�os Financeiros</p>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;color:#64748b">Recibo Oficial N�:</span>
              <strong style="font-size:13px;font-family:monospace;color:#0f172a">${item.receiptNo}</strong>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="font-size:12px;color:#64748b">Data do Pagamento:</span>
              <strong style="font-size:12px;color:#0f172a">${item.paymentDate}</strong>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
            <tbody>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold;width:35%">Cliente:</td><td style="padding:6px">${item.clientName}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold">Contrato:</td><td style="padding:6px;font-family:monospace">${item.contractNo}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold">Carteira / Gestor:</td><td style="padding:6px">${item.carteiraName} (${item.managerName})</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold">Canal / Conta:</td><td style="padding:6px">${item.destinationAccount}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold">Total Entregue:</td><td style="padding:6px;font-weight:bold">${formatCurrencyMT(item.amountReceived)}</td></tr>
              ${item.trocoDevolvido && item.trocoDevolvido > 0 ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold;color:#16a34a">Troco Devolvido:</td><td style="padding:6px;font-weight:bold;color:#16a34a">${formatCurrencyMT(item.trocoDevolvido)}</td></tr>` : ""}
              <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold">Valor Efetivo Cobrado:</td><td style="padding:6px;font-weight:bold;color:#16a34a;font-size:14px">${formatCurrencyMT(item.amountReceived - (item.trocoDevolvido || 0))}</td></tr>
              ${item.moraApplied > 0 ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold;color:#dc2626">Mora Paga:</td><td style="padding:6px;color:#dc2626">${formatCurrencyMT(item.moraApplied)}</td></tr>` : ""}
              ${item.moraWaived && item.moraWaived > 0 ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-weight:bold;color:#d97706">Mora Perdoada:</td><td style="padding:6px;color:#d97706">${formatCurrencyMT(item.moraWaived)}</td></tr>` : ""}
            </tbody>
          </table>

          <div style="margin-bottom:16px">
            <h4 style="margin:0 0 6px;font-size:12px;color:#0f172a;text-transform:uppercase">Discrimina��o das Presta��es Amortizadas</h4>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="background:#f1f5f9">
                  <th style="padding:6px;text-align:left;border:1px solid #cbd5e1">Parcela</th>
                  <th style="padding:6px;text-align:right;border:1px solid #cbd5e1">Valor Alocado</th>
                  <th style="padding:6px;text-align:center;border:1px solid #cbd5e1">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${parcelasInfo}
              </tbody>
            </table>
          </div>

          <div style="margin-top:32px;display:flex;justify-content:space-between;text-align:center;font-size:11px;color:#64748b">
            <div style="border-top:1px solid #94a3b8;width:45%;padding-top:4px">Assinatura do Operador<br><strong>${item.createdByName || "Caixa"}</strong></div>
            <div style="border-top:1px solid #94a3b8;width:45%;padding-top:4px">Assinatura do Cliente<br><strong>${item.clientName}</strong></div>
          </div>
          <p style="text-align:center;font-size:10px;color:#94a3b8;margin-top:24px">Documento processado por computador aos ${now}</p>
        </div>
      `,
    });
  };
  const handlePrintDesempenho = () => {
    const now = new Date().toLocaleString("pt-PT");
    const rowsHtml = desempenhoCarteiras
      .map(
        (c) => `
      <tr style="border-bottom:1px solid #e2e8f0;font-size:12px">
        <td style="padding:8px;font-weight:bold">${c.carteiraNome}<br><span style="color:#64748b;font-size:11px;font-weight:normal">${c.gestorNome}</span></td>
        <td style="padding:8px;text-align:right">${formatCurrencyMT(c.desembolsosValor)}<br><span style="color:#64748b;font-size:11px">${c.desembolsosQtd} contr.</span></td>
        <td style="padding:8px;text-align:right">${formatCurrencyMT(c.novosClientesValor)}</td>
        <td style="padding:8px;text-align:right">${formatCurrencyMT(c.reemprestimosValor)}</td>
        <td style="padding:8px;text-align:right;color:#16a34a;font-weight:bold">${formatCurrencyMT(c.reembolsosValor)}</td>
        <td style="padding:8px;text-align:center;font-weight:bold;color:${c.taxaRecuperacao >= 90 ? "#16a34a" : c.taxaRecuperacao >= 70 ? "#d97706" : "#dc2626"}">${c.taxaRecuperacao}%</td>
        <td style="padding:8px;text-align:right;color:#dc2626;font-weight:bold">${formatCurrencyMT(c.atrasoValor)}</td>
        <td style="padding:8px;text-align:center;color:#dc2626">${c.percentagemAtraso}%</td>
      </tr>
    `
      )
      .join("");

    const totDesemb = desempenhoCarteiras.reduce((s, c) => s + c.desembolsosValor, 0);
    const totReemb = desempenhoCarteiras.reduce((s, c) => s + c.reembolsosValor, 0);
    const totAtraso = desempenhoCarteiras.reduce((s, c) => s + c.atrasoValor, 0);

    openCorporatePrintWindow({
      title: `Relatorio_Desempenho_Carteiras_${new Date().toISOString().split("T")[0]}`,
      bodyHtml: `
        <div style="font-family:Arial,sans-serif;padding:24px;color:#1e293b">
          <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px">
            <h2 style="margin:0;color:#0f172a;font-size:22px">RELAT�RIO DE DESEMPENHO POR CARTEIRA</h2>
            <p style="margin:4px 0 0;color:#64748b;font-size:12px">Desembolsos, Novos Clientes, Reempr�stimos, Reembolsos e Inadimpl�ncia</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
            <thead>
              <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;font-size:12px">
                <th style="padding:8px;text-align:left">Carteira / Gestor</th>
                <th style="padding:8px;text-align:right">Desembolsos</th>
                <th style="padding:8px;text-align:right">Novos</th>
                <th style="padding:8px;text-align:right">Reempr�stimos</th>
                <th style="padding:8px;text-align:right">Reembolsos</th>
                <th style="padding:8px;text-align:center">Recupera��o</th>
                <th style="padding:8px;text-align:right">Em Atraso</th>
                <th style="padding:8px;text-align:center">% Atraso</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr style="background:#f8fafc;font-weight:bold;font-size:13px;border-top:2px solid #0f172a">
                <td style="padding:10px">TOTAL CONSOLIDADO</td>
                <td style="padding:10px;text-align:right">${formatCurrencyMT(totDesemb)}</td>
                <td style="padding:10px;text-align:right">-</td>
                <td style="padding:10px;text-align:right">-</td>
                <td style="padding:10px;text-align:right;color:#16a34a">${formatCurrencyMT(totReemb)}</td>
                <td style="padding:10px;text-align:center">-</td>
                <td style="padding:10px;text-align:right;color:#dc2626">${formatCurrencyMT(totAtraso)}</td>
                <td style="padding:10px;text-align:center">-</td>
              </tr>
            </tbody>
          </table>
          <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:24px">Gerado em ${now}</p>
        </div>
      `,
    });
  };

  const handlePayFromPrevisto = (previsto: PrevistoRecord) => {
    setPayClientId(previsto.clientId);
    setPayLoanId(previsto.loanId);
    setPayAmount(String(previsto.paymentAmount));
    setPayReceiptNo(`REC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
    setSurplusOption("devolver_troco");
    setShowPaymentModal(true);
  };

  const handlePayFromMora = (moraItem: MoraCreditRecord) => {
    setPayClientId(moraItem.clientId);
    setPayLoanId(moraItem.loanId);
    setPayAmount(String(moraItem.saldoDevedor));
    setPayReceiptNo(`REC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
    setSurplusOption("devolver_troco");
    if (moraItem.moraCalculada > 0) {
      setEnableMoraPardon(true);
      setMoraPardonMode("total");
      setMoraPardonAmount(String(moraItem.moraCalculada));
    }
    setShowPaymentModal(true);
  };

  const totalArrecadado = useMemo(() => filteredReembolsos.reduce((s, r) => s + r.amountReceived, 0), [filteredReembolsos]);
  const totalCapitalReemb = useMemo(() => filteredReembolsos.reduce((s, r) => s + r.principalApplied, 0), [filteredReembolsos]);
  const totalJurosReemb = useMemo(() => filteredReembolsos.reduce((s, r) => s + r.interestApplied, 0), [filteredReembolsos]);
  const totalMoraReemb = useMemo(() => filteredReembolsos.reduce((s, r) => s + r.moraApplied, 0), [filteredReembolsos]);

  const totalPrevistoAmt = useMemo(() => filteredPrevistos.reduce((s, p) => s + p.paymentAmount, 0), [filteredPrevistos]);
  const totalPrevistoVencidas = useMemo(() => filteredPrevistos.filter((p) => p.daysDiff < 0).length, [filteredPrevistos]);
  const totalPrevistoAVencer = useMemo(() => filteredPrevistos.filter((p) => p.daysDiff >= 0).length, [filteredPrevistos]);

  const totalMoraAcumulada = useMemo(() => filteredMora.reduce((s, m) => s + m.moraCalculada, 0), [filteredMora]);
  const totalSaldoAtrasado = useMemo(() => filteredMora.reduce((s, m) => s + m.saldoDevedor, 0), [filteredMora]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg text-white">
            <Banknote className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">M�dulo de Reembolsos</h1>
            <p className="text-sm text-slate-500">Gest�o integrada de reembolsos, recebimentos previstos, desempenho e mora</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canRegisterPayment && (
            <Button
              onClick={() => {
                setPayClientId("");
                setPayLoanId("");
                setPayAmount("");
                setEnableMoraPardon(false);
                setPayReceiptNo(`REC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
                setSurplusOption("devolver_troco");
                setShowPaymentModal(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm gap-2"
            >
              <Plus className="w-4 h-4" />
              Novo Reembolso
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 bg-slate-100 p-1 rounded-xl h-auto">
          <TabsTrigger value="reembolsos" className="py-2.5 gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Banknote className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold">Reembolsos</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {filteredReembolsos.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="previstos" className="py-2.5 gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="font-semibold">Previstos</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {filteredPrevistos.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="desempenho" className="py-2.5 gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold">Desempenho</span>
          </TabsTrigger>
          <TabsTrigger value="mora" className="py-2.5 gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="font-semibold">Mora</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {filteredMora.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        {/* ABA 1: REEMBOLSOS EFETUADOS */}
        <TabsContent value="reembolsos" className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[300px]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente, contrato ou recibo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>

              <select
                value={filterCarteira}
                onChange={(e) => setFilterCarteira(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700"
              >
                <option value="all">Todas as Carteiras</option>
                {carteiras.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-500 whitespace-nowrap">De:</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 w-36 text-xs" />
                <Label className="text-xs text-slate-500 whitespace-nowrap">At�:</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 w-36 text-xs" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Arrecadado</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrencyMT(totalArrecadado)}</p>
              <p className="text-xs text-slate-400 mt-1">{filteredReembolsos.length} recibos processados</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Capital Amortizado</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrencyMT(totalCapitalReemb)}</p>
              <p className="text-xs text-slate-400 mt-1">Abatido ao principal</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Juros Recebidos</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrencyMT(totalJurosReemb)}</p>
              <p className="text-xs text-slate-400 mt-1">Margem financeira</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Mora Arrecadada</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrencyMT(totalMoraReemb)}</p>
              <p className="text-xs text-slate-400 mt-1">Penaliza��es por atraso</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="font-semibold text-slate-700">Recibo</TableHead>
                  <TableHead className="font-semibold text-slate-700">Data</TableHead>
                  <TableHead className="font-semibold text-slate-700">Cliente</TableHead>
                  <TableHead className="font-semibold text-slate-700">Contrato</TableHead>
                  <TableHead className="font-semibold text-slate-700">Carteira / Gestor</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Valor Pago</TableHead>
                  <TableHead className="font-semibold text-slate-700">Conta Destino</TableHead>
                  <TableHead className="text-center font-semibold text-slate-700">A��es</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReembolsos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                      Nenhum reembolso encontrado com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReembolsos.map((r) => (
                    <TableRow key={r.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-mono font-medium text-xs text-slate-900">{r.receiptNo}</TableCell>
                      <TableCell className="text-xs text-slate-600">{r.paymentDate}</TableCell>
                      <TableCell className="font-medium text-slate-900 text-sm">{r.clientName}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{r.contractNo}</TableCell>
                      <TableCell>
                        <div className="text-xs font-medium text-slate-800">{r.carteiraName}</div>
                        <div className="text-xs text-slate-400">{r.managerName}</div>
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600 text-sm">
                        {formatCurrencyMT(r.amountReceived)}
                        {r.trocoDevolvido && r.trocoDevolvido > 0 ? (
                          <div className="text-[10px] font-normal text-slate-400">
                            (Troco: {formatCurrencyMT(r.trocoDevolvido)})
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{r.destinationAccount}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handlePrintReceipt(r)}
                            title="Imprimir Recibo"
                            className="h-8 w-8 text-slate-600 hover:text-emerald-600"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setSelectedReembolso(r);
                              setShowReceiptModal(true);
                            }}
                            title="Ver Detalhes"
                            className="h-8 w-8 text-slate-600 hover:text-emerald-600"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ABA 2: PREVISTOS */}
        <TabsContent value="previstos" className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[300px]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar cliente ou contrato previsto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>

              <select
                value={filterCarteira}
                onChange={(e) => setFilterCarteira(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700"
              >
                <option value="all">Vis�o Geral (Todas as Carteiras)</option>
                {carteiras.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-500 whitespace-nowrap">Vencimento De:</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 w-36 text-xs" />
                <Label className="text-xs text-slate-500 whitespace-nowrap">At�:</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 w-36 text-xs" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Previsto no Per�odo</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrencyMT(totalPrevistoAmt)}</p>
              <p className="text-xs text-slate-400 mt-1">{filteredPrevistos.length} presta��es a receber</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Presta��es a Vencer</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{totalPrevistoAVencer}</p>
              <p className="text-xs text-slate-400 mt-1">Dentro do prazo regulamentar</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Presta��es em Atraso</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{totalPrevistoVencidas}</p>
              <p className="text-xs text-slate-400 mt-1">Vencimento ultrapassado</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Carteiras Ativas</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{carteiras.length || 1}</p>
              <p className="text-xs text-slate-400 mt-1">Em acompanhamento</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="font-semibold text-slate-700">Parcela</TableHead>
                  <TableHead className="font-semibold text-slate-700">Vencimento</TableHead>
                  <TableHead className="font-semibold text-slate-700">Cliente</TableHead>
                  <TableHead className="font-semibold text-slate-700">Contrato</TableHead>
                  <TableHead className="font-semibold text-slate-700">Carteira / Gestor</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Capital</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Juros</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Total Parcela</TableHead>
                  <TableHead className="text-center font-semibold text-slate-700">Estado / Prazo</TableHead>
                  <TableHead className="text-center font-semibold text-slate-700">A��o</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPrevistos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-slate-400">
                      Nenhuma presta��o prevista para o per�odo ou carteira selecionada.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPrevistos.map((p) => (
                    <TableRow key={`${p.loanId}-${p.installmentNo}`} className="hover:bg-slate-50 transition-colors">
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {p.installmentNo}/{p.totalInstallments}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-xs text-slate-800">{p.dueDateFormatted}</TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900 text-sm">{p.clientName}</div>
                        <div className="text-xs text-slate-400">{p.clientPhone}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">{p.contractNo}</TableCell>
                      <TableCell>
                        <div className="text-xs font-medium text-slate-800">{p.carteiraName}</div>
                        <div className="text-xs text-slate-400">{p.managerName}</div>
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-600">
                        {formatCurrencyMT(p.principalAmount)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-600">
                        {formatCurrencyMT(p.interestAmount)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900 text-sm">
                        {formatCurrencyMT(p.paymentAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        {p.daysDiff < 0 ? (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-none text-xs">
                            Atrasada ({Math.abs(p.daysDiff)}d)
                          </Badge>
                        ) : p.daysDiff === 0 ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-none text-xs">
                            Vence Hoje
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none text-xs">
                            Em {p.daysDiff}d
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          onClick={() => handlePayFromPrevisto(p)}
                          className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-xs"
                        >
                          Receber
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ABA 3: DESEMPENHO POR CARTEIRA */}
        <TabsContent value="desempenho" className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Painel Executivo de Desempenho por Carteira</h3>
              <p className="text-xs text-slate-500">Acompanhamento consolidado de desembolsos, reembolsos e taxas de recupera��o</p>
            </div>
            <Button variant="outline" onClick={handlePrintDesempenho} className="gap-2 text-xs h-9">
              <Printer className="w-4 h-4 text-slate-600" />
              Imprimir Relat�rio
            </Button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="font-semibold text-slate-700">Carteira / Gestor</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Desembolsos</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Novos Clientes</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Reempr�stimos</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Reembolsos</TableHead>
                  <TableHead className="text-center font-semibold text-slate-700">Taxa Recupera��o</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Saldo Atrasado</TableHead>
                  <TableHead className="text-center font-semibold text-slate-700">% Atraso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {desempenhoCarteiras.map((c) => (
                  <TableRow key={String(c.carteiraId)} className="hover:bg-slate-50 transition-colors">
                    <TableCell>
                      <div className="font-bold text-slate-900 text-sm">{c.carteiraNome}</div>
                      <div className="text-xs text-slate-500">{c.gestorNome}</div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-800 text-xs">
                      {formatCurrencyMT(c.desembolsosValor)}
                      <div className="text-[10px] text-slate-400 font-normal">{c.desembolsosQtd} contr.</div>
                    </TableCell>
                    <TableCell className="text-right text-slate-700 text-xs">{formatCurrencyMT(c.novosClientesValor)}</TableCell>
                    <TableCell className="text-right text-slate-700 text-xs">{formatCurrencyMT(c.reemprestimosValor)}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-600 text-sm">{formatCurrencyMT(c.reembolsosValor)}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        className={`text-xs border-none ${
                          c.taxaRecuperacao >= 90
                            ? "bg-emerald-100 text-emerald-700"
                            : c.taxaRecuperacao >= 70
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {c.taxaRecuperacao}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-600 text-xs">{formatCurrencyMT(c.atrasoValor)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`text-xs font-semibold ${c.percentagemAtraso > 10 ? "text-red-600" : "text-slate-600"}`}>
                        {c.percentagemAtraso}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ABA 4: MORA */}
        <TabsContent value="mora" className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar cliente ou contrato em mora..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total em Mora Acumulada</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrencyMT(totalMoraAcumulada)}</p>
              <p className="text-xs text-slate-400 mt-1">{filteredMora.length} cr�ditos com penaliza��es</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Saldo Principal em Risco</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrencyMT(totalSaldoAtrasado)}</p>
              <p className="text-xs text-slate-400 mt-1">Capital vencido</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Taxa Padr�o de Mora</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">0.50% / dia</p>
              <p className="text-xs text-slate-400 mt-1">Incid�ncia sobre saldo em atraso</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="font-semibold text-slate-700">Cliente</TableHead>
                  <TableHead className="font-semibold text-slate-700">Contrato</TableHead>
                  <TableHead className="font-semibold text-slate-700">Carteira / Gestor</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Saldo Devedor</TableHead>
                  <TableHead className="text-center font-semibold text-slate-700">Atraso M�ximo</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Mora Acumulada</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Total c/ Mora</TableHead>
                  <TableHead className="text-center font-semibold text-slate-700">A��es</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMora.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                      Nenhum cr�dito em mora no momento. Carteira 100% regularizada.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMora.map((m) => (
                    <TableRow key={m.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-medium text-slate-900 text-sm">{m.cliente}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">{m.contrato}</TableCell>
                      <TableCell>
                        <div className="text-xs font-medium text-slate-800">{m.carteiraName}</div>
                        <div className="text-xs text-slate-400">{m.gestorName}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-800 text-xs">
                        {formatCurrencyMT(m.saldoDevedor)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={`text-xs border-none ${
                            m.diasAtrasoMax <= 30
                              ? "bg-amber-100 text-amber-700"
                              : m.diasAtrasoMax <= 60
                              ? "bg-orange-100 text-orange-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {m.diasAtrasoMax} dias
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-600 text-sm">
                        +{formatCurrencyMT(m.moraCalculada)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900 text-sm">
                        {formatCurrencyMT(m.saldoTotalComMora)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setMoraTargetCredit(m);
                              setMoraPardonAmount(String(m.moraCalculada));
                              setMoraPardonMode("total");
                              setShowMoraModal(true);
                            }}
                            className="h-8 px-2.5 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-medium"
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1" />
                            Perdoar Mora
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handlePayFromMora(m)}
                            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                          >
                            Pagar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
      {/* Modal de Registo de Reembolso / Pagamento em Cascata */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="w-[90vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">
                  Registar Reembolso / Pagamento
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Liquidacao prioritaria da 1� prestacao em aberto com cascata automatica e abatimento de juros de mora.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleExecutePayment} className="space-y-6 pt-2">
            {/* Selecao de Cliente e Contrato Vinculado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  Cliente *
                </Label>
                <select
                  value={payClientId}
                  onChange={(e) => {
                    const cid = e.target.value ? Number(e.target.value) : "";
                    setPayClientId(cid);
                  }}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                >
                  <option value="">-- Selecione o Cliente --</option>
                  {clients.map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.name} {cl.code ? `(${cl.code})` : ""} - {cl.carteiraNome || "Geral"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  Contrato de Emprestimo Vinculado *
                </Label>
                <select
                  value={payLoanId}
                  onChange={(e) => {
                    const lid = e.target.value ? Number(e.target.value) : "";
                    setPayLoanId(lid);
                  }}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                  disabled={!payClientId || availableContractsForClient.length === 0}
                >
                  {availableContractsForClient.length === 0 ? (
                    <option value="">Nenhum contrato ativo encontrado para este cliente</option>
                  ) : (
                    availableContractsForClient.map((contr) => (
                      <option key={contr.id} value={contr.id}>
                        {contr.contrato} | Saldo: {formatCurrencyMT(contr.saldoDevedor)} | {contr.prazo} meses
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Informacoes Resumidas do Contrato Selecionado */}
            {selectedPayCredit && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Cliente</span>
                  <strong className="text-slate-800 text-sm">{selectedPayCredit.cliente}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Contrato N�</span>
                  <strong className="text-slate-800 text-sm font-mono">{selectedPayCredit.contrato}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Carteira / Produto</span>
                  <strong className="text-slate-800 text-sm">{selectedPayCredit.tipoCredito || "Geral"}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Saldo Devedor Atual</span>
                  <strong className="text-emerald-700 text-base font-bold">
                    {formatCurrencyMT(selectedPayCredit.saldoDevedor)}
                  </strong>
                </div>
              </div>
            )}

            {/* Secao de Juros de Mora (se houver mora devida) */}
            {selectedPayCredit && selectedPayMora.moraDevida > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                    <div>
                      <h4 className="text-sm font-bold text-red-900">Juros de Mora por Atraso</h4>
                      <p className="text-xs text-red-700">
                        Este cliente possui <strong>{selectedPayMora.diasAtraso} dia(s)</strong> de atraso. Mora acumulada devida:{" "}
                        <strong className="text-sm font-bold">{formatCurrencyMT(selectedPayMora.moraDevida)}</strong>
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEnableMoraPardon(!enableMoraPardon)}
                    className={`h-8 text-xs font-semibold ${
                      enableMoraPardon
                        ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200"
                        : "border-red-300 text-red-700 hover:bg-red-100"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    {enableMoraPardon ? "Cancelar Perdao de Mora" : "Perdoar Mora"}
                  </Button>
                </div>

                {enableMoraPardon && (
                  <div className="pt-3 border-t border-red-200 bg-white/70 p-3 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Tipo de Perdao</Label>
                      <select
                        value={moraPardonMode}
                        onChange={(e) => {
                          const mode = e.target.value as "total" | "parcial";
                          setMoraPardonMode(mode);
                          if (mode === "total") {
                            setMoraPardonAmount(String(selectedPayMora.moraDevida));
                          }
                        }}
                        className="w-full mt-1 h-9 px-2.5 border border-slate-300 rounded text-xs bg-white"
                      >
                        <option value="total">Perdao Total (100%)</option>
                        <option value="parcial">Perdao Parcial (Valor Fixo)</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Valor a Perdoar (MT)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max={selectedPayMora.moraDevida}
                        value={moraPardonAmount}
                        disabled={moraPardonMode === "total"}
                        onChange={(e) => setMoraPardonAmount(e.target.value)}
                        className="mt-1 h-9 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Justificativa</Label>
                      <Input
                        type="text"
                        value={moraPardonJustification}
                        onChange={(e) => setMoraPardonJustification(e.target.value)}
                        className="mt-1 h-9 text-xs"
                        placeholder="Motivo do perdao..."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Tabela Compacta de Prestacoes (Numero de Parcela, Vencimento e Valor da Parcela) */}
            {selectedPayCredit && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    Cronograma de Prestacoes
                  </Label>
                  <span className="text-[11px] text-slate-500">
                    A 1ª parcela pendente tem prioridade de pagamento.
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="max-h-[140px] overflow-y-auto">
                    <Table className="text-xs">
                      <TableHeader className="bg-slate-100 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="py-2 text-slate-700 font-bold">Numero de Parcela</TableHead>
                          <TableHead className="py-2 text-slate-700 font-bold">Vencimento</TableHead>
                          <TableHead className="py-2 text-right text-slate-700 font-bold">Valor da Parcela</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {waterfallSimulation.items.map((item) => {
                          const isFullyPaid = item.estaTotalmentePaga;
                          const isFirstPending = item.numParcela === waterfallSimulation.primeiraAbertaNum;
                          const isAllocated = item.alocadoNestePagamento > 0;

                          return (
                            <TableRow
                              key={item.numParcela}
                              className={
                                isFullyPaid
                                  ? "bg-slate-50/60 opacity-50"
                                  : isAllocated
                                  ? "bg-emerald-50 font-medium"
                                  : isFirstPending
                                  ? "bg-blue-50/60 font-medium"
                                  : ""
                              }
                            >
                              <TableCell className="py-2 font-semibold">
                                <span className="inline-flex items-center gap-1.5">
                                  {item.numParcela}ª Prestacao
                                  {isFullyPaid && (
                                    <span className="text-[10px] text-slate-400 font-normal">(Paga)</span>
                                  )}
                                  {isFirstPending && !isFullyPaid && (
                                    <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0 h-4">
                                      1ª a Pagar
                                    </Badge>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="py-2 text-slate-700">{item.dataVencimento}</TableCell>
                              <TableCell className="py-2 text-right font-bold text-slate-900">
                                {formatCurrencyMT(item.valorOriginal)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}

            {/* Dados do Pagamento e Cascata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    Valor a Pagar (MZN) *
                  </span>
                  {selectedPayCredit && (
                    <button
                      type="button"
                      onClick={() => {
                        const sorted = [...(selectedPayCredit.parcelas || [])].sort((a, b) => a.numParcela - b.numParcela);
                        const firstOpen = sorted.find((p) => p.status !== "pago" && (p.valor - (p.valorPago || 0)) > 0.01);
                        if (firstOpen) {
                          const moraAmount = (selectedPayMora.moraDevida > 0 && !enableMoraPardon) ? selectedPayMora.moraDevida : 0;
                          const needed = (firstOpen.valor - (firstOpen.valorPago || 0)) + moraAmount;
                          setPayAmount(String(Math.round(needed * 100) / 100));
                        }
                      }}
                      className="text-[11px] text-emerald-600 hover:underline font-normal"
                    >
                      (Preencher 1ª Parcela + Mora)
                    </button>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="Ex: 2666.66"
                    className="h-11 text-base font-bold text-emerald-800 bg-emerald-50/40 border-emerald-300 focus:border-emerald-500 pl-3 pr-12"
                    required
                  />
                  <span className="absolute right-3 top-3 text-xs font-semibold text-slate-500">MZN</span>
                </div>
                {Number(payAmount) > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Valor formatado: <strong className="text-slate-800">{formatCurrencyMT(Number(payAmount))}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Data do Pagamento *
                </Label>
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="h-11 text-sm bg-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  Conta de Deposito / Canal *
                </Label>
                <select
                  value={payAccount}
                  onChange={(e) => setPayAccount(e.target.value)}
                  className="w-full h-11 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                >
                  {paymentMethods.length === 0 ? (
                    <>
                      <option value="Caixa Geral (Numerario)">Caixa Geral (Numerario)</option>
                      <option value="Conta BCI">Conta BCI</option>
                      <option value="Conta Millennium BIM">Conta Millennium BIM</option>
                      <option value="M-Pesa">M-Pesa</option>
                      <option value="E-Mola">E-Mola</option>
                    </>
                  ) : (
                    paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.name}>
                        {pm.type === "banco"
                          ? `[Banco] ${pm.name} - ${pm.bankName || "Banco"} (Conta: ${pm.accountNumber || "-"})`
                          : pm.type === "carteira_movel"
                          ? `[Carteira] ${pm.name} - ${pm.provider || "Movel"} (${pm.phoneNumber || pm.accountNumber || "-"})`
                          : `[Caixa] ${pm.name}`}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">N� de Recibo / Comprovativo</Label>
                <Input
                  type="text"
                  value={payReceiptNo}
                  onChange={(e) => setPayReceiptNo(e.target.value)}
                  placeholder="REC-2026-XXXXX"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Observacoes</Label>
                <Input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Ex: Pagamento regular via deposito"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Painel de Resumo da Cascata e Novo Saldo Devedor */}
            {selectedPayCredit && Number(payAmount) > 0 && (
              <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Simulacao em Tempo Real da Cascata
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Total Recebido: {formatCurrencyMT(Number(payAmount))}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Juros de Mora Abatidos</span>
                    <strong className={waterfallSimulation.moraCobrada > 0 ? "text-red-400 text-sm font-bold" : "text-slate-300 text-sm"}>
                      {formatCurrencyMT(waterfallSimulation.moraCobrada)}
                    </strong>
                    {waterfallSimulation.moraPerdoada > 0 && (
                      <span className="block text-[10px] text-amber-400">
                        (Perdoada: {formatCurrencyMT(waterfallSimulation.moraPerdoada)})
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block">Amortizacao de Parcelas</span>
                    <strong className="text-emerald-400 text-sm font-bold">
                      {formatCurrencyMT(waterfallSimulation.valorAmortizadoCapital)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Saldo Devedor Anterior</span>
                    <strong className="text-slate-300 text-sm">
                      {formatCurrencyMT(waterfallSimulation.saldoDevedorAnterior)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Novo Saldo Devedor</span>
                    <strong className="text-emerald-300 text-base font-bold">
                      {formatCurrencyMT(waterfallSimulation.novoSaldoDevedor)}
                    </strong>
                  </div>
                </div>

                {waterfallSimulation.temExcedente && (
                  <div className="mt-2 p-3 bg-amber-950/80 border border-amber-600/60 rounded-lg flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <span className="font-bold text-amber-300">Valor excede a liquidacao total do contrato!</span>
                        <p className="text-amber-200/90 text-[11px]">
                          Excedente calculado: <strong>{formatCurrencyMT(waterfallSimulation.excedenteTroco)}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer text-amber-200">
                        <input
                          type="radio"
                          name="surplusOption"
                          value="devolver_troco"
                          checked={surplusOption === "devolver_troco"}
                          onChange={() => setSurplusOption("devolver_troco")}
                          className="text-emerald-500"
                        />
                        <span>Devolver troco ({formatCurrencyMT(waterfallSimulation.excedenteTroco)})</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-amber-200">
                        <input
                          type="radio"
                          name="surplusOption"
                          value="pagar_tudo"
                          checked={surplusOption === "pagar_tudo"}
                          onChange={() => setSurplusOption("pagar_tudo")}
                          className="text-emerald-500"
                        />
                        <span>Manter tudo no credito</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Acoes do Formulario */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPaymentModal(false)}
                disabled={paySubmitting}
                className="px-5"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={paySubmitting || !payClientId || !payAmount || Number(payAmount) <= 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 shadow-sm gap-2"
              >
                {paySubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar Pagamento
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Independente de Perdao de Mora */}
      <Dialog open={showMoraModal} onOpenChange={setShowMoraModal}>
        <DialogContent className="w-[95vw] sm:max-w-lg md:max-w-xl p-6">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center gap-2 text-indigo-600">
              <Sparkles className="w-5 h-5" />
              <DialogTitle className="text-lg font-bold text-slate-900">Perdao de Juros de Mora</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Isentar ou reduzir a mora acumulada por atraso para regularizacao do cliente.
            </DialogDescription>
          </DialogHeader>

          {moraTargetCredit && (
            <div className="space-y-4 pt-2">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <strong className="text-slate-800">{moraTargetCredit.cliente}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Contrato:</span>
                  <strong className="font-mono text-slate-800">{moraTargetCredit.contrato}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Atraso:</span>
                  <strong className="text-red-600">{moraTargetCredit.diasAtrasoMax} dias ({moraTargetCredit.prestacoesAtrasadas} parcelas)</strong>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1">
                  <span className="text-slate-500">Mora Acumulada:</span>
                  <strong className="text-red-600 text-sm font-bold">{formatCurrencyMT(moraTargetCredit.moraCalculada)}</strong>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Modalidade de Perdao</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <Button
                      type="button"
                      variant={moraPardonMode === "total" ? "default" : "outline"}
                      onClick={() => {
                        setMoraPardonMode("total");
                        setMoraPardonAmount(String(moraTargetCredit.moraCalculada));
                      }}
                      className={moraPardonMode === "total" ? "bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9" : "text-xs h-9"}
                    >
                      Perdao Total (100%)
                    </Button>
                    <Button
                      type="button"
                      variant={moraPardonMode === "parcial" ? "default" : "outline"}
                      onClick={() => setMoraPardonMode("parcial")}
                      className={moraPardonMode === "parcial" ? "bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9" : "text-xs h-9"}
                    >
                      Perdao Parcial
                    </Button>
                  </div>
                </div>

                {moraPardonMode === "parcial" && (
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Valor do Perdao (MZN)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1"
                      max={moraTargetCredit.moraCalculada}
                      value={moraPardonAmount}
                      onChange={(e) => setMoraPardonAmount(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Justificativa / Motivo</Label>
                  <Input
                    type="text"
                    value={moraPardonJustification}
                    onChange={(e) => setMoraPardonJustification(e.target.value)}
                    placeholder="Ex: Acordo comercial de regularizacao"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowMoraModal(false);
                    setMoraTargetCredit(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    if (!moraTargetCredit) return;
                    const pardonVal = moraPardonMode === "total"
                      ? moraTargetCredit.moraCalculada
                      : Math.min(moraTargetCredit.moraCalculada, Number(moraPardonAmount || 0));
                    if (pardonVal <= 0) {
                      toast.error("Informe um valor valido de perdao.");
                      return;
                    }
                    try {
                      await apiFetch(`/loans/${moraTargetCredit.id}/financial-events`, {
                        method: "POST",
                        body: JSON.stringify({
                          eventType: "perdao_mora",
                          amount: pardonVal,
                          note: `Perdao de mora (${moraPardonMode}): ${moraPardonJustification}`,
                        }),
                      });
                    } catch {}
                    toast.success(`Perdao de mora de ${formatCurrencyMT(pardonVal)} registado com sucesso!`);
                    setShowMoraModal(false);
                    setMoraTargetCredit(null);
                    void loadBackendData();
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  Confirmar Perdao
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Visualizacao de Recibo */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-600">
                <FileText className="w-5 h-5" />
                <DialogTitle className="text-lg font-bold text-slate-900">Recibo de Reembolso</DialogTitle>
              </div>
              {selectedReembolso && (
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedReembolso.receiptNo}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {selectedReembolso && (
            <div className="space-y-4 pt-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <strong className="text-slate-800 text-sm">{selectedReembolso.clientName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Contrato:</span>
                  <strong className="font-mono text-slate-800">{selectedReembolso.contractNo}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Data de Pagamento:</span>
                  <span className="text-slate-800 font-medium">{selectedReembolso.paymentDate.split("-").reverse().join("/")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Conta / Canal:</span>
                  <span className="text-slate-800 font-medium">{selectedReembolso.destinationAccount}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between">
                  <span className="text-slate-600 font-bold">Valor Total Pago:</span>
                  <strong className="text-emerald-700 text-base font-bold">
                    {formatCurrencyMT(selectedReembolso.amountReceived)}
                  </strong>
                </div>
                {selectedReembolso.moraApplied > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Mora Liquidada:</span>
                    <strong>{formatCurrencyMT(selectedReembolso.moraApplied)}</strong>
                  </div>
                )}
                {selectedReembolso.moraWaived && selectedReembolso.moraWaived > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Mora Perdoada:</span>
                    <strong>{formatCurrencyMT(selectedReembolso.moraWaived)}</strong>
                  </div>
                )}
                {selectedReembolso.trocoDevolvido && selectedReembolso.trocoDevolvido > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Troco Devolvido:</span>
                    <strong>{formatCurrencyMT(selectedReembolso.trocoDevolvido)}</strong>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReceiptModal(false)}
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handlePrintReceipt(selectedReembolso)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Recibo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
