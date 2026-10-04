/**
 * Tipos unificados para o sistema MSU Microcrédito
 * Compartilhados entre frontend e backend
 */

export type ClientType = "singular" | "grupo" | "empresa";

export type GroupMemberAllocation = {
  memberName: string;
  amount: number;
};

export type Frequency = "monthly" | "biweekly" | "weekly" | "daily" | "custom_days";

export type PedidoEstado = 
  | "rascunho" 
  | "pendente" 
  | "em_analise" 
  | "aprovado" 
  | "autorizado" 
  | "rejeitado" 
  | "cancelado" 
  | "liberado"
  | "desembolsado";

export type Pedido = {
  id: number;
  clienteId: number;
  cliente: string;
  clienteType: string;
  valor: number;
  tipoCredito: string;
  prazo: number;
  taxa: number;
  frequencia: string;
  paymentDaysOfWeek?: number[];
  installmentsCount?: number;
  mesReferencia: string;
  reemprestimo: boolean;
  isGrupo: boolean;
  membros: GroupMemberAllocation[];
  estado: PedidoEstado;
  data: string;
  valorAprovado?: number;
  valorAutorizado?: number;
  valorDesembolsado?: number;
  dataAnalise?: string;
  dataAprovacao?: string;
  dataAutorizacao?: string;
  dataDesembolso?: string;
  valorPago?: number;
  aprovadoPor?: string;
  autorizadoPor?: string;
  desembolsadoPor?: string;
};

export type Installment = {
  numParcela: number;
  dataVencimento: string;
  valor: number;
  status: "pendente" | "pago" | "atrasado";
  dataPagamento?: string | null;
  valorPago?: number;
};

export type CreditoAtivo = {
  id: number;
  pedidoId: number;
  clienteId: number;
  cliente: string;
  clienteType: string;
  contrato: string;
  valorSolicitado: number;
  totalAPagar: number;
  totalPago: number;
  saldoDevedor: number;
  prazo: number;
  taxa: number;
  frequencia: string;
  tipoCredito: string;
  mesReferencia: string;
  reemprestimo: boolean;
  membros: GroupMemberAllocation[];
  parcelas: Installment[];
  estado: "ativo" | "liquidado" | "baixado";
  dataDesembolso: string;
  mora: number;
  prestacoesAtrasadas: number;
};

export type PedidoFormData = {
  clienteId: number;
  cliente: string;
  clienteType: string;
  tipoCredito: string;
  prazo: number;
  taxa: number;
  frequencia: Frequency;
  paymentDaysOfWeek?: number[];
  installments?: Installment[];
  mesReferencia: string;
  reemprestimo: boolean;
  isGrupo: boolean;
  membros: GroupMemberAllocation[];
  valor: number;

  // Campos expandidos de carteira e gestor
  carteiraId?: number | null;
  carteiraNome?: string;
  gestorUserId?: number | null;
  gestorName?: string;

  // Condições e finalidade
  finalidade?: string;
  metodoAmortizacao?: string;
  comissaoAbertura?: string;
  carenciaDias?: number;

  // Canal de desembolso
  formaDesembolso?: string;
  dadosDesembolso?: string;

  // Custos Administrativos e Encargos
  administrativeFeeMode?: "aplicar" | "isento";
  administrativeFeeRate?: number;
  administrativeFeeAmount?: number;
  charges?: Array<{ chargeId?: number; name: string; type?: string; value: number }>;
  totalChargesAmount?: number;
  disbursementNetAmount?: number;

  // Garantias e avalistas
  avalistaNome?: string;
  avalistaTelefone?: string;
  avalistaNuit?: string;
  garantiaDescricao?: string;
  garantiaValor?: number;
  observacoes?: string;
};

export const ESTADO_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  em_analise: "Em Análise",
  aprovado: "Aprovado",
  autorizado: "Autorizado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  liberado: "Liberado",
  desembolsado: "Desembolsado",
};

export const ESTADO_COLOR: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-700",
  pendente: "bg-amber-100 text-amber-700",
  em_analise: "bg-blue-100 text-blue-700",
  aprovado: "bg-emerald-100 text-emerald-700",
  autorizado: "bg-indigo-100 text-indigo-700",
  rejeitado: "bg-red-100 text-red-700",
  cancelado: "bg-slate-100 text-slate-500",
  liberado: "bg-purple-100 text-purple-700",
  desembolsado: "bg-violet-100 text-violet-700",
};