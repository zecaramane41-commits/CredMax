import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Users,
  Building2,
  UserCheck,
  Loader2,
  DollarSign,
  X,
  Briefcase,
  User,
  CreditCard,
  ShieldCheck,
  Percent,
  Layers,
  ChevronDown,
  Info,
  Tag,
  PlusCircle,
  Trash2,
  Receipt,
  HelpCircle,
  Calendar,
  CalendarDays,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { fetchClients, type ClientSummary } from "../../lib/clients";
import { listCarteiras, type Carteira } from "../../lib/carteiras";
import { fetchCompanyCharges, fetchApprovalPolicy, type CompanyCharge, type ApprovalPolicy } from "../../lib/charges";
import { formatCurrencyMT } from "../../lib/format";
import { toast } from "sonner";
import { loadStoredAbates } from "../../pages/operations/AbatesPage";
import {
  generateInstallmentSchedule,
  calculateFinancialSummary,
  DIAS_SEMANA_NOMES,
  DIAS_UTEIS_PADRAO,
  DIAS_SEG_SAB,
  DIAS_TODOS,
  DIAS_ALTERNADOS,
} from "../../lib/installments";
import type { PedidoFormData, GroupMemberAllocation, Frequency } from "../../../../shared/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PedidoFormData) => Promise<void>;
};

export default function NovoPedidoModal({ open, onOpenChange, onSubmit }: Props) {
  // Dados Mestres
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [carteiras, setCarteiras] = useState<Carteira[]>([]);
  const [availableCharges, setAvailableCharges] = useState<CompanyCharge[]>([]);
  const [companyPolicy, setCompanyPolicy] = useState<ApprovalPolicy | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Seleção de Cliente e Carteira
  const [newClienteId, setNewClienteId] = useState<number | "">("");
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [newCarteiraId, setNewCarteiraId] = useState<number | "">("");
  const [newGestorName, setNewGestorName] = useState("");
  const [newGestorUserId, setNewGestorUserId] = useState<number | null>(null);

  // Parâmetros do Crédito
  const [newTipoCredito, setNewTipoCredito] = useState("Consumo");
  const [newPrazo, setNewPrazo] = useState(1);
  const [newTaxa, setNewTaxa] = useState(30);
  const [newFrequencia, setNewFrequencia] = useState<Frequency>("monthly");
  const [newPaymentDays, setNewPaymentDays] = useState<number[]>(DIAS_UTEIS_PADRAO);
  const [showParcelasTable, setShowParcelasTable] = useState(false);
  const [newMetodoAmortizacao, setNewMetodoAmortizacao] = useState("price");
  const [newComissaoAbertura, setNewComissaoAbertura] = useState("isento");
  const [newMesReferencia, setNewMesReferencia] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [newReemprestimo, setNewReemprestimo] = useState(false);

  // Montante e Grupos
  const [newValorManual, setNewValorManual] = useState("");
  const [newIsGrupo, setNewIsGrupo] = useState(false);
  const [newMembros, setNewMembros] = useState<GroupMemberAllocation[]>([]);

  // Custos Administrativos e Encargos (Abatidos no Desembolso)
  const [newApplyCustosAdmin, setNewApplyCustosAdmin] = useState(true);
  const [newTaxaCustosAdmin, setNewTaxaCustosAdmin] = useState(2);
  const [selectedCharges, setSelectedCharges] = useState<Array<{ chargeId?: number; name: string; type: string; value: number }>>([]);
  const [showAddChargeInput, setShowAddChargeInput] = useState(false);
  const [customChargeName, setCustomChargeName] = useState("");
  const [customChargeValue, setCustomChargeValue] = useState("");

  // Dados de Desembolso
  const [newFormaDesembolso, setNewFormaDesembolso] = useState("mpesa");
  const [newDadosDesembolso, setNewDadosDesembolso] = useState("");

  // Garantias e Avalista
  const [newAvalistaNome, setNewAvalistaNome] = useState("");
  const [newAvalistaTelefone, setNewAvalistaTelefone] = useState("");
  const [newAvalistaNuit, setNewAvalistaNuit] = useState("");
  const [newGarantiaDescricao, setNewGarantiaDescricao] = useState("");
  const [newGarantiaValor, setNewGarantiaValor] = useState("");
  const [newObservacoes, setNewObservacoes] = useState("");

  // Controle de submissão
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Carrega Clientes, Carteiras, Encargos e Políticas ao abrir o Modal
  useEffect(() => {
    if (!open) return;
    let ignore = false;
    setLoadingInitial(true);

    Promise.all([
      fetchClients().catch(() => []),
      listCarteiras().then((r) => r.carteiras || []).catch(() => []),
      fetchCompanyCharges().catch(() => []),
      fetchApprovalPolicy().catch(() => null),
    ])
      .then(([clientList, carteiraList, chargesList, policyData]) => {
        if (!ignore) {
          setClients(clientList);
          setCarteiras(carteiraList);
          setAvailableCharges(chargesList.filter((c) => c.isActive));
          setCompanyPolicy(policyData);
          if (policyData) {
            if (policyData.defaultInterestRate) setNewTaxa(policyData.defaultInterestRate);
            if (policyData.defaultAdministrativeFeeRate) setNewTaxaCustosAdmin(policyData.defaultAdministrativeFeeRate);
          }
          // Pré-seleciona encargos obrigatórios
          const required = chargesList.filter((c) => c.isActive && c.isRequired);
          if (required.length > 0) {
            setSelectedCharges(
              required.map((c) => ({
                chargeId: c.id,
                name: c.name,
                type: c.type,
                value: Number(c.defaultValue || 0),
              })),
            );
          }
          setLoadingInitial(false);
        }
      })
      .catch(() => setLoadingInitial(false));

    return () => {
      ignore = true;
    };
  }, [open]);

  // Reset de estado ao abrir
  useEffect(() => {
    if (open) {
      setNewClienteId("");
      setClientSearch("");
      setNewCarteiraId("");
      setNewGestorName("");
      setNewGestorUserId(null);
      setNewTipoCredito("Consumo");
      setNewPrazo(1);
      setNewTaxa(companyPolicy?.defaultInterestRate || 30);
      setNewFrequencia("monthly");
      setNewPaymentDays(DIAS_UTEIS_PADRAO);
      setShowParcelasTable(false);
      setNewMetodoAmortizacao("price");
      setNewComissaoAbertura("isento");
      setNewValorManual("");
      setNewMembros([]);
      setNewIsGrupo(false);
      setNewReemprestimo(false);
      setNewApplyCustosAdmin(true);
      setNewTaxaCustosAdmin(companyPolicy?.defaultAdministrativeFeeRate || 2);
      setSelectedCharges([]);
      setShowAddChargeInput(false);
      setCustomChargeName("");
      setCustomChargeValue("");
      setNewFormaDesembolso("mpesa");
      setNewDadosDesembolso("");
      setNewAvalistaNome("");
      setNewAvalistaTelefone("");
      setNewAvalistaNuit("");
      setNewGarantiaDescricao("");
      setNewGarantiaValor("");
      setNewObservacoes("");
      setSubmitting(false);
      setError("");
      const now = new Date();
      setNewMesReferencia(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    }
  }, [open]);

  // Cliente selecionado
  const selectedClient = useMemo(() => {
    if (!newClienteId) return null;
    return clients.find((c) => c.id === newClienteId) || null;
  }, [newClienteId, clients]);

  // Verifica se o cliente possui histórico de crédito anteriormente abatido por perda
  const abatedRecord = useMemo(() => {
    if (!selectedClient) return null;
    const abates = loadStoredAbates();
    return abates.find((a) => a.clientId === selectedClient.id && a.status === "abatido") || null;
  }, [selectedClient]);

  // Quando o cliente é selecionado, sincroniza carteira, gestor, histórico (novo vs reempréstimo) e grupo
  useEffect(() => {
    if (!selectedClient) {
      setNewCarteiraId("");
      setNewGestorName("");
      setNewGestorUserId(null);
      setNewIsGrupo(false);
      setNewMembros([]);
      setNewReemprestimo(false);
      return;
    }

    // Separa novos dos antigos automaticamente:
    // Se o cliente já tem empréstimos anteriores concedidos/liquidados, marca "Reempréstimo" automaticamente
    const hasPriorLoans = Boolean((selectedClient.loans && selectedClient.loans > 0) || (selectedClient.debt && selectedClient.debt > 0));
    setNewReemprestimo(hasPriorLoans);

    // Identifica e preenche a Carteira e o Gestor que gere o cliente
    const cId = selectedClient.carteiraId || "";
    setNewCarteiraId(cId);

    const matchedCarteira = carteiras.find((cart) => cart.id === selectedClient.carteiraId);
    if (matchedCarteira) {
      setNewGestorName(matchedCarteira.gestor_name || matchedCarteira.gestor_user_name || "");
      setNewGestorUserId(matchedCarteira.gestor_user_id || null);
    } else if (selectedClient.gestorName) {
      setNewGestorName(selectedClient.gestorName);
      setNewGestorUserId(selectedClient.gestorUserId || null);
    } else {
      setNewGestorName("");
      setNewGestorUserId(null);
    }

    // Auto-preenche contacto de desembolso com o telefone do cliente
    if (selectedClient.phone && !newDadosDesembolso) {
      setNewDadosDesembolso(selectedClient.phone);
    }

    // Se for grupo, popula membros
    if (selectedClient.type === "grupo") {
      setNewIsGrupo(true);
      const members = (selectedClient as any).groupMembers;
      if (members && Array.isArray(members) && members.length > 0) {
        setNewMembros(
          members.map((m: any) => ({
            memberName: m.memberName || m.name || "Membro",
            amount: Number(m.allocationAmount || m.amount || 0),
          })),
        );
      } else {
        setNewMembros([
          { memberName: selectedClient.name || "Membro 1", amount: 0 },
          { memberName: "Membro 2", amount: 0 },
        ]);
      }
    } else {
      setNewIsGrupo(false);
      setNewMembros([]);
    }
  }, [selectedClient, carteiras]);

  // Quando a Carteira é alterada manualmente, sincroniza o Gestor correspondente
  const handleCarteiraChange = (cartId: number | "") => {
    setNewCarteiraId(cartId);
    if (!cartId) {
      setNewGestorName("");
      setNewGestorUserId(null);
      return;
    }
    const matched = carteiras.find((c) => c.id === cartId);
    if (matched) {
      setNewGestorName(matched.gestor_name || matched.gestor_user_name || "Gestor da Carteira");
      setNewGestorUserId(matched.gestor_user_id || null);
    }
  };

  const totalGrupo = useMemo(() => {
    return newMembros.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  }, [newMembros]);

  const valorFinal = newIsGrupo ? totalGrupo : Number(newValorManual) || 0;

  // Cálculos de Custos Administrativos e Encargos (Abatimento no Desembolso)
  const valorCustosAdmin = useMemo(() => {
    if (!newApplyCustosAdmin || valorFinal <= 0) return 0;
    return Number(((valorFinal * (newTaxaCustosAdmin || 2)) / 100).toFixed(2));
  }, [newApplyCustosAdmin, valorFinal, newTaxaCustosAdmin]);

  const totalEncargos = useMemo(() => {
    return selectedCharges.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
  }, [selectedCharges]);

  const totalDescontosDesembolso = useMemo(() => {
    return valorCustosAdmin + totalEncargos;
  }, [valorCustosAdmin, totalEncargos]);

  const valorLiquidoDesembolso = useMemo(() => {
    return Math.max(0, Number((valorFinal - totalDescontosDesembolso).toFixed(2)));
  }, [valorFinal, totalDescontosDesembolso]);

  // Cálculo financeiro oficial (Tabela Price: prestação mensal exata, juros e total a pagar)
  const financialSummary = useMemo(() => {
    return calculateFinancialSummary(valorFinal, newPrazo, newTaxa, newMetodoAmortizacao);
  }, [valorFinal, newPrazo, newTaxa, newMetodoAmortizacao]);

  const valorJurosTotais = financialSummary.totalInterest;
  const totalAPagar = financialSummary.totalToPay;
  const prestacaoMensalBase = financialSummary.monthlyPayment;

  // A frequência incide sobre a PRESTAÇÃO TOTAL (Capital + Juros), dependendo do prazo selecionado
  const parcelasCalculadas = useMemo(() => {
    if (totalAPagar <= 0 || newPrazo <= 0) return [];
    return generateInstallmentSchedule(totalAPagar, newPrazo, newFrequencia, newPaymentDays);
  }, [totalAPagar, newPrazo, newFrequencia, newPaymentDays]);

  const valorPorParcela = useMemo(() => {
    if (parcelasCalculadas.length === 0) return 0;
    return parcelasCalculadas[0]?.valor || 0;
  }, [parcelasCalculadas]);

  // Gestão de seleção de encargos
  const handleToggleCharge = (charge: CompanyCharge) => {
    const existing = selectedCharges.find((c) => c.chargeId === charge.id);
    if (existing) {
      setSelectedCharges((prev) => prev.filter((c) => c.chargeId !== charge.id));
    } else {
      let initialVal = charge.defaultValue || 0;
      if (charge.type === "percentage" && valorFinal > 0) {
        initialVal = Number(((valorFinal * (charge.defaultValue || 0)) / 100).toFixed(2));
      }
      setSelectedCharges((prev) => [
        ...prev,
        {
          chargeId: charge.id,
          name: charge.name,
          type: charge.type,
          value: initialVal,
        },
      ]);
    }
  };

  const handleUpdateChargeValue = (index: number, val: number) => {
    setSelectedCharges((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], value: Math.max(0, val) };
      return updated;
    });
  };

  const handleRemoveCharge = (index: number) => {
    setSelectedCharges((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddCustomCharge = () => {
    if (!customChargeName.trim()) return;
    const val = Number(customChargeValue) || 0;
    setSelectedCharges((prev) => [
      ...prev,
      {
        name: customChargeName.trim(),
        type: "fixed",
        value: val,
      },
    ]);
    setCustomChargeName("");
    setCustomChargeValue("");
    setShowAddChargeInput(false);
  };

  const handleSubmit = async () => {
    if (!newClienteId || !selectedClient) {
      setError("Por favor selecione o cliente.");
      return;
    }

    if (valorFinal <= 0) {
      setError("O montante do crédito deve ser maior que zero.");
      return;
    }

    if (newIsGrupo && newMembros.length < 2) {
      setError("Um crédito de grupo deve ter pelo menos 2 membros cadastrados.");
      return;
    }

    setSubmitting(true);
    setError("");

    const selectedCart = carteiras.find((c) => c.id === newCarteiraId);

    try {
      await onSubmit({
        clienteId: selectedClient.id,
        cliente: selectedClient.name,
        clienteType: selectedClient.type,
        tipoCredito: newTipoCredito,
        prazo: Number(newPrazo || 1),
        taxa: Number(newTaxa || 30),
        frequencia: newFrequencia,
        paymentDaysOfWeek: (newFrequencia === "daily" || newFrequencia === "custom_days") ? newPaymentDays : undefined,
        installments: parcelasCalculadas,
        mesReferencia: newMesReferencia,
        reemprestimo: newReemprestimo,
        isGrupo: newIsGrupo,
        membros: newIsGrupo ? [...newMembros] : [],
        valor: valorFinal,
        carteiraId: newCarteiraId ? Number(newCarteiraId) : undefined,
        carteiraNome: selectedCart?.name || selectedClient.carteiraNome || undefined,
        gestorUserId: newGestorUserId || undefined,
        gestorName: newGestorName || undefined,
        finalidade: newTipoCredito,
        metodoAmortizacao: newMetodoAmortizacao,
        comissaoAbertura: newComissaoAbertura,
        // Custos Administrativos e Encargos
        administrativeFeeMode: newApplyCustosAdmin ? "aplicar" : "isento",
        administrativeFeeRate: newTaxaCustosAdmin,
        administrativeFeeAmount: valorCustosAdmin,
        charges: selectedCharges,
        totalChargesAmount: totalEncargos,
        disbursementNetAmount: valorLiquidoDesembolso,
        formaDesembolso: newFormaDesembolso,
        dadosDesembolso: newDadosDesembolso,
        avalistaNome: newAvalistaNome || undefined,
        avalistaTelefone: newAvalistaTelefone || undefined,
        avalistaNuit: newAvalistaNuit || undefined,
        garantiaDescricao: newGarantiaDescricao || undefined,
        garantiaValor: Number(newGarantiaValor) || undefined,
        observacoes: newObservacoes || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao submeter o pedido de crédito.");
    } finally {
      setSubmitting(false);
    }
  };

  const getClientTypeIcon = (type: string) => {
    if (type === "singular") return <UserCheck className="w-4 h-4 text-blue-600" />;
    if (type === "grupo") return <Users className="w-4 h-4 text-purple-600" />;
    return <Building2 className="w-4 h-4 text-emerald-600" />;
  };

  const getClientTypeLabel = (type: string) => {
    if (type === "singular") return "Singular / Individual";
    if (type === "grupo") return "Grupo Solidário";
    return "Empresa / Pessoa Coletiva";
  };

  const getClientTypeBadgeColor = (type: string) => {
    if (type === "singular") return "bg-blue-50 text-blue-700 border-blue-200";
    if (type === "grupo") return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/40 sticky top-0 z-20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-slate-900">
              <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                <DollarSign className="w-5 h-5" />
              </div>
              Novo Pedido de Crédito
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Preencha a proposta de crédito vinculando o cliente, a carteira e o gestor responsável.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6">
          {/* Mensagem de Erro */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2.5 shadow-sm">
              <X className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="font-semibold">Erro ao submeter pedido</p>
                <p className="text-xs mt-0.5 text-red-600">{error}</p>
              </div>
            </div>
          )}

          {loadingInitial && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span>A carregar clientes e carteiras do sistema...</span>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              BLOCO 1: IDENTIFICAÇÃO DO CLIENTE, CARTEIRA E GESTOR
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-semibold text-sm">
              <User className="w-4 h-4 text-indigo-600" />
              1. Identificação, Carteira e Gestor Responsável
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Seleção do Cliente */}
              <div className="md:col-span-6 relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cliente <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={
                      selectedClient
                        ? `${selectedClient.name} (${getClientTypeLabel(selectedClient.type)})`
                        : clientSearch
                    }
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setNewClienteId("");
                      setShowClientDropdown(true);
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    onBlur={() => setTimeout(() => setShowClientDropdown(false), 250)}
                    placeholder="Pesquise por nome, NUIT ou telefone..."
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  {showClientDropdown && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {(clientSearch
                        ? clients.filter(
                            (c) =>
                              c.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                              c.nuit?.includes(clientSearch) ||
                              c.phone?.includes(clientSearch),
                          )
                        : clients
                      ).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => {
                            setNewClienteId(c.id);
                            setClientSearch(c.name);
                            setShowClientDropdown(false);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2 ${
                            newClienteId === c.id ? "bg-indigo-50/80 font-medium" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            {getClientTypeIcon(c.type)}
                            <div>
                              <p className="text-sm text-slate-800 font-medium leading-tight">{c.name}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                NUIT: {c.nuit || "—"} • Tel: {c.phone || "—"}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${getClientTypeBadgeColor(
                              c.type,
                            )}`}
                          >
                            {c.type === "singular" ? "Singular" : c.type === "grupo" ? "Grupo" : "Empresa"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedClient && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${getClientTypeBadgeColor(
                        selectedClient.type,
                      )}`}
                    >
                      {getClientTypeIcon(selectedClient.type)}
                      {getClientTypeLabel(selectedClient.type)}
                    </span>
                    <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                      Score: <b className="text-indigo-700">{selectedClient.score || 700} pts</b>
                    </span>
                    {selectedClient.occupation && (
                      <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full truncate max-w-[200px]">
                        {selectedClient.occupation}
                      </span>
                    )}
                  </div>
                )}

                {/* ALERTA DE CLIENTE COM HISTÓRICO DE ABATE POR PERDA */}
                {abatedRecord && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-red-700 font-bold">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>⚠️ Alerta de Risco: Cliente com Histórico de Abate por Perda</span>
                    </div>
                    <p className="text-red-900 leading-relaxed">
                      Este cliente possui o Contrato <strong>{abatedRecord.contractNo}</strong> abatido por perda no valor de{" "}
                      <strong>{formatCurrencyMT(abatedRecord.amountAbated)}</strong> (Motivo: {abatedRecord.reasonCategory}).
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setNewValor(String(abatedRecord.amountAbated));
                          setNewReemprestimo(true);
                          toast.info(`Montante ajustado para o saldo abatido de ${formatCurrencyMT(abatedRecord.amountAbated)} para refinanciamento.`);
                        }}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-[11px] transition-colors"
                      >
                        Reabrir e Refinanciar Saldo Abatido ({formatCurrencyMT(abatedRecord.amountAbated)})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewClienteId("");
                          setClientSearch("");
                          toast.warning("Seleção do cliente cancelada devido ao histórico restritivo.");
                        }}
                        className="px-2.5 py-1 bg-white border border-red-300 text-red-700 hover:bg-red-100 rounded-lg font-medium text-[11px] transition-colors"
                      >
                        Bloquear Concessão
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Carteira do Cliente */}
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Carteira do Crédito
                </label>
                <div className="relative">
                  <select
                    value={newCarteiraId}
                    onChange={(e) => handleCarteiraChange(e.target.value ? Number(e.target.value) : "")}
                    className="w-full h-10 px-3 pr-8 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
                  >
                    <option value="">-- Selecione a Carteira --</option>
                    {carteiras.map((cart) => (
                      <option key={cart.id} value={cart.id}>
                        {cart.name} ({cart.code})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {selectedClient?.carteiraNome
                    ? `Carteira padrão: ${selectedClient.carteiraNome}`
                    : "Atribuição da carteira de crédito"}
                </p>
              </div>

              {/* Gestor Responsável */}
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gestor Responsável (Carteira)
                </label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={newGestorName || "Gestor Automático"}
                    readOnly
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium cursor-not-allowed"
                  />
                </div>
                <p className="text-[11px] text-indigo-600 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Gestor que gere o cliente na carteira
                </p>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              BLOCO 2: CONDIÇÕES FINANCEIRAS & LINHA DE CRÉDITO
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-semibold text-sm">
              <Layers className="w-4 h-4 text-indigo-600" />
              2. Condições Financeiras e Linha de Crédito
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Linha de Crédito (Consumo ou Negócio) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Linha de Crédito <span className="text-red-500">*</span>
                </label>
                <select
                  value={newTipoCredito}
                  onChange={(e) => setNewTipoCredito(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="Consumo">Consumo</option>
                  <option value="Negócio">Negócio</option>
                </select>
              </div>

              {/* Mês de Referência */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mês de Referência</label>
                <input
                  type="month"
                  value={newMesReferencia}
                  onChange={(e) => setNewMesReferencia(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
                />
              </div>

              {/* Enquadramento Automático (Novo Cliente vs Reempréstimo) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enquadramento (Histórico do Cliente)
                </label>
                <div className="flex items-center justify-between h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                      newReemprestimo
                        ? "bg-purple-100 text-purple-700 border border-purple-200"
                        : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    {newReemprestimo ? "Reempréstimo (Histórico)" : "Cliente Novo"}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="reemp-modal"
                        checked={!newReemprestimo}
                        onChange={() => setNewReemprestimo(false)}
                        className="text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      Novo
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="reemp-modal"
                        checked={newReemprestimo}
                        onChange={() => setNewReemprestimo(true)}
                        className="text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      Reempréstimo
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
              {/* Prazo (Padrão 1 mês) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prazo (Meses) <span className="text-indigo-600 font-bold">(Padrão: 1)</span>
                </label>
                <input
                  type="number"
                  value={newPrazo}
                  onChange={(e) => setNewPrazo(Math.max(1, Number(e.target.value) || 1))}
                  min={1}
                  max={60}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Taxa de Juro */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Taxa Mensal (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={newTaxa}
                    onChange={(e) => setNewTaxa(Math.max(0, Number(e.target.value) || 0))}
                    min={0}
                    max={100}
                    step={0.1}
                    className="w-full h-10 px-3 pr-8 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  />
                  <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Frequência de Pagamento */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Frequência</label>
                <select
                  value={newFrequencia}
                  onChange={(e) => setNewFrequencia(e.target.value as Frequency)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="monthly">Mensal (1x por mês: {newPrazo} {newPrazo === 1 ? 'parcela' : 'parcelas'})</option>
                  <option value="biweekly">Quinzenal (2x por mês: {newPrazo * 2} parcelas)</option>
                  <option value="weekly">Semanal (4x por mês: {newPrazo * 4} parcelas)</option>
                  <option value="daily">Diário (Dias úteis / selecionados)</option>
                  <option value="custom_days">Dias Alternados (Dias selecionados)</option>
                </select>
              </div>

              {/* Método de Amortização */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amortização</label>
                <select
                  value={newMetodoAmortizacao}
                  onChange={(e) => setNewMetodoAmortizacao(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
                >
                  <option value="price">Tabela Price (Prestações Fixas)</option>
                  <option value="sac">SAC (Amortização Constante)</option>
                </select>
              </div>
            </div>

            {/* SELETOR INTERATIVO DE DIAS DA SEMANA PARA DIÁRIO OU DIAS ALTERNADOS */}
            {(newFrequencia === "daily" || newFrequencia === "custom_days") && (
              <div className="mt-2 p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Dias de Cobrança / Pagamento na Semana:
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {newPaymentDays.length} {newPaymentDays.length === 1 ? "dia" : "dias"} / semana
                    </span>
                  </div>

                  {/* Atalhos Rápidos de Seleção */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNewPaymentDays(DIAS_UTEIS_PADRAO)}
                      className={`text-[11px] px-2 py-1 rounded-md font-medium border transition-colors ${
                        JSON.stringify(newPaymentDays) === JSON.stringify(DIAS_UTEIS_PADRAO)
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Dias Úteis (Seg-Sex)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPaymentDays(DIAS_SEG_SAB)}
                      className={`text-[11px] px-2 py-1 rounded-md font-medium border transition-colors ${
                        JSON.stringify(newPaymentDays) === JSON.stringify(DIAS_SEG_SAB)
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Seg a Sáb
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPaymentDays(DIAS_ALTERNADOS)}
                      className={`text-[11px] px-2 py-1 rounded-md font-medium border transition-colors ${
                        JSON.stringify(newPaymentDays) === JSON.stringify(DIAS_ALTERNADOS)
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Dias Alternados (Seg/Qua/Sex)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPaymentDays(DIAS_TODOS)}
                      className={`text-[11px] px-2 py-1 rounded-md font-medium border transition-colors ${
                        JSON.stringify(newPaymentDays) === JSON.stringify(DIAS_TODOS)
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Todos (Dom-Sáb)
                    </button>
                  </div>
                </div>

                {/* Checkboxes de Domingo até Sábado */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-1">
                  {DIAS_SEMANA_NOMES.map((d) => {
                    const isChecked = newPaymentDays.includes(d.day);
                    return (
                      <label
                        key={d.day}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs font-semibold cursor-pointer select-none transition-all ${
                          isChecked
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-xs ring-1 ring-indigo-400"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate">{d.label}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setNewPaymentDays((prev) => {
                              if (prev.includes(d.day)) {
                                const next = prev.filter((x) => x !== d.day);
                                return next.length > 0 ? next : [d.day];
                              }
                              return [...prev, d.day].sort((a, b) => a - b);
                            });
                          }}
                          className="sr-only"
                        />
                        {isChecked && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              BLOCO 3: MONTANTE E ESPECIFICIDADES DO CLIENTE
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-semibold text-sm">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              3. Montante Solicitado e Dados Específicos
            </div>

            {/* SE FOR GRUPO SOLIDÁRIO */}
            {selectedClient?.type === "grupo" || newIsGrupo ? (
              <div className="border border-purple-200 bg-purple-50/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-purple-800 font-semibold text-sm">
                    <Users className="w-4 h-4" /> Distribuição de Cotas entre os Membros do Grupo
                  </div>
                  <span className="text-xs bg-purple-100 text-purple-700 font-medium px-2 py-0.5 rounded-full">
                    {newMembros.length} membro(s)
                  </span>
                </div>

                <div className="space-y-2">
                  {newMembros.map((m, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-purple-200">
                      <div className="md:col-span-6">
                        <label className="block text-[10px] font-semibold text-purple-700 mb-0.5">Nome do Membro {idx + 1}</label>
                        <input
                          type="text"
                          value={m.memberName}
                          onChange={(e) => {
                            const updated = [...newMembros];
                            updated[idx] = { ...updated[idx], memberName: e.target.value };
                            setNewMembros(updated);
                          }}
                          placeholder="Nome completo do membro"
                          className="w-full h-8 px-2.5 text-xs rounded border border-purple-200 focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-[10px] font-semibold text-purple-700 mb-0.5">Valor da Cota (MT)</label>
                        <input
                          type="number"
                          value={m.amount || ""}
                          onChange={(e) => {
                            const updated = [...newMembros];
                            updated[idx] = { ...updated[idx], amount: Number(e.target.value) || 0 };
                            setNewMembros(updated);
                          }}
                          placeholder="0.00"
                          className="w-full h-8 px-2.5 text-xs rounded border border-purple-200 focus:ring-1 focus:ring-purple-500 font-semibold text-purple-900"
                        />
                      </div>
                      <div className="md:col-span-2 flex items-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (newMembros.length > 2) {
                              setNewMembros(newMembros.filter((_, i) => i !== idx));
                            }
                          }}
                          disabled={newMembros.length <= 2}
                          className="w-full h-8 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-purple-200">
                  <button
                    type="button"
                    onClick={() => setNewMembros([...newMembros, { memberName: `Membro ${newMembros.length + 1}`, amount: 0 }])}
                    className="text-xs font-semibold text-purple-700 hover:text-purple-900 underline"
                  >
                    + Adicionar outro membro
                  </button>
                  <div className="text-sm font-bold text-purple-900">
                    Total Acumulado do Grupo: <span className="text-base">{formatCurrencyMT(totalGrupo)}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* SE FOR SINGULAR OU EMPRESA */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Montante Solicitado (MT) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newValorManual}
                      onChange={(e) => setNewValorManual(e.target.value)}
                      placeholder="Ex: 50000"
                      min={100}
                      className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-medium text-slate-400 absolute right-3 top-1/2 -translate-y-1/2">
                      MT
                    </span>
                  </div>
                </div>

                {/* Se Singular: Ocupação e Rendimento */}
                {selectedClient?.type === "singular" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Ocupação / Profissão</label>
                      <input
                        type="text"
                        defaultValue={selectedClient.occupation || ""}
                        placeholder="Ex: Funcionário Público / Comerciante"
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Rendimento Líquido Mensal</label>
                      <input
                        type="text"
                        value={formatCurrencyMT(selectedClient.monthlyIncome || 0)}
                        readOnly
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"
                      />
                    </div>
                  </>
                )}

                {/* Se Empresa: Sector e Representante */}
                {selectedClient?.type === "empresa" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Sector de Actividade</label>
                      <input
                        type="text"
                        defaultValue={selectedClient.businessSector || "Comércio / Serviços"}
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Comercial</label>
                      <input
                        type="text"
                        defaultValue={selectedClient.businessName || selectedClient.name}
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-slate-50"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* CRONOGRAMA REAL DE PARCELAS E PRESTAÇÃO TOTAL COM JUROS */}
            {valorFinal > 0 && (
              <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-3.5">
                {/* Resumo Financeiro Completo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pb-2 border-b border-indigo-200/80 text-xs">
                  <div className="p-2 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Capital Solicitado</span>
                    <span className="font-bold text-sm text-slate-900">{formatCurrencyMT(valorFinal)}</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Juros ({newTaxa}% x {newPrazo}m)
                    </span>
                    <span className="font-bold text-sm text-amber-600">+{formatCurrencyMT(valorJurosTotais)}</span>
                  </div>
                  <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-indigo-200 block">Total a Pagar</span>
                    <span className="font-extrabold text-sm text-white">{formatCurrencyMT(totalAPagar)}</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Prestação / Parcela
                    </span>
                    <span className="font-extrabold text-sm text-indigo-700">{formatCurrencyMT(valorPorParcela)}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-indigo-950">
                    <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900">
                        {parcelasCalculadas.length} {parcelasCalculadas.length === 1 ? "parcela" : "parcelas"}{" "}
                        ({newFrequencia === "monthly" ? "Mensais" : newFrequencia === "biweekly" ? "Quinzenais (2x/mês)" : newFrequencia === "weekly" ? "Semanais (4x/mês)" : "Diárias / Alternadas"})
                      </span>
                      <span className="text-slate-500 block text-[11px]">
                        Incidência sobre o total a pagar de {formatCurrencyMT(totalAPagar)} no prazo de {newPrazo} {newPrazo === 1 ? "mês" : "meses"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowParcelasTable(!showParcelasTable)}
                    className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-white hover:bg-indigo-100/70 border border-indigo-300 px-3 py-1.5 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 self-end sm:self-auto"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    {showParcelasTable ? "Ocultar Datas" : `Ver Calendário (${parcelasCalculadas.length} parcelas)`}
                  </button>
                </div>

                {/* Tabela de Vencimento de cada Parcela */}
                {showParcelasTable && parcelasCalculadas.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-indigo-200 max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-indigo-100/80 text-indigo-950 uppercase text-[10px] font-bold sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 rounded-l-md"># Parcela</th>
                          <th className="px-3 py-1.5">Data de Vencimento</th>
                          <th className="px-3 py-1.5 text-right rounded-r-md">Valor da Prestação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-100/70 bg-white">
                        {parcelasCalculadas.map((p) => (
                          <tr key={p.numParcela} className="hover:bg-indigo-50/50">
                            <td className="px-3 py-1.5 font-bold text-slate-700">
                              Parcela {p.numParcela} de {parcelasCalculadas.length}
                            </td>
                            <td className="px-3 py-1.5 text-slate-800 font-medium">
                              {p.dataVencimento}
                            </td>
                            <td className="px-3 py-1.5 text-right font-bold text-indigo-700">
                              {formatCurrencyMT(p.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              BLOCO 4: CUSTOS ADMINISTRATIVOS E ENCARGOS (ABATIDOS NO DESEMBOLSO)
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
                <Receipt className="w-4 h-4 text-indigo-600" />
                4. Custos Administrativos e Encargos (Abatimento no Desembolso)
              </div>
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Descontos diretos no desembolso
              </span>
            </div>

            {/* Pergunta: Aplicar Custos Administrativos? */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Aplicar Custos Administrativos?
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      Taxa Padrão: {newTaxaCustosAdmin}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Calcula automaticamente a percentagem sobre o capital bruto e abate no momento do desembolso.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="applyCustosAdmin"
                      checked={newApplyCustosAdmin}
                      onChange={() => setNewApplyCustosAdmin(true)}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Sim ({newTaxaCustosAdmin}%)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="applyCustosAdmin"
                      checked={!newApplyCustosAdmin}
                      onChange={() => setNewApplyCustosAdmin(false)}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Não (Isento)
                  </label>
                </div>
              </div>

              {newApplyCustosAdmin && valorFinal > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                  <span className="text-slate-600">
                    Custo Administrativo Calculado ({newTaxaCustosAdmin}% de {formatCurrencyMT(valorFinal)}):
                  </span>
                  <span className="font-bold text-indigo-700">
                    {formatCurrencyMT(valorCustosAdmin)}
                  </span>
                </div>
              )}
            </div>

            {/* Secção de Encargos */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-800">
                    Encargos Adicionais
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Selecione os encargos aplicáveis a este contrato para dedução no desembolso.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddChargeInput(!showAddChargeInput)}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  + Outro Encargo
                </button>
              </div>

              {/* Formulário para adicionar encargo customizado */}
              {showAddChargeInput && (
                <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
                  <div className="text-xs font-semibold text-indigo-900">Adicionar Encargo Específico</div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    <div className="md:col-span-7">
                      <input
                        type="text"
                        placeholder="Nome do encargo (ex: Taxa de Deslocação)"
                        value={customChargeName}
                        onChange={(e) => setCustomChargeName(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs rounded-lg border border-indigo-200 bg-white"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <input
                        type="number"
                        placeholder="Valor (MT)"
                        value={customChargeValue}
                        onChange={(e) => setCustomChargeValue(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs rounded-lg border border-indigo-200 bg-white font-semibold"
                      />
                    </div>
                    <div className="md:col-span-2 flex gap-1">
                      <button
                        type="button"
                        onClick={handleAddCustomCharge}
                        disabled={!customChargeName.trim()}
                        className="w-full h-8 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Inserir
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddChargeInput(false)}
                        className="px-2 h-8 bg-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Lista de Encargos Disponíveis do Administrador */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {availableCharges.map((charge) => {
                  const isSelected = selectedCharges.some((c) => c.chargeId === charge.id);
                  const selectedObj = selectedCharges.find((c) => c.chargeId === charge.id);
                  return (
                    <div
                      key={charge.id}
                      className={`p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-200"
                          : "bg-slate-50/70 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCharge(charge)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                          />
                          <span>{charge.name}</span>
                        </label>
                        <span className="text-[10px] text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">
                          {charge.type === "percentage" ? `${charge.defaultValue}%` : "Fixo"}
                        </span>
                      </div>

                      {/* Se selecionado, abre o campo de valor do encargo */}
                      {isSelected && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-600 font-medium">Valor do Encargo (MT):</span>
                          <input
                            type="number"
                            value={selectedObj ? selectedObj.value : ""}
                            onChange={(e) => {
                              const idx = selectedCharges.findIndex((c) => c.chargeId === charge.id);
                              if (idx !== -1) {
                                handleUpdateChargeValue(idx, Number(e.target.value) || 0);
                              }
                            }}
                            min={0}
                            step={10}
                            className="w-28 h-7 px-2 text-xs text-right font-bold text-slate-900 rounded border border-indigo-300 focus:ring-1 focus:ring-indigo-500 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Lista de Encargos Personalizados adicionados */}
              {selectedCharges.filter((c) => !c.chargeId).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-700">Encargos Personalizados:</div>
                  {selectedCharges
                    .map((c, i) => ({ ...c, originalIndex: i }))
                    .filter((c) => !c.chargeId)
                    .map((custom) => (
                      <div key={custom.originalIndex} className="flex items-center justify-between p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs">
                        <span className="font-semibold text-amber-900">{custom.name}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={custom.value}
                            onChange={(e) => handleUpdateChargeValue(custom.originalIndex, Number(e.target.value) || 0)}
                            className="w-24 h-7 px-2 text-xs text-right font-bold text-slate-900 rounded border border-amber-300 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveCharge(custom.originalIndex)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* QUADRO DE RESUMO FINANCEIRO DO DESEMBOLSO */}
            {valorFinal > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-md space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-300 border-b border-indigo-800/80 pb-2 flex items-center justify-between">
                  <span>Resumo Financeiro da Concessão</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Discriminado no Recibo
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* Capital Bruto */}
                  <div className="bg-white/5 p-2.5 rounded-lg border border-white/10">
                    <div className="text-slate-400 text-[11px] mb-0.5">Capital Solicitado (Bruto)</div>
                    <div className="text-base font-bold text-white">{formatCurrencyMT(valorFinal)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Base para cálculo de juros</div>
                  </div>

                  {/* Custos Administrativos */}
                  <div className="bg-white/5 p-2.5 rounded-lg border border-white/10">
                    <div className="text-amber-300 text-[11px] mb-0.5">(-) Custos Administrativos</div>
                    <div className="text-base font-bold text-amber-400">
                      - {formatCurrencyMT(valorCustosAdmin)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {newApplyCustosAdmin ? `Taxa de ${newTaxaCustosAdmin}%` : "Isento"}
                    </div>
                  </div>

                  {/* Encargos */}
                  <div className="bg-white/5 p-2.5 rounded-lg border border-white/10">
                    <div className="text-amber-300 text-[11px] mb-0.5">(-) Total de Encargos</div>
                    <div className="text-base font-bold text-amber-400">
                      - {formatCurrencyMT(totalEncargos)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {selectedCharges.length} encargo(s) selecionado(s)
                    </div>
                  </div>

                  {/* Valor Líquido a Desembolsar */}
                  <div className="bg-emerald-500/20 p-2.5 rounded-lg border border-emerald-400/40">
                    <div className="text-emerald-300 text-[11px] font-bold mb-0.5">(=) A Desembolsar (Líquido)</div>
                    <div className="text-base font-extrabold text-emerald-300">
                      {formatCurrencyMT(valorLiquidoDesembolso)}
                    </div>
                    <div className="text-[10px] text-emerald-200 mt-0.5">Valor entregue ao cliente</div>
                  </div>
                </div>

                <div className="text-[11px] text-indigo-200 bg-indigo-950/60 p-2 rounded-lg border border-indigo-800/50 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  <span>
                    <b>Regra Financeira:</b> Os custos administrativos e encargos são descontados <b>exclusivamente no ato do desembolso</b>. O valor abatido <b>não influencia os juros e nem na prestação real</b> ({formatCurrencyMT(valorPorParcela)}/parcela), mantendo o plano de pagamento fiel ao capital solicitado.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              BLOCO 5: CANAL DE DESEMBOLSO, AVALISTA E GARANTIAS
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-semibold text-sm">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              5. Canal de Desembolso, Garantias e Observações
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Canal de Desembolso */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Canal de Desembolso</label>
                <select
                  value={newFormaDesembolso}
                  onChange={(e) => setNewFormaDesembolso(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="mpesa">M-Pesa (Vodacom)</option>
                  <option value="emola">E-Mola (Movitel)</option>
                  <option value="banco">Transferência Bancária / NIB</option>
                  <option value="caixa">Numerário em Caixa / Tesouraria</option>
                </select>
              </div>

              {/* Conta / Telefone do Desembolso */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Conta / Número de Desembolso (M-Pesa / NIB / IBAN)
                </label>
                <input
                  type="text"
                  value={newDadosDesembolso}
                  onChange={(e) => setNewDadosDesembolso(e.target.value)}
                  placeholder="Ex: 84XXXXXXX ou 000100000000000000"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Avalista e Garantias */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome do Avalista / Fiador</label>
                <input
                  type="text"
                  value={newAvalistaNome}
                  onChange={(e) => setNewAvalistaNome(e.target.value)}
                  placeholder="Nome completo (opcional)"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Telefone do Avalista</label>
                <input
                  type="text"
                  value={newAvalistaTelefone}
                  onChange={(e) => setNewAvalistaTelefone(e.target.value)}
                  placeholder="+258 84XXXXXXX"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Garantia Material / Valor (MT)</label>
                <input
                  type="text"
                  value={newGarantiaDescricao}
                  onChange={(e) => setNewGarantiaDescricao(e.target.value)}
                  placeholder="Ex: Viatura, Título, Eletrodomésticos"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notas / Justificativa da Solicitação</label>
              <textarea
                value={newObservacoes}
                onChange={(e) => setNewObservacoes(e.target.value)}
                rows={2}
                placeholder="Observações complementares para análise de crédito..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              BOTÕES DE ACÇÃO
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="px-5 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || loadingInitial}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "A Submeter Proposta..." : "Submeter Pedido de Crédito"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}