import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Filter, Download, CreditCard, CheckCircle2, Clock, AlertTriangle, Edit, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { downloadTextFile, toCsv } from "../../lib/download";
import { formatCurrencyInput, parseCurrencyInput } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";

type Loan = {
  id: number;
  clientId: number;
  clientType: "singular" | "grupo" | "empresa";
  applicantType: "singular" | "grupo" | "empresa";
  groupMemberCount: number;
  managerUserId: number | null;
  managerName: string;
  contractNo: string;
  client: string;
  product: string;
  amount: number;
  balance: number;
  totalPaidPrincipal: number;
  totalForgivenPrincipal: number;
  totalForgivenMora: number;
  rate: number;
  administrativeFeeMode: "isento" | "aplicar";
  administrativeFeeRate: number;
  administrativeFeeAmount: number;
  disbursementNetAmount: number;
  dailyPenaltyRate: number;
  amortizationMethod: "price" | "sac" | "americano";
  paymentFrequency: "diario" | "semanal" | "quinzenal" | "mensal";
  disbursementStatus?: "pending" | "disbursed";
  disbursedAt?: string | null;
  disbursed: string;
  maturity: string;
  nextPayment: string;
  daysOverdue: number;
  status: string;
  guarantor: {
    id: number;
    name: string;
    phone: string;
    guaranteedAmount: number;
    activeGuarantees: number;
  } | null;
  moraAccrued: number;
  delinquencyBucket: string;
  collectionStage: { code: string; title: string; action: string };
};

type LoanForm = {
  contractNo: string;
  clientId: string;
  applicantType: "singular" | "grupo" | "empresa";
  groupMemberCount: number;
  groupMemberClientIds: number[];
  groupFinancingMode: "total" | "per_member";
  groupAllocations: Array<{ memberClientId: number | null; memberName: string; amount: number }>;
  managerUserId: string;
  product: string;
  amount: number;
  balance: number;
  rate: number;
  administrativeFeeMode: "isento" | "aplicar";
  administrativeFeeRate: number;
  administrativeFeeAmount: number;
  disbursementNetAmount: number;
  dailyPenaltyRate: number;
  amortizationMethod: Loan["amortizationMethod"];
  paymentFrequency: Loan["paymentFrequency"];
  paymentDays: number[];
  periodMonths: number;
  disbursed: string;
  maturity: string;
  nextPayment: string;
  daysOverdue: number;
  status: string;
};

type LoansResponse = {
  stats: { total: number; active: number; warning: number; overdue: number };
  totals: {
    portfolio: number;
    balance: number;
    overdueValue: number;
    moraTotal: number;
    bucketBreakdown: Record<string, { count: number; balance: number; mora: number }>;
  };
  loans: Loan[];
};

type ApprovalPolicy = {
  analystLimit: number;
  managerLimit: number;
  finalLimit: number;
  minScore: number;
  maxDebt: number;
  defaultDailyPenaltyRate: number;
  moraMonthlyEnabled: boolean;
  moraWeeklyEnabled: boolean;
  moraDailyEnabled: boolean;
  blockAlertStatus: boolean;
};

type ApprovalRequest = {
  id: number;
  clientId: number;
  clientType: "singular" | "grupo" | "empresa";
  applicantType: "singular" | "grupo" | "empresa";
  groupMemberCount: number;
  clientName: string;
  requestedAmount: number;
  status: "pending_analyst" | "pending_manager" | "pending_final" | "approved" | "rejected" | "risk_blocked";
  riskLevel: "clear" | "attention" | "risk";
  riskReasons: string[];
  createdByUserId: number | null;
  createdByName: string;
  analystDecisionByName: string;
  managerDecisionByName: string;
  finalDecisionByName: string;
  generatedLoanId: number | null;
  createdAt: string;
  updatedAt: string;
};

type Installment = {
  id: number;
  installmentNo: number;
  dueDate: string;
  vigenteAmount?: number;
  paymentAmount: number;
  principalAmount: number;
  interestAmount: number;
  balanceAfter: number;
  status: "paid" | "pending" | "late";
  paidAt: string | null;
};

type LoanInstallmentsResponse = {
  loanId: number;
  contractNo: string;
  summary: {
    total: number;
    paid: number;
    pending: number;
    late: number;
    paidAmount: number;
    pendingAmount: number;
    paidPrincipalAmount?: number;
    forgivenPrincipalAmount?: number;
    forgivenMoraAmount?: number;
  };
  installments: Installment[];
  audit: Array<{
    id: number;
    installmentId: number;
    installmentNo: number;
    previousStatus: "pending" | "paid" | "late";
    newStatus: "pending" | "paid" | "late";
    action: string;
    changedByUserId: number | null;
    changedByName: string;
    changedAt: string;
  }>;
  contractAudit: Array<{
    id: number;
    contractNo: string;
    action: "create" | "update" | "delete";
    changedByUserId: number | null;
    changedByName: string;
    payloadSnapshot: Record<string, unknown>;
    changedAt: string;
  }>;
  creditState?: {
    enabled: boolean;
    applicantType: "singular" | "grupo" | "empresa";
    request: {
      id: number;
      requestedAmount: number;
      status: string;
      riskLevel: string;
      product: string;
      createdAt: string;
      updatedAt: string;
      createdByName: string;
      analystDecisionByName: string;
      managerDecisionByName: string;
      finalDecisionByName: string;
    } | null;
    pedidoRows: Array<{
      allocationId: number;
      memberClientId: number | null;
      memberName: string;
      requestedAmount: number;
    }>;
    pagamentosRows: Array<{
      allocationId: number;
      memberClientId: number | null;
      memberName: string;
      allocatedAmount: number;
      paidAmount: number;
      remainingAmount: number;
      status: "open" | "partial" | "paid";
    }>;
    paymentEvents: Array<{
      id: number;
      paymentDate: string;
      amountReceived: number;
      amountApplied: number;
      unappliedAmount: number;
      allocationMode: "loan" | "client_auto";
      groupPaymentMode: "general" | "individual" | "unknown";
      note: string;
      createdByName: string;
      createdAt: string;
    }>;
    vigenteRows: Array<{
      installmentId: number;
      installmentNo: number;
      dueDate: string;
      vigenteAmount?: number;
      paymentAmount: number;
      status: "pending" | "paid" | "late";
      paidAt: string | null;
    }>;
    resumo: {
      totalMembros: number;
      membrosPagos: number;
      membrosParciais: number;
      membrosSemPagamento: number;
      totalPedido: number;
      totalPago: number;
      totalPendenteMembros: number;
      totalPagoGeral: number;
      totalPagoPorPessoa: number;
      totalPagoNaoClassificado: number;
      hasPagamentoGeral: boolean;
      hasPagamentoPorPessoa: boolean;
      hasPagamentoNaoClassificado: boolean;
      parcelasEmAtraso: number;
      parcelasPendentes: number;
    };
  };
  contractAuditPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  installmentAuditPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ClientOption = { id: number; name: string; type: "singular" | "grupo" | "empresa" };
type ManagerOption = { id: number; fullName: string };
type GroupMemberOption = { id: number; memberClientId: number | null; memberName: string; allocationAmount: number };

type CompanyProfile = {
  name: string;
  legalName: string;
  nuit: string;
  phone: string;
  email: string;
  address: string;
  logoUrl: string;
};

type CollectionsResponse = {
  loan: {
    id: number;
    contractNo: string;
    balance: number;
    daysOverdue: number;
    dailyPenaltyRate: number;
    moraWaivedTotal: number;
    totalPaidPrincipal: number;
    totalForgivenPrincipal: number;
    totalForgivenMora: number;
    moraAccrued: number;
    dailyMora: number;
    delinquencyBucket: string;
    collectionStage: { code: string; title: string; action: string };
  };
  promises: Array<{
    id: number;
    promisedFor: string;
    promisedAmount: number;
    status: "active" | "fulfilled" | "broken" | "cancelled";
    note: string;
    createdByUserId: number | null;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
  }>;
  renegotiations: Array<{
    id: number;
    reason: string;
    oldTerms: Record<string, unknown>;
    proposedTerms: Record<string, unknown>;
    status: "pending" | "approved" | "rejected" | "executed";
    note: string;
    createdByUserId: number | null;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
  }>;
  financialEvents: Array<{
    id: number;
    eventType: "estorno" | "abatimento" | "capitalizacao" | "perdao_mora" | "liquidacao_antecipada" | "reestruturacao_contrato";
    amount: number | null;
    note: string;
    payload: Record<string, unknown>;
    beforeSnapshot: Record<string, unknown>;
    afterSnapshot: Record<string, unknown>;
    workflowStatus: "pending" | "approved" | "rejected" | "executed";
    reviewedByUserId: number | null;
    reviewedByName: string | null;
    reviewedAt: string | null;
    reviewNote: string;
    createdByUserId: number | null;
    createdByName: string;
    createdAt: string;
  }>;
};

type CollectionsOperationsSummaryResponse = {
  generatedAt: string;
  filters: {
    periodDays: number;
    productivityDays: number;
    manager: string;
  };
  kpis: {
    activePromises: number;
    brokenPromisesPeriod: number;
    fulfilledPromisesPeriod: number;
    brokenRatePeriod: number;
    pendingRenegotiations: number;
    overduePortfolio: number;
    moraTotal: number;
  };
  bucketBreakdown: Array<{
    bucket: string;
    count: number;
    balance: number;
    mora: number;
  }>;
  byManager: Array<{
    managerName: string;
    promisesCreated: number;
    promisesBrokenPeriod: number;
    promisesFulfilledPeriod: number;
    pendingRenegotiations: number;
    totalActionsPeriod: number;
  }>;
  dailyProductivity: Array<{
    day: string;
    promisesCreated: number;
    promisesFulfilled: number;
    promisesBroken: number;
    installmentsPaid: number;
  }>;
};

type RepaymentApplyResponse = {
  message: string;
  repaymentId: number;
  paymentDate: string;
  amountReceived: number;
  amountApplied: number;
  unappliedAmount: number;
  principalApplied: number;
  interestApplied: number;
  moraApplied: number;
  allocations: Array<{
    loanId: number;
    contractNo: string;
    installmentId: number;
    installmentNo: number;
    dueDate: string;
    daysOverdue: number;
    installmentAmount: number;
    moraAmount: number;
    totalApplied: number;
  }>;
};

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyFixed = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const AUDIT_PAGE_SIZE = 10;
const DEFAULT_INSTALLMENT_COUNT = 1;
const ADMINISTRATIVE_FEE_RATE_PERCENT = 2;
const PRODUCT_TYPE_OPTIONS = ["Credito Normal", "Acrescimo", "Reemprestimo", "Credito Especial"] as const;
const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terca" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sabado" },
];

function getVigenteAmount(item: { vigenteAmount?: number; paymentAmount: number }) {
  return Number(item.vigenteAmount ?? item.paymentAmount ?? 0);
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addMonths(baseDate: Date, amount: number) {
  const date = new Date(baseDate.getTime());
  date.setMonth(date.getMonth() + amount);
  return date;
}

function addDays(baseDate: Date, amount: number) {
  const date = new Date(baseDate.getTime());
  date.setDate(date.getDate() + amount);
  return date;
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function normalizePaymentDays(days: number[]) {
  const clean = Array.from(new Set((Array.isArray(days) ? days : []).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)));
  return clean.sort((a, b) => a - b);
}

function buildAutomaticDates(disbursed: string, periodMonths: number, paymentFrequency: Loan["paymentFrequency"], paymentDays: number[]) {
  const disbursedDate = parseDateInput(disbursed);
  if (!disbursedDate) return null;
  const safePeriod = Number.isInteger(periodMonths) && periodMonths > 0 ? periodMonths : DEFAULT_INSTALLMENT_COUNT;
  const maturityDate = addMonths(disbursedDate, safePeriod);
  let nextPaymentDate = addMonths(disbursedDate, 1);
  if (paymentFrequency === "semanal") nextPaymentDate = addDays(disbursedDate, 7);
  if (paymentFrequency === "quinzenal") nextPaymentDate = addDays(disbursedDate, 14);
  if (paymentFrequency === "diario") {
    const selectedDays = normalizePaymentDays(paymentDays);
    const weekdaySet = new Set((selectedDays.length ? selectedDays : [1, 2, 3, 4, 5]).map((d) => d % 7));
    let current = addDays(disbursedDate, 1);
    while (current <= maturityDate) {
      if ((selectedDays.length > 0 && weekdaySet.has(current.getDay())) || (selectedDays.length === 0 && isBusinessDay(current))) {
        nextPaymentDate = current;
        break;
      }
      current = addDays(current, 1);
    }
  }
  return {
    nextPayment: formatDateInput(nextPaymentDate),
    maturity: formatDateInput(maturityDate),
  };
}

function generatePaymentDates(form: LoanForm) {
  const disbursedDate = parseDateInput(form.disbursed);
  const nextPaymentDate = parseDateInput(form.nextPayment);
  const maturityDate = parseDateInput(form.maturity);
  if (!disbursedDate || !nextPaymentDate || !maturityDate || maturityDate < nextPaymentDate) return [];

  if (form.paymentFrequency === "mensal") {
    const rows: Date[] = [];
    let current = new Date(nextPaymentDate.getTime());
    while (current <= maturityDate) {
      rows.push(new Date(current.getTime()));
      current = addMonths(current, 1);
    }
    return rows;
  }
  if (form.paymentFrequency === "semanal" || form.paymentFrequency === "quinzenal") {
    if (form.paymentFrequency === "semanal") {
      const safeMonths = Math.max(1, Number(form.periodMonths) || 1);
      const count = safeMonths * 4;
      const rows: Date[] = [];
      let current = new Date(nextPaymentDate.getTime());
      for (let i = 0; i < count; i += 1) {
        rows.push(new Date(current.getTime()));
        current = addDays(current, 7);
      }
      return rows;
    }
    const rows: Date[] = [];
    const intervalDays = 14;
    let current = new Date(nextPaymentDate.getTime());
    while (current <= maturityDate) {
      rows.push(new Date(current.getTime()));
      current = addDays(current, intervalDays);
    }
    return rows;
  }

  const selectedDays = normalizePaymentDays(form.paymentDays);
  const weekdaySet = new Set((selectedDays.length ? selectedDays : [1, 2, 3, 4, 5]).map((d) => d % 7));
  const rows: Date[] = [];
  let current = new Date(addDays(disbursedDate, 1).getTime());
  if (nextPaymentDate > current) current = new Date(nextPaymentDate.getTime());
  while (current <= maturityDate) {
    if ((selectedDays.length > 0 && weekdaySet.has(current.getDay())) || (selectedDays.length === 0 && isBusinessDay(current))) {
      rows.push(new Date(current.getTime()));
    }
    current = addDays(current, 1);
  }
  return rows;
}

function normalizeRatePercent(value: number) {
  if (!Number.isFinite(value)) return Number.NaN;
  if (value > 0 && value < 1) return value * 100;
  return value;
}

function parseMaskedNumber(value: string) {
  return parseCurrencyInput(value);
}

function formatMaskedNumber(value: number) {
  return formatCurrencyInput(value, { emptyIfZero: true });
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0)) * 100) / 100;
}

function estimatePaymentSummary(form: LoanForm) {
  const principal = Number(form.amount || 0);
  const normalizedRate = normalizeRatePercent(Number(form.rate || 0));
  const monthlyRate = normalizedRate / 100;
  const installments = generatePaymentDates(form).length;
  const contractMonths = Math.max(1, Number(form.periodMonths) || 1);
  if (!Number.isFinite(principal) || principal <= 0 || installments <= 0 || !Number.isFinite(monthlyRate) || monthlyRate < 0) {
    return null;
  }
  if (monthlyRate >= 1 && contractMonths > 1) {
    return null;
  }
  const totalAmount =
    contractMonths === 1
      ? principal * (1 + monthlyRate)
      : monthlyRate === 0
        ? principal
        : ((principal / contractMonths) / (1 - monthlyRate)) * contractMonths;
  const payment = totalAmount / installments;
  return { installments, mode: "mensal dividido pela frequencia", payment, firstPayment: payment, lastPayment: payment };
}

function statusLabel(status: "pending" | "paid" | "late") {
  if (status === "paid") return "Paga";
  if (status === "late") return "Em atraso";
  return "Pendente";
}

function contractActionLabel(action: "create" | "update" | "delete") {
  if (action === "create") return "Criacao";
  if (action === "update") return "Edicao";
  return "Exclusao";
}

function installmentActionLabel(action: string) {
  if (action === "mark_paid") return "Marcar como pago";
  if (action === "manual_status_change") return "Alteracao manual de status";
  return action;
}

function auditActionFilterLabel(action: string) {
  if (action === "all") return "Todas";
  if (action === "create") return "Criacao de contrato";
  if (action === "update") return "Edicao de contrato";
  if (action === "delete") return "Exclusao de contrato";
  if (action === "mark_paid") return "Parcela marcada como paga";
  if (action === "manual_status_change") return "Alteracao manual de parcela";
  return action;
}

function approvalStatusLabel(status: ApprovalRequest["status"]) {
  if (status === "pending_analyst") return "Pendente Analista";
  if (status === "pending_manager") return "Pendente Gestor";
  if (status === "pending_final") return "Pendente Final";
  if (status === "approved") return "Aprovada";
  if (status === "rejected") return "Rejeitada";
  return "Bloqueada por Risco";
}

const emptyForm: LoanForm = {
  contractNo: "",
  clientId: "",
  applicantType: "singular",
  groupMemberCount: 0,
  groupMemberClientIds: [],
  groupFinancingMode: "total",
  groupAllocations: [],
  managerUserId: "",
  product: "Credito Normal",
  amount: 0,
  balance: 0,
  rate: 0,
  administrativeFeeMode: "isento",
  administrativeFeeRate: ADMINISTRATIVE_FEE_RATE_PERCENT,
  administrativeFeeAmount: 0,
  disbursementNetAmount: 0,
  dailyPenaltyRate: 2,
  amortizationMethod: "price" as const,
  paymentFrequency: "mensal" as const,
  paymentDays: [1, 2, 3, 4, 5],
  periodMonths: DEFAULT_INSTALLMENT_COUNT,
  disbursed: "",
  maturity: "",
  nextPayment: "",
  daysOverdue: 0,
  status: "active",
};

export type LoansPageMode = "pedidos" | "carteira";

type LoansPageProps = {
  mode?: LoansPageMode;
};

export default function LoansPage({ mode = "carteira" }: LoansPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [loanTypeFilter, setLoanTypeFilter] = useState<"all" | "singular" | "grupo" | "empresa">("all");
  const [payload, setPayload] = useState<LoansResponse | null>(null);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [groupMemberOptions, setGroupMemberOptions] = useState<GroupMemberOption[]>([]);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showInstallmentsModal, setShowInstallmentsModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [installmentsPayload, setInstallmentsPayload] = useState<LoanInstallmentsResponse | null>(null);
  const [collectionsPayload, setCollectionsPayload] = useState<CollectionsResponse | null>(null);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsOperations, setCollectionsOperations] = useState<CollectionsOperationsSummaryResponse | null>(null);
  const [collectionsOperationsLoading, setCollectionsOperationsLoading] = useState(false);
  const [collectionsPeriodDays, setCollectionsPeriodDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [collectionsManagerFilter, setCollectionsManagerFilter] = useState("all");
  const [payingInstallmentId, setPayingInstallmentId] = useState<number | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentMode, setPaymentMode] = useState<"loan" | "client_auto">("loan");
  const [savingRepayment, setSavingRepayment] = useState(false);
  const [installmentsFilter, setInstallmentsFilter] = useState<"all" | "paid" | "pending" | "late">("all");
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [auditPeriodFilter, setAuditPeriodFilter] = useState<"all" | "today" | "7d" | "30d" | "90d">("all");
  const [auditUserFilter, setAuditUserFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState<"all" | "create" | "update" | "delete" | "mark_paid" | "manual_status_change">("all");
  const [auditSearchTerm, setAuditSearchTerm] = useState("");
  const [contractAuditPage, setContractAuditPage] = useState(1);
  const [installmentAuditPage, setInstallmentAuditPage] = useState(1);
  const [promiseForm, setPromiseForm] = useState({ promisedFor: "", promisedAmount: "", note: "" });
  const [savingPromise, setSavingPromise] = useState(false);
  const [renegotiationForm, setRenegotiationForm] = useState({ reason: "", proposedRate: "", proposedMaturity: "", note: "" });
  const [savingRenegotiation, setSavingRenegotiation] = useState(false);
  const [financialEventForm, setFinancialEventForm] = useState({
    eventType: "abatimento" as "estorno" | "abatimento" | "capitalizacao" | "perdao_mora" | "liquidacao_antecipada" | "reestruturacao_contrato",
    amount: "",
    note: "",
    restructureRate: "",
    restructureDailyPenaltyRate: "",
    restructureMethod: "price" as "price" | "sac" | "americano",
    restructureFrequency: "mensal" as "diario" | "semanal" | "quinzenal" | "mensal",
    restructureNextPaymentOn: "",
    restructureMaturityOn: "",
  });
  const [savingFinancialEvent, setSavingFinancialEvent] = useState(false);
  const [financialEventReviewNotes, setFinancialEventReviewNotes] = useState<Record<number, string>>({});
  const [reviewingFinancialEventId, setReviewingFinancialEventId] = useState<number | null>(null);
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy | null>(null);
  const [approvalPolicyForm, setApprovalPolicyForm] = useState<ApprovalPolicy>({
    analystLimit: 50000,
    managerLimit: 200000,
    finalLimit: 1000000000,
    minScore: 600,
    maxDebt: 80000,
    defaultDailyPenaltyRate: 2,
    moraMonthlyEnabled: true,
    moraWeeklyEnabled: false,
    moraDailyEnabled: false,
    blockAlertStatus: true,
  });
  const [editingApprovalPolicy, setEditingApprovalPolicy] = useState(false);
  const [savingApprovalPolicy, setSavingApprovalPolicy] = useState(false);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [approvalFilter, setApprovalFilter] = useState<"all" | "my_stage" | "pending_analyst" | "pending_manager" | "pending_final" | "approved" | "rejected" | "risk_blocked">("my_stage");
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalDecisionNotes, setApprovalDecisionNotes] = useState<Record<number, string>>({});
  const [decidingApprovalId, setDecidingApprovalId] = useState<number | null>(null);
  const [isBalanceAuto, setIsBalanceAuto] = useState(true);
  const [isDateAuto, setIsDateAuto] = useState(true);
  const [capitalInput, setCapitalInput] = useState("");
  const [capitalFocused, setCapitalFocused] = useState(false);
  const currentUser = getUser();
  const canRunCriticalFinancialEvents = currentUser?.role === "admin" || currentUser?.role === "manager";
  const canEditApprovalPolicy = currentUser?.role === "admin";
  const approvalStage =
    currentUser?.role === "operator"
      ? "analyst"
      : currentUser?.role === "manager"
        ? "manager"
        : currentUser?.role === "admin"
          ? "final"
          : null;
  const canSeeApprovalDecisionControls = approvalStage !== null;
  const isGroupPerMemberMode = form.applicantType === "grupo" && form.groupFinancingMode === "per_member";
  const groupPerMemberTotal = useMemo(
    () => roundMoney((form.groupAllocations || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)),
    [form.groupAllocations],
  );
  const administrativeFeeAmountPreview = useMemo(
    () => (form.administrativeFeeMode === "aplicar" ? roundMoney(Number(form.amount || 0) * (ADMINISTRATIVE_FEE_RATE_PERCENT / 100)) : 0),
    [form.administrativeFeeMode, form.amount],
  );
  const disbursementNetAmountPreview = useMemo(
    () => roundMoney(Math.max(0, Number(form.amount || 0) - administrativeFeeAmountPreview)),
    [form.amount, administrativeFeeAmountPreview],
  );

  const loadLoans = useCallback(async () => {
    try {
      setError("");
      const data = await apiFetch<LoansResponse>(
        `/loans?search=${encodeURIComponent(searchTerm)}&status=${activeTab}&clientType=${loanTypeFilter}`,
      );
      setPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar emprestimos.");
    }
  }, [activeTab, searchTerm, loanTypeFilter]);

  const loadClients = useCallback(async () => {
    try {
      const data = await apiFetch<{ clients: ClientOption[] }>("/clients/options");
      setClientOptions(
        (data.clients || []).map((client) => ({
          id: Number(client.id),
          name: client.name,
          type: (client.type || "singular") as "singular" | "grupo" | "empresa",
        })),
      );
    } catch {
      setClientOptions([]);
    }
  }, []);

  const loadManagers = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: Array<{ id: number; fullName: string; role: string; isActive: boolean }> }>("/users?role=portfolio");
      const managers = (data.users || [])
        .filter((u) => ["manager", "agent"].includes((u.role || "").toLowerCase()) && u.isActive)
        .map((u) => ({ id: Number(u.id), fullName: u.fullName }));
      setManagerOptions(managers);
    } catch {
      setManagerOptions([]);
    }
  }, []);

  const loadGroupMembers = useCallback(async (clientId: string) => {
    if (!clientId) {
      setGroupMemberOptions([]);
      return;
    }
    try {
      const data = await apiFetch<{ members: GroupMemberOption[] }>(`/clients/${clientId}/group-members`);
      setGroupMemberOptions(data.members || []);
    } catch {
      setGroupMemberOptions([]);
    }
  }, []);

  const loadInstallments = useCallback(async (loanId: number) => {
    setInstallmentsLoading(true);
    try {
      const params = new URLSearchParams({
        auditPeriod: auditPeriodFilter,
        auditUser: auditUserFilter,
        auditAction: auditActionFilter,
        auditSearch: auditSearchTerm,
        contractAuditPage: String(contractAuditPage),
        contractAuditPageSize: String(AUDIT_PAGE_SIZE),
        installmentAuditPage: String(installmentAuditPage),
        installmentAuditPageSize: String(AUDIT_PAGE_SIZE),
      });
      const data = await apiFetch<LoanInstallmentsResponse>(`/loans/${loanId}/installments?${params.toString()}`);
      setInstallmentsPayload(data);
    } catch (e) {
      setInstallmentsPayload(null);
      setError(e instanceof Error ? e.message : "Falha ao carregar historico de parcelas.");
    } finally {
      setInstallmentsLoading(false);
    }
  }, [auditPeriodFilter, auditUserFilter, auditActionFilter, auditSearchTerm, contractAuditPage, installmentAuditPage]);

  const loadCollections = useCallback(async (loanId: number) => {
    setCollectionsLoading(true);
    try {
      const data = await apiFetch<CollectionsResponse>(`/loans/${loanId}/collections`);
      setCollectionsPayload(data);
    } catch (e) {
      setCollectionsPayload(null);
      setError(e instanceof Error ? e.message : "Falha ao carregar dados de cobranca e mora.");
    } finally {
      setCollectionsLoading(false);
    }
  }, []);

  const loadCollectionsOperations = useCallback(async () => {
    setCollectionsOperationsLoading(true);
    try {
      const params = new URLSearchParams({
        periodDays: String(collectionsPeriodDays),
        manager: collectionsManagerFilter,
      });
      const data = await apiFetch<CollectionsOperationsSummaryResponse>(`/loans/collections/operations-summary?${params.toString()}`);
      setCollectionsOperations(data);
    } catch {
      setCollectionsOperations(null);
    } finally {
      setCollectionsOperationsLoading(false);
    }
  }, [collectionsManagerFilter, collectionsPeriodDays]);

  const loadApprovalPolicy = useCallback(async () => {
    try {
      const data = await apiFetch<{ policy: ApprovalPolicy }>("/loans/approval/policy");
      setApprovalPolicy(data.policy);
    } catch {
      setApprovalPolicy(null);
    }
  }, []);

  const loadApprovalRequests = useCallback(async () => {
    setApprovalLoading(true);
    try {
      const params = new URLSearchParams({ status: approvalFilter });
      const data = await apiFetch<{ requests: ApprovalRequest[] }>(`/loans/approval/requests?${params.toString()}`);
      setApprovalRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch {
      setApprovalRequests([]);
    } finally {
      setApprovalLoading(false);
    }
  }, [approvalFilter]);

  useEffect(() => {
    loadLoans();
  }, [loadLoans]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    loadManagers();
  }, [loadManagers]);

  useEffect(() => {
    if (!showForm || form.applicantType !== "grupo" || !form.clientId) {
      setGroupMemberOptions([]);
      return;
    }
    void loadGroupMembers(form.clientId);
  }, [showForm, form.applicantType, form.clientId, loadGroupMembers]);

  useEffect(() => {
    if (!showForm || form.applicantType !== "grupo") return;
    const linkedMemberIds = Array.from(
      new Set(
        (groupMemberOptions || [])
          .map((member) => Number(member.memberClientId || 0))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    );
    setForm((prev) => {
      if (prev.applicantType !== "grupo") return prev;
      let changed = false;
      const next = { ...prev };
      const nextCount = (groupMemberOptions || []).length;
      if (Number(prev.groupMemberCount || 0) !== nextCount) {
        next.groupMemberCount = nextCount;
        changed = true;
      }
      if ((prev.groupMemberClientIds || []).join(",") !== linkedMemberIds.join(",")) {
        next.groupMemberClientIds = linkedMemberIds;
        changed = true;
      }
      if (prev.groupFinancingMode === "per_member" && (prev.groupAllocations || []).length === 0) {
        next.groupAllocations = (groupMemberOptions || [])
          .map((member) => ({
            memberClientId: Number(member.memberClientId || 0) > 0 ? Number(member.memberClientId) : null,
            memberName: String(member.memberName || "").trim(),
            amount: Number(member.allocationAmount || 0),
          }))
          .filter((item) => item.memberName && item.amount > 0);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [showForm, form.applicantType, form.groupFinancingMode, groupMemberOptions]);

  useEffect(() => {
    if (!showForm || !isGroupPerMemberMode) return;
    setForm((prev) => {
      if (prev.applicantType !== "grupo" || prev.groupFinancingMode !== "per_member") return prev;
      const nextAmount = groupPerMemberTotal;
      const nextBalance = isBalanceAuto ? nextAmount : prev.balance;
      if (Math.abs(Number(prev.amount || 0) - nextAmount) <= 0.01 && Math.abs(Number(prev.balance || 0) - nextBalance) <= 0.01) {
        return prev;
      }
      return { ...prev, amount: nextAmount, balance: nextBalance };
    });
  }, [showForm, isGroupPerMemberMode, groupPerMemberTotal, isBalanceAuto]);

  useEffect(() => {
    if (!showForm) return;
    setForm((prev) => {
      const nextRate = ADMINISTRATIVE_FEE_RATE_PERCENT;
      if (
        Math.abs(Number(prev.administrativeFeeAmount || 0) - administrativeFeeAmountPreview) <= 0.01
        && Math.abs(Number(prev.disbursementNetAmount || 0) - disbursementNetAmountPreview) <= 0.01
        && Math.abs(Number(prev.administrativeFeeRate || 0) - nextRate) <= 0.0001
      ) {
        return prev;
      }
      return {
        ...prev,
        administrativeFeeRate: nextRate,
        administrativeFeeAmount: administrativeFeeAmountPreview,
        disbursementNetAmount: disbursementNetAmountPreview,
      };
    });
  }, [showForm, administrativeFeeAmountPreview, disbursementNetAmountPreview]);

  useEffect(() => {
    loadCollectionsOperations();
  }, [loadCollectionsOperations]);

  useEffect(() => {
    loadApprovalPolicy();
  }, [loadApprovalPolicy]);

  useEffect(() => {
    if (!approvalPolicy) return;
    setApprovalPolicyForm(approvalPolicy);
  }, [approvalPolicy]);

  useEffect(() => {
    loadApprovalRequests();
  }, [loadApprovalRequests]);

  useEffect(() => {
    apiFetch<{
      company: {
        name: string;
        legalName?: string;
        nuit?: string;
        phone?: string;
        email?: string;
        address?: string;
        logoUrl?: string;
      };
    }>("/company/profile")
      .then((data) =>
        setCompany({
          name: data.company.name,
          legalName: data.company.legalName || "",
          nuit: data.company.nuit || "",
          phone: data.company.phone || "",
          email: data.company.email || "",
          address: data.company.address || "",
          logoUrl: data.company.logoUrl || "",
        }),
      )
      .catch(() => setCompany(null));
  }, []);

  useEffect(() => {
    if (!showInstallmentsModal || !selectedLoan) return;
    loadInstallments(selectedLoan.id);
    loadCollections(selectedLoan.id);
  }, [showInstallmentsModal, selectedLoan, loadInstallments, loadCollections]);

  const getStatusBadge = (status: string, daysOverdue: number, balance: number) => {
    if (Number(balance || 0) <= 0.009) {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Pago</Badge>;
    }
    if (status === "overdue" || daysOverdue > 30) return <Badge className="bg-red-100 text-red-800 border-red-200">Em Atraso ({daysOverdue}d)</Badge>;
    if (status === "warning" || daysOverdue > 0) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Atencao ({daysOverdue}d)</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Em Dia</Badge>;
  };

  const resetForm = () => {
    setForm(emptyForm);
    setCapitalInput("");
    setCapitalFocused(false);
    setIsBalanceAuto(true);
    setIsDateAuto(true);
    setEditingId(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    const today = formatDateInput(new Date());
    const automaticDates = buildAutomaticDates(today, emptyForm.periodMonths, emptyForm.paymentFrequency, emptyForm.paymentDays);
    setForm({
      ...emptyForm,
      managerUserId: managerOptions[0] ? String(managerOptions[0].id) : "",
      disbursed: today,
      nextPayment: automaticDates?.nextPayment || "",
      maturity: automaticDates?.maturity || "",
      dailyPenaltyRate: approvalPolicy?.defaultDailyPenaltyRate ?? emptyForm.dailyPenaltyRate,
    });
    setIsBalanceAuto(true);
    setIsDateAuto(true);
    setCapitalInput("");
    setCapitalFocused(false);
    setEditingId(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const submittingForm =
        editingId === null
          ? { ...form, status: "active", daysOverdue: 0 }
          : form;
      const sanitizedApplicantType = submittingForm.applicantType || "singular";
      const linkedGroupMembers = sanitizedApplicantType === "grupo"
        ? (groupMemberOptions || [])
        : [];
      const sanitizedGroupMemberIds = sanitizedApplicantType === "grupo"
        ? Array.from(
            new Set(
              linkedGroupMembers
                .map((member) => Number(member.memberClientId || 0))
                .filter((value) => Number.isInteger(value) && value > 0),
            ),
          )
        : [];
      const sanitizedGroupMemberCount = sanitizedApplicantType === "grupo"
        ? linkedGroupMembers.length
        : 0;
      if (sanitizedApplicantType === "grupo" && sanitizedGroupMemberCount <= 0) {
        throw new Error("Este grupo nao possui membros cadastrados. Atualize o cadastro do grupo antes de solicitar credito.");
      }
      let sanitizedGroupAllocations = sanitizedApplicantType === "grupo"
        ? (submittingForm.groupAllocations || [])
          .map((item) => ({
            memberClientId: Number(item.memberClientId || 0) > 0 ? Number(item.memberClientId) : null,
            memberName: String(item.memberName || "").trim(),
            amount: Number(item.amount || 0),
          }))
          .filter((item) => (item.memberClientId || item.memberName) && item.amount > 0)
        : [];
      if (
        sanitizedApplicantType === "grupo"
        && submittingForm.groupFinancingMode === "per_member"
        && sanitizedGroupAllocations.length === 0
      ) {
        sanitizedGroupAllocations = linkedGroupMembers
          .map((member) => ({
            memberClientId: Number(member.memberClientId || 0) > 0 ? Number(member.memberClientId) : null,
            memberName: String(member.memberName || "").trim(),
            amount: Number(member.allocationAmount || 0),
          }))
          .filter((item) => item.memberName && item.amount > 0);
      }
      const requestAmount =
        sanitizedApplicantType === "grupo" && submittingForm.groupFinancingMode === "per_member"
          ? roundMoney(sanitizedGroupAllocations.reduce((sum, item) => sum + Number(item.amount || 0), 0))
          : Number(submittingForm.amount || 0);
      const requestBalance =
        sanitizedApplicantType === "grupo" && submittingForm.groupFinancingMode === "per_member" && isBalanceAuto
          ? requestAmount
          : Number(submittingForm.balance || 0);
      const requestRate = Number(submittingForm.rate || 0);
      if (!String(submittingForm.product || "").trim()) {
        throw new Error("Defina o produto do emprestimo.");
      }
      if (!Number.isInteger(Number(submittingForm.clientId)) || Number(submittingForm.clientId) <= 0) {
        throw new Error("Selecione um cliente valido para registar o emprestimo.");
      }
      if (!Number.isInteger(Number(submittingForm.managerUserId)) || Number(submittingForm.managerUserId) <= 0) {
        throw new Error("Selecione a carteira/gestor antes de registar o emprestimo.");
      }
      if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
        throw new Error("O capital do emprestimo deve ser maior que zero.");
      }
      if (!Number.isFinite(requestBalance) || requestBalance < 0) {
        throw new Error("O saldo informado e invalido.");
      }
      if (!Number.isFinite(requestRate) || requestRate <= 0 || requestRate > 100) {
        throw new Error("Defina uma taxa de juro valida (maior que zero).");
      }
      if (!submittingForm.disbursed || !submittingForm.maturity || !submittingForm.nextPayment) {
        throw new Error("Preencha as datas de desembolso, vencimento e proximo pagamento.");
      }
      const administrativeFeeMode = submittingForm.administrativeFeeMode === "aplicar" ? "aplicar" : "isento";
      const administrativeFeeAmount = administrativeFeeMode === "aplicar"
        ? roundMoney(requestAmount * (ADMINISTRATIVE_FEE_RATE_PERCENT / 100))
        : 0;
      const disbursementNetAmount = roundMoney(Math.max(0, requestAmount - administrativeFeeAmount));
      const body = JSON.stringify({
        ...submittingForm,
        applicantType: sanitizedApplicantType,
        groupMemberClientIds: sanitizedGroupMemberIds,
        groupMemberCount: sanitizedGroupMemberCount,
        groupFinancingMode: sanitizedApplicantType === "grupo" ? submittingForm.groupFinancingMode : "total",
        groupAllocations: sanitizedGroupAllocations,
        amount: requestAmount,
        balance: requestBalance,
        administrativeFeeMode,
        administrativeFeeRate: ADMINISTRATIVE_FEE_RATE_PERCENT,
        administrativeFeeAmount,
        disbursementNetAmount,
        dailyPenaltyRate: editingId === null
          ? (approvalPolicy?.defaultDailyPenaltyRate ?? submittingForm.dailyPenaltyRate)
          : submittingForm.dailyPenaltyRate,
        amortizationMethod: submittingForm.amortizationMethod,
        paymentDays: submittingForm.paymentFrequency === "diario" ? normalizePaymentDays(submittingForm.paymentDays) : [],
        clientId: Number(submittingForm.clientId),
        managerUserId: Number(submittingForm.managerUserId),
      });
      const response = await apiFetch<{ contractNo?: string; status?: string; message?: string }>(
        editingId ? `/loans/${editingId}` : "/loans/approval/requests",
        {
          method: editingId ? "PUT" : "POST",
          body,
        },
      );
      if (editingId) {
        setSuccess("Emprestimo atualizado com sucesso.");
      } else {
        if (response.status === "approved") {
          setSuccess(response.message || "Solicitacao aprovada. Contrato/documentos gerados e enviado para desembolso.");
        } else {
          setSuccess(response.message || "Solicitacao registrada.");
        }
        await loadApprovalRequests();
      }
      resetForm();
      await loadLoans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar emprestimo.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (loan: Loan) => {
    const disbursedDate = parseDateInput(loan.disbursed);
    const maturityDate = parseDateInput(loan.maturity);
    const monthsSpan =
      disbursedDate && maturityDate
        ? Math.max(
            1,
            (maturityDate.getFullYear() - disbursedDate.getFullYear()) * 12 +
              (maturityDate.getMonth() - disbursedDate.getMonth()) +
              (maturityDate.getDate() >= disbursedDate.getDate() ? 0 : -1),
          )
        : DEFAULT_INSTALLMENT_COUNT;
    setEditingId(loan.id);
    setForm({
      contractNo: loan.contractNo,
      clientId: String(loan.clientId),
      applicantType: (loan.applicantType || loan.clientType || "singular") as "singular" | "grupo" | "empresa",
      groupMemberCount: Number(loan.groupMemberCount || 0),
      groupMemberClientIds: [],
      groupFinancingMode: "total",
      groupAllocations: [],
      managerUserId: loan.managerUserId ? String(loan.managerUserId) : "",
      product: loan.product,
      amount: loan.amount,
      balance: loan.balance,
      rate: loan.rate,
      administrativeFeeMode: loan.administrativeFeeMode || "isento",
      administrativeFeeRate: Number(loan.administrativeFeeRate || ADMINISTRATIVE_FEE_RATE_PERCENT),
      administrativeFeeAmount: Number(loan.administrativeFeeAmount || 0),
      disbursementNetAmount: Number(loan.disbursementNetAmount || Math.max(0, loan.amount - (loan.administrativeFeeAmount || 0))),
      dailyPenaltyRate: loan.dailyPenaltyRate,
      amortizationMethod: loan.amortizationMethod,
      paymentFrequency: loan.paymentFrequency,
      paymentDays: [1, 2, 3, 4, 5],
      periodMonths: monthsSpan,
      disbursed: loan.disbursed,
      maturity: loan.maturity,
      nextPayment: loan.nextPayment,
      daysOverdue: loan.daysOverdue,
      status: loan.status,
    });
    setIsBalanceAuto(false);
    setIsDateAuto(false);
    setCapitalInput(formatMaskedNumber(loan.amount));
    setCapitalFocused(false);
    setShowForm(true);
  };

  useEffect(() => {
    if (capitalFocused) return;
    setCapitalInput(formatMaskedNumber(form.amount));
  }, [capitalFocused, form.amount]);

  useEffect(() => {
    if (!showForm || editingId !== null || !isBalanceAuto) return;
    setForm((prev) => (prev.balance === prev.amount ? prev : { ...prev, balance: prev.amount }));
  }, [showForm, editingId, isBalanceAuto, form.amount]);

  useEffect(() => {
    if (!showForm || editingId !== null || !isDateAuto) return;
    const disbursed = form.disbursed || formatDateInput(new Date());
    const automaticDates = buildAutomaticDates(disbursed, form.periodMonths, form.paymentFrequency, form.paymentDays);
    if (!automaticDates) return;
    setForm((prev) => {
      const nextDisbursed = prev.disbursed || disbursed;
      if (
        nextDisbursed === prev.disbursed &&
        prev.nextPayment === automaticDates.nextPayment &&
        prev.maturity === automaticDates.maturity
      ) {
        return prev;
      }
      return {
        ...prev,
        disbursed: nextDisbursed,
        nextPayment: automaticDates.nextPayment,
        maturity: automaticDates.maturity,
      };
    });
  }, [showForm, editingId, isDateAuto, form.disbursed, form.periodMonths, form.paymentFrequency, form.paymentDays]);

  useEffect(() => {
    if (!showForm) return;
    if (form.managerUserId) return;
    if (!managerOptions[0]) return;
    setForm((prev) => ({ ...prev, managerUserId: String(managerOptions[0].id) }));
  }, [showForm, form.managerUserId, managerOptions]);

  useEffect(() => {
    if (!showForm) return;
    setForm((prev) => {
      let changed = false;
      const next = { ...prev };
      const selectedClient = clientOptions.find((client) => String(client.id) === prev.clientId) || null;
      if (selectedClient && selectedClient.type !== prev.applicantType) {
        next.clientId = "";
        changed = true;
      }
      if (prev.applicantType !== "grupo") {
        if ((prev.groupMemberClientIds || []).length > 0 || Number(prev.groupMemberCount || 0) !== 0) {
          next.groupMemberClientIds = [];
          next.groupMemberCount = 0;
          next.groupAllocations = [];
          next.groupFinancingMode = "total";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [showForm, form.applicantType, clientOptions]);

  const filteredClientOptions = useMemo(() => {
    return clientOptions.filter((client) => client.type === form.applicantType);
  }, [clientOptions, form.applicantType]);

  const handleDelete = async (id: number) => {
    const ok = window.confirm("Deseja realmente remover este emprestimo?");
    if (!ok) return;
    try {
      setError("");
      setSuccess("");
      await apiFetch(`/loans/${id}`, { method: "DELETE" });
      setSuccess("Emprestimo removido com sucesso.");
      if (editingId === id) resetForm();
      await loadLoans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover emprestimo.");
    }
  };

  const handleOpenInstallments = async (loan: Loan) => {
    setSelectedLoan(loan);
    setInstallmentsFilter("all");
    setAuditPeriodFilter("all");
    setAuditUserFilter("all");
    setAuditActionFilter("all");
    setAuditSearchTerm("");
    setContractAuditPage(1);
    setInstallmentAuditPage(1);
    setPromiseForm({ promisedFor: "", promisedAmount: "", note: "" });
    setRenegotiationForm({ reason: "", proposedRate: "", proposedMaturity: "", note: "" });
    setFinancialEventForm({
      eventType: "abatimento",
      amount: "",
      note: "",
      restructureRate: "",
      restructureDailyPenaltyRate: "",
      restructureMethod: "price",
      restructureFrequency: "mensal",
      restructureNextPaymentOn: "",
      restructureMaturityOn: "",
    });
    setFinancialEventReviewNotes({});
    setReviewingFinancialEventId(null);
    setPaymentAmountInput("");
    setPaymentMode("loan");
    setShowInstallmentsModal(true);
  };

  const handleApplyRepayment = async () => {
    if (!selectedLoan) return;
    const amount = parseMaskedNumber(paymentAmountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor valido para receber pagamento.");
      return;
    }
    try {
      setSavingRepayment(true);
      setError("");
      setSuccess("");
      const result = await apiFetch<RepaymentApplyResponse>("/loans/payments/apply", {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedLoan.clientId,
          loanId: paymentMode === "loan" ? selectedLoan.id : null,
          amount,
          paymentDate: new Date().toISOString().slice(0, 10),
          note: paymentMode === "loan" ? "Pagamento aplicado ao contrato selecionado." : "Pagamento com alocacao automatica por cliente.",
        }),
      });
      const first = result.allocations[0];
      const last = result.allocations[result.allocations.length - 1];
      const rangeText =
        first && last
          ? `${first.contractNo} parcela #${first.installmentNo}${first.installmentId === last.installmentId ? "" : ` ate ${last.contractNo} parcela #${last.installmentNo}`}`
          : "sem detalhes";
      setSuccess(
        `Pagamento aplicado. Principal: ${money.format(result.principalApplied)} MT | Juros: ${money.format(result.interestApplied)} MT | Mora: ${money.format(result.moraApplied)} MT | Alocacao: ${rangeText}.`,
      );
      setPaymentAmountInput("");
      await loadInstallments(selectedLoan.id);
      await loadLoans();
      if (selectedLoan.id) await loadCollections(selectedLoan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aplicar pagamento.");
    } finally {
      setSavingRepayment(false);
    }
  };

  const handlePayInstallment = async (installmentId: number) => {
    if (!selectedLoan) return;
    try {
      setPayingInstallmentId(installmentId);
      setError("");
      await apiFetch(`/loans/${selectedLoan.id}/installments/${installmentId}/pay`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadInstallments(selectedLoan.id);
      await loadLoans();
      setSuccess("Parcela marcada como paga com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar parcela.");
    } finally {
      setPayingInstallmentId(null);
    }
  };

  const handleChangeInstallmentStatus = async (installmentId: number, nextStatus: "pending" | "paid" | "late") => {
    if (!selectedLoan) return;
    try {
      setPayingInstallmentId(installmentId);
      setError("");
      await apiFetch(`/loans/${selectedLoan.id}/installments/${installmentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadInstallments(selectedLoan.id);
      await loadLoans();
      setSuccess("Status da parcela atualizado com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar status da parcela.");
    } finally {
      setPayingInstallmentId(null);
    }
  };

  const handleCreatePromise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;
    try {
      setSavingPromise(true);
      setError("");
      await apiFetch(`/loans/${selectedLoan.id}/promises`, {
        method: "POST",
        body: JSON.stringify({
          promisedFor: promiseForm.promisedFor,
          promisedAmount: parseMaskedNumber(promiseForm.promisedAmount),
          note: promiseForm.note,
        }),
      });
      setPromiseForm({ promisedFor: "", promisedAmount: "", note: "" });
      await loadCollections(selectedLoan.id);
      setSuccess("Promessa de pagamento registrada com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registrar promessa.");
    } finally {
      setSavingPromise(false);
    }
  };

  const handleUpdatePromiseStatus = async (promiseId: number, status: "active" | "fulfilled" | "broken" | "cancelled") => {
    if (!selectedLoan) return;
    try {
      setError("");
      await apiFetch(`/loans/${selectedLoan.id}/promises/${promiseId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadCollections(selectedLoan.id);
      setSuccess("Status da promessa atualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar promessa.");
    }
  };

  const handleCreateRenegotiation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;
    try {
      setSavingRenegotiation(true);
      setError("");
      await apiFetch(`/loans/${selectedLoan.id}/renegotiations`, {
        method: "POST",
        body: JSON.stringify({
          reason: renegotiationForm.reason,
          note: renegotiationForm.note,
          proposedTerms: {
            rate: renegotiationForm.proposedRate ? Number(renegotiationForm.proposedRate) : null,
            maturity: renegotiationForm.proposedMaturity || null,
          },
        }),
      });
      setRenegotiationForm({ reason: "", proposedRate: "", proposedMaturity: "", note: "" });
      await loadCollections(selectedLoan.id);
      setSuccess("Renegociacao registrada com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registrar renegociacao.");
    } finally {
      setSavingRenegotiation(false);
    }
  };

  const handleUpdateRenegotiationStatus = async (renegotiationId: number, status: "pending" | "approved" | "rejected" | "executed") => {
    if (!selectedLoan) return;
    try {
      setError("");
      await apiFetch(`/loans/${selectedLoan.id}/renegotiations/${renegotiationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadCollections(selectedLoan.id);
      setSuccess("Status da renegociacao atualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar renegociacao.");
    }
  };

  const handleApplyFinancialEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;
    if (["liquidacao_antecipada", "reestruturacao_contrato"].includes(financialEventForm.eventType) && !canRunCriticalFinancialEvents) {
      setError("Apenas manager ou admin podem executar este evento financeiro.");
      return;
    }
    if (["liquidacao_antecipada", "reestruturacao_contrato"].includes(financialEventForm.eventType) && !financialEventForm.note.trim()) {
      setError("Justificativa obrigatoria para liquidacao antecipada e reestruturacao.");
      return;
    }
    try {
      setSavingFinancialEvent(true);
      setError("");
      const payload =
        financialEventForm.eventType === "reestruturacao_contrato"
          ? {
              rate: financialEventForm.restructureRate ? Number(financialEventForm.restructureRate) : undefined,
              dailyPenaltyRate: financialEventForm.restructureDailyPenaltyRate ? Number(financialEventForm.restructureDailyPenaltyRate) : undefined,
              amortizationMethod: financialEventForm.restructureMethod,
              paymentFrequency: financialEventForm.restructureFrequency,
              nextPaymentOn: financialEventForm.restructureNextPaymentOn,
              maturityOn: financialEventForm.restructureMaturityOn,
            }
          : {};

      const response = await apiFetch<{ workflowStatus?: string; message?: string }>(`/loans/${selectedLoan.id}/financial-events`, {
        method: "POST",
        body: JSON.stringify({
          eventType: financialEventForm.eventType,
          amount: financialEventForm.amount ? parseMaskedNumber(financialEventForm.amount) : null,
          note: financialEventForm.note,
          payload,
        }),
      });

      setFinancialEventForm((s) => ({
        ...s,
        amount: "",
        note: "",
      }));
      await loadCollections(selectedLoan.id);
      await loadLoans();
      await loadInstallments(selectedLoan.id);
      setSuccess(response.workflowStatus === "pending" ? "Reestruturacao registrada e pendente de aprovacao." : "Evento financeiro aplicado com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aplicar evento financeiro.");
    } finally {
      setSavingFinancialEvent(false);
    }
  };

  const handleReviewFinancialEvent = async (eventId: number, decision: "approve" | "reject") => {
    if (!selectedLoan) return;
    const reviewNote = (financialEventReviewNotes[eventId] || "").trim();
    if (!reviewNote) {
      setError("Informe a justificativa da revisao antes de aprovar ou rejeitar.");
      return;
    }
    try {
      setReviewingFinancialEventId(eventId);
      setError("");
      await apiFetch(`/loans/${selectedLoan.id}/financial-events/${eventId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ decision, reviewNote }),
      });
      setFinancialEventReviewNotes((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
      await loadCollections(selectedLoan.id);
      await loadLoans();
      await loadInstallments(selectedLoan.id);
      setSuccess(decision === "approve" ? "Reestruturacao aprovada e executada." : "Reestruturacao rejeitada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao revisar reestruturacao.");
    } finally {
      setReviewingFinancialEventId(null);
    }
  };

  const handleApprovalDecision = async (requestId: number, decision: "approve" | "reject") => {
    const note = (approvalDecisionNotes[requestId] || "").trim();
    if (!note) {
      setError("Informe a justificativa da decisao da esteira.");
      return;
    }
    try {
      setDecidingApprovalId(requestId);
      setError("");
      const result = await apiFetch<{ message?: string; status?: string; contractNo?: string }>(`/loans/approval/requests/${requestId}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note }),
      });
      setApprovalDecisionNotes((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      await loadApprovalRequests();
      await loadLoans();
      setSuccess(result.message || (decision === "approve" ? "Etapa aprovada." : "Solicitacao rejeitada."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao decidir solicitacao.");
    } finally {
      setDecidingApprovalId(null);
    }
  };

  const handleSaveApprovalPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditApprovalPolicy) return;
    if (!(approvalPolicyForm.analystLimit <= approvalPolicyForm.managerLimit && approvalPolicyForm.managerLimit <= approvalPolicyForm.finalLimit)) {
      setError("Alcadas invalidas: analista <= gestor <= final.");
      return;
    }
    try {
      setSavingApprovalPolicy(true);
      setError("");
      await apiFetch("/loans/approval/policy", {
        method: "PUT",
        body: JSON.stringify(approvalPolicyForm),
      });
      await loadApprovalPolicy();
      setEditingApprovalPolicy(false);
      setSuccess("Politica de aprovacao atualizada com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar politica de aprovacao.");
    } finally {
      setSavingApprovalPolicy(false);
    }
  };

  const exportLoansExcel = () => {
    const rows = (payload?.loans || []).map((loan) => ({
      contrato: loan.contractNo,
      cliente: loan.client,
      tipo: loan.applicantType || loan.clientType || "",
      gestor: loan.managerName,
      produto: loan.product,
      valor: loan.amount,
      saldo: loan.balance,
      taxa: loan.rate,
      avalista: loan.guarantor?.name || "",
      contacto_avalista: loan.guarantor?.phone || "",
      valor_garantido: loan.guarantor?.guaranteedAmount || 0,
      garantias_ativas: loan.guarantor?.activeGuarantees || 0,
      frequencia_pagamento: loan.paymentFrequency,
      proximo_pagamento: loan.nextPayment,
      dias_atraso: loan.daysOverdue,
      mora_acumulada: loan.moraAccrued,
      faixa_atraso: loan.delinquencyBucket,
      status: loan.status,
    }));
    downloadTextFile("emprestimos.csv", toCsv(rows), "text/csv;charset=utf-8");
    setSuccess("Lista de emprestimos exportada em Excel (CSV).");
  };

  const exportLoansPdf = () => {
    const now = new Date().toLocaleDateString("pt-PT");
    const rows = (payload?.loans || [])
      .map(
        (loan) =>
          `<tr>
            <td>${loan.contractNo}</td>
            <td>${loan.client}</td>
            <td>${loan.applicantType || loan.clientType || "-"}</td>
            <td>${loan.managerName}</td>
            <td>${loan.product}</td>
            <td>${money.format(loan.amount)} MT</td>
            <td>${money.format(loan.balance)} MT</td>
            <td>${loan.rate.toFixed(2)}%</td>
            <td>${loan.guarantor?.name || "-"}</td>
            <td>${loan.guarantor ? `${money.format(loan.guarantor.guaranteedAmount)} MT` : "-"}</td>
            <td>${loan.paymentFrequency}</td>
            <td>${loan.nextPayment}</td>
            <td>${loan.daysOverdue}</td>
            <td>${loan.status}</td>
          </tr>`,
      )
      .join("");
    const html = `
      <div class="block">
        <h2>Lista de Emprestimos</h2>
        <p class="muted"><strong>Gerado:</strong> ${now} | <strong>Total:</strong> ${(payload?.loans || []).length}</p>
        <p class="muted"><strong>Carteira:</strong> ${money.format(payload?.totals.portfolio || 0)} MT | <strong>Saldo:</strong> ${money.format(payload?.totals.balance || 0)} MT | <strong>Mora:</strong> ${money.format(payload?.totals.moraTotal || 0)} MT</p>
        <table>
          <thead>
            <tr><th>Contrato</th><th>Cliente</th><th>Tipo</th><th>Gestor</th><th>Produto</th><th>Valor</th><th>Saldo</th><th>Taxa</th><th>Avalista</th><th>Garantia</th><th>Frequencia</th><th>Prox. Pag.</th><th>Atraso</th><th>Status</th></tr>
          </thead>
          <tbody>${rows || "<tr><td colspan='14'>Sem emprestimos para exportar.</td></tr>"}</tbody>
        </table>
      </div>
    `;
    const ok = openCorporatePrintWindow({
      title: "Emprestimos",
      bodyHtml: html,
      company: company || undefined,
      browserControls: true,
    });
    setSuccess(ok ? "Documento aberto para impressao/salvar em PDF." : "Nao foi possivel abrir janela de impressao.");
  };

  const filteredInstallments = useMemo(() => {
    const list = installmentsPayload?.installments || [];
    if (installmentsFilter === "all") return list;
    return list.filter((item) => item.status === installmentsFilter);
  }, [installmentsPayload?.installments, installmentsFilter]);

  const filteredInstallmentsSummary = useMemo(() => {
    return filteredInstallments.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "paid") {
          acc.paid += 1;
          acc.paidAmount += item.paymentAmount;
        } else if (item.status === "late") {
          acc.late += 1;
          acc.pendingAmount += getVigenteAmount(item);
        } else {
          acc.pending += 1;
          acc.pendingAmount += getVigenteAmount(item);
        }
        return acc;
      },
      { total: 0, paid: 0, pending: 0, late: 0, paidAmount: 0, pendingAmount: 0 },
    );
  }, [filteredInstallments]);

  const auditUsers = useMemo(() => {
    const users = new Set<string>();
    (installmentsPayload?.contractAudit || []).forEach((event) => users.add(event.changedByName || "Sistema"));
    (installmentsPayload?.audit || []).forEach((event) => users.add(event.changedByName || "Sistema"));
    return Array.from(users).sort((a, b) => a.localeCompare(b));
  }, [installmentsPayload?.audit, installmentsPayload?.contractAudit]);
  const collectionsManagerOptions = useMemo(() => {
    const names = new Set<string>();
    (collectionsOperations?.byManager || []).forEach((row) => names.add(row.managerName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [collectionsOperations?.byManager]);
  const actionableApprovalRequests = useMemo(() => {
    if (!approvalStage) return [];
    return approvalRequests.filter((item) => {
      if (item.status === "pending_analyst") return approvalStage === "analyst" && item.createdByUserId !== currentUser?.id;
      if (item.status === "pending_manager") return approvalStage === "manager" && item.createdByUserId !== currentUser?.id;
      if (item.status === "pending_final") return approvalStage === "final" && item.createdByUserId !== currentUser?.id;
      if (item.status === "risk_blocked") return (approvalStage === "manager" || approvalStage === "final") && item.createdByUserId !== currentUser?.id;
      return false;
    });
  }, [approvalRequests, approvalStage, currentUser?.id]);
  const approvalBlockedReasonById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of approvalRequests) {
      if (item.status === "approved") {
        map.set(item.id, item.generatedLoanId ? `Contrato #${item.generatedLoanId} gerado e enviado para desembolso.` : "Aprovada e enviada para desembolso.");
        continue;
      }
      if (item.status === "rejected") {
        map.set(item.id, "Solicitacao encerrada como rejeitada.");
        continue;
      }
      if (item.status === "risk_blocked") {
        map.set(item.id, "Bloqueada por risco. Apenas gestor/admin podem encerrar.");
        continue;
      }
      if (item.createdByUserId && item.createdByUserId === currentUser?.id) {
        map.set(item.id, "Segregacao de funcao: o solicitante nao pode aprovar a propria solicitacao.");
        continue;
      }
      if (item.status === "pending_analyst" && approvalStage !== "analyst") {
        map.set(item.id, "Aguardando analista aprovar.");
        continue;
      }
      if (item.status === "pending_manager" && approvalStage !== "manager") {
        map.set(item.id, "Aguardando gestor aprovar.");
        continue;
      }
      if (item.status === "pending_final" && approvalStage !== "final") {
        map.set(item.id, "Aguardando admin (aprovacao final).");
      }
    }
    return map;
  }, [approvalRequests, approvalStage, currentUser?.id]);
  const simulationForm = useMemo(
    () => ({ ...form, amortizationMethod: "price" as const }),
    [form],
  );
  const paymentPreview = useMemo(() => estimatePaymentSummary(simulationForm), [simulationForm]);
  const paymentDatesPreview = useMemo(() => generatePaymentDates(simulationForm), [simulationForm]);

  const contractAuditRows = installmentsPayload?.contractAudit || [];
  const installmentAuditRows = installmentsPayload?.audit || [];
  const contractAuditPagination = installmentsPayload?.contractAuditPagination || { page: contractAuditPage, pageSize: AUDIT_PAGE_SIZE, total: 0, totalPages: 1 };
  const installmentAuditPagination = installmentsPayload?.installmentAuditPagination || { page: installmentAuditPage, pageSize: AUDIT_PAGE_SIZE, total: 0, totalPages: 1 };
  const groupCreditState = installmentsPayload?.creditState?.enabled ? installmentsPayload.creditState : null;
  const groupPaymentEvents = groupCreditState?.paymentEvents || [];
  const groupGeneralPaymentEvents = groupPaymentEvents.filter((row) => row.groupPaymentMode === "general");
  const groupIndividualPaymentEvents = groupPaymentEvents.filter((row) => row.groupPaymentMode === "individual");
  const groupUnknownPaymentEvents = groupPaymentEvents.filter((row) => row.groupPaymentMode === "unknown");

  const handleExportInstallmentsPdf = () => {
    if (!selectedLoan || !installmentsPayload) return;
    const now = new Date().toLocaleDateString("pt-PT");
    const filterText =
      installmentsFilter === "all" ? "Todas" : installmentsFilter === "paid" ? "Pagas" : installmentsFilter === "pending" ? "Pendentes" : "Em atraso";
    const companyHtml = `
      <div class="header">
        ${company?.logoUrl ? `<img src="${company.logoUrl}" class="logo" alt="Logo" />` : `<div class="logo"></div>`}
        <div>
          <h1 class="title">${company?.name || "-"}</h1>
          <p class="sub"><strong>Razao Social:</strong> ${company?.legalName || "-"}</p>
          <p class="sub"><strong>NUIT:</strong> ${company?.nuit || "-"}</p>
          <p class="sub"><strong>Telefone:</strong> ${company?.phone || "-"}</p>
          <p class="sub"><strong>Email:</strong> ${company?.email || "-"}</p>
          <p class="sub"><strong>Endereco:</strong> ${company?.address || "-"}</p>
        </div>
      </div>
    `;
    const rows = filteredInstallments
      .map(
        (item) =>
          `<tr>
            <td>${item.installmentNo}</td>
            <td>${item.dueDate}</td>
            <td>${money.format(item.paymentAmount)} MT</td>
            <td>${money.format(item.principalAmount)} MT</td>
            <td>${money.format(item.interestAmount)} MT</td>
            <td>${money.format(item.balanceAfter)} MT</td>
            <td>${item.status === "paid" ? "Paga" : item.status === "pending" ? "Pendente" : "Em atraso"}</td>
          </tr>`,
      )
      .join("");
    const html = `
      ${companyHtml}
      <div class="block">
        <h2>Historico de Pagamentos do Credito</h2>
        <p class="muted"><strong>Contrato:</strong> ${selectedLoan.contractNo} | <strong>Cliente:</strong> ${selectedLoan.client} | <strong>Filtro:</strong> ${filterText} | <strong>Gerado:</strong> ${now}</p>
        <p class="muted"><strong>Avalista:</strong> ${selectedLoan.guarantor?.name || "-"} | <strong>Contacto:</strong> ${selectedLoan.guarantor?.phone || "-"} | <strong>Garantia:</strong> ${selectedLoan.guarantor ? `${money.format(selectedLoan.guarantor.guaranteedAmount)} MT` : "-"}</p>
        <p class="muted"><strong>Parcelas:</strong> ${filteredInstallmentsSummary.total} | <strong>Pagas:</strong> ${filteredInstallmentsSummary.paid} | <strong>Pendentes:</strong> ${filteredInstallmentsSummary.pending} | <strong>Atraso:</strong> ${filteredInstallmentsSummary.late}</p>
        <p class="muted"><strong>Valor pago:</strong> ${money.format(filteredInstallmentsSummary.paidAmount)} MT | <strong>Valor vigente (remanescente):</strong> ${money.format(filteredInstallmentsSummary.pendingAmount)} MT</p>
        <table>
          <thead>
            <tr><th>Parcela</th><th>Vencimento</th><th>Prestacao</th><th>Principal</th><th>Juros</th><th>Saldo</th><th>Status</th></tr>
          </thead>
          <tbody>${rows || "<tr><td colspan='7'>Nenhuma parcela para o filtro informado.</td></tr>"}</tbody>
        </table>
      </div>
    `;
    const ok = openCorporatePrintWindow({
      title: `Historico-${selectedLoan.contractNo}`,
      bodyHtml: html,
      company: company || undefined,
      browserControls: true,
    });
    setSuccess(ok ? "Documento aberto para impressao/salvar em PDF." : "Nao foi possivel abrir janela de impressao.");
  };

  const handleExportAuditPdf = async () => {
    if (!selectedLoan || !installmentsPayload) return;
    const now = new Date().toLocaleDateString("pt-PT");
    const periodText =
      auditPeriodFilter === "all"
        ? "Todos"
        : auditPeriodFilter === "today"
          ? "Hoje"
          : auditPeriodFilter === "7d"
            ? "Ultimos 7 dias"
            : auditPeriodFilter === "30d"
              ? "Ultimos 30 dias"
              : "Ultimos 90 dias";
    const companyHtml = `
      <div class="header">
        ${company?.logoUrl ? `<img src="${company.logoUrl}" class="logo" alt="Logo" />` : `<div class="logo"></div>`}
        <div>
          <h1 class="title">${company?.name || "-"}</h1>
          <p class="sub"><strong>NUIT:</strong> ${company?.nuit || "-"}</p>
          <p class="sub"><strong>Telefone:</strong> ${company?.phone || "-"}</p>
          <p class="sub"><strong>Email:</strong> ${company?.email || "-"}</p>
        </div>
      </div>
    `;

    let exportPayload: LoanInstallmentsResponse = installmentsPayload;
    try {
      const exportParams = new URLSearchParams({
        auditPeriod: auditPeriodFilter,
        auditUser: auditUserFilter,
        auditAction: auditActionFilter,
        auditSearch: auditSearchTerm,
        contractAuditPage: "1",
        contractAuditPageSize: "500",
        installmentAuditPage: "1",
        installmentAuditPageSize: "500",
      });
      exportPayload = await apiFetch<LoanInstallmentsResponse>(`/loans/${selectedLoan.id}/installments?${exportParams.toString()}`);
    } catch {
      // fallback para dados atuais caso a recarga para exportacao falhe
    }

    const contractRows = (exportPayload.contractAudit || [])
      .map(
        (event) =>
          `<tr>
            <td>${new Date(event.changedAt).toLocaleDateString("pt-PT")}</td>
            <td>${event.contractNo}</td>
            <td>${contractActionLabel(event.action)}</td>
            <td>${event.changedByName || "Sistema"}</td>
          </tr>`,
      )
      .join("");

    const installmentRows = (exportPayload.audit || [])
      .map(
        (event) =>
          `<tr>
            <td>${new Date(event.changedAt).toLocaleDateString("pt-PT")}</td>
            <td>${event.installmentNo}</td>
            <td>${statusLabel(event.previousStatus)} -> ${statusLabel(event.newStatus)}</td>
            <td>${installmentActionLabel(event.action)}</td>
            <td>${event.changedByName || "Sistema"}</td>
          </tr>`,
      )
      .join("");

    const html = `
      ${companyHtml}
      <div class="block">
        <h2>Auditoria do Credito</h2>
        <p class="muted"><strong>Contrato:</strong> ${selectedLoan.contractNo} | <strong>Cliente:</strong> ${selectedLoan.client}</p>
        <p class="muted"><strong>Periodo:</strong> ${periodText} | <strong>Utilizador:</strong> ${auditUserFilter === "all" ? "Todos" : auditUserFilter} | <strong>Acao:</strong> ${auditActionFilterLabel(auditActionFilter)} | <strong>Busca:</strong> ${auditSearchTerm || "Sem busca"} | <strong>Gerado:</strong> ${now}</p>
      </div>
      <div class="block">
        <h3>Auditoria do Contrato (${exportPayload.contractAuditPagination?.total ?? exportPayload.contractAudit.length})</h3>
        <table>
          <thead><tr><th>Data</th><th>Contrato</th><th>Acao</th><th>Utilizador</th></tr></thead>
          <tbody>${contractRows || "<tr><td colspan='4'>Sem eventos no filtro atual.</td></tr>"}</tbody>
        </table>
      </div>
      <div class="block">
        <h3>Auditoria das Parcelas (${exportPayload.installmentAuditPagination?.total ?? exportPayload.audit.length})</h3>
        <table>
          <thead><tr><th>Data</th><th>Parcela</th><th>Alteracao</th><th>Acao</th><th>Utilizador</th></tr></thead>
          <tbody>${installmentRows || "<tr><td colspan='5'>Sem eventos no filtro atual.</td></tr>"}</tbody>
        </table>
      </div>
    `;

    const ok = openCorporatePrintWindow({
      title: `Auditoria-${selectedLoan.contractNo}`,
      bodyHtml: html,
      company: company || undefined,
      browserControls: true,
    });
    setSuccess(ok ? "Auditoria aberta para impressao/salvar em PDF." : "Nao foi possivel abrir janela de impressao.");
  };

  const handleExportCollectionsOperationsPdf = async () => {
    const now = new Date().toLocaleDateString("pt-PT");
    const periodLabel = `${collectionsPeriodDays} dias`;
    const managerLabel = collectionsManagerFilter === "all" ? "Todos os gestores" : collectionsManagerFilter;
    const companyHtml = `
      <div class="header">
        ${company?.logoUrl ? `<img src="${company.logoUrl}" class="logo" alt="Logo" />` : `<div class="logo"></div>`}
        <div>
          <h1 class="title">${company?.name || "-"}</h1>
          <p class="sub"><strong>NUIT:</strong> ${company?.nuit || "-"}</p>
          <p class="sub"><strong>Telefone:</strong> ${company?.phone || "-"}</p>
          <p class="sub"><strong>Email:</strong> ${company?.email || "-"}</p>
        </div>
      </div>
    `;

    let exportPayload = collectionsOperations;
    try {
      const params = new URLSearchParams({
        periodDays: String(collectionsPeriodDays),
        manager: collectionsManagerFilter,
      });
      exportPayload = await apiFetch<CollectionsOperationsSummaryResponse>(`/loans/collections/operations-summary?${params.toString()}`);
    } catch {
      // fallback para os dados atuais em tela
    }
    if (!exportPayload) {
      setError("Nao ha dados para exportar no painel operacional.");
      return;
    }

    const managerRows = exportPayload.byManager
      .map(
        (row) =>
          `<tr>
            <td>${row.managerName}</td>
            <td>${row.totalActionsPeriod}</td>
            <td>${row.promisesCreated}</td>
            <td>${row.promisesBrokenPeriod}</td>
            <td>${row.pendingRenegotiations}</td>
          </tr>`,
      )
      .join("");
    const productivityRows = exportPayload.dailyProductivity
      .map(
        (row) =>
          `<tr>
            <td>${new Date(row.day).toLocaleDateString("pt-PT")}</td>
            <td>${row.promisesCreated}</td>
            <td>${row.promisesFulfilled}</td>
            <td>${row.promisesBroken}</td>
            <td>${row.installmentsPaid}</td>
          </tr>`,
      )
      .join("");
    const bucketRows = exportPayload.bucketBreakdown
      .map(
        (row) =>
          `<tr>
            <td>${row.bucket}</td>
            <td>${row.count}</td>
            <td>${money.format(row.balance)} MT</td>
            <td>${money.format(row.mora)} MT</td>
          </tr>`,
      )
      .join("");

    const html = `
      ${companyHtml}
      <div class="block">
        <h2>Painel Operacional de Cobranca</h2>
        <p class="muted"><strong>Periodo:</strong> ${periodLabel} | <strong>Gestor:</strong> ${managerLabel} | <strong>Gerado:</strong> ${now}</p>
        <p class="muted"><strong>Promessas ativas:</strong> ${exportPayload.kpis.activePromises} | <strong>Quebras:</strong> ${exportPayload.kpis.brokenPromisesPeriod} | <strong>Cumpridas:</strong> ${exportPayload.kpis.fulfilledPromisesPeriod} | <strong>Taxa quebra:</strong> ${exportPayload.kpis.brokenRatePeriod.toFixed(2)}%</p>
        <p class="muted"><strong>Renegociacoes pendentes:</strong> ${exportPayload.kpis.pendingRenegotiations} | <strong>Mora total:</strong> ${money.format(exportPayload.kpis.moraTotal)} MT | <strong>Carteira em atraso:</strong> ${money.format(exportPayload.kpis.overduePortfolio)} MT</p>
      </div>
      <div class="block">
        <h3>Desempenho por Gestor</h3>
        <table>
          <thead><tr><th>Gestor</th><th>Acoes periodo</th><th>Promessas</th><th>Quebras periodo</th><th>Reneg. pendente</th></tr></thead>
          <tbody>${managerRows || "<tr><td colspan='5'>Sem dados para o filtro selecionado.</td></tr>"}</tbody>
        </table>
      </div>
      <div class="block">
        <h3>Produtividade Diaria (${exportPayload.filters.productivityDays} dias)</h3>
        <table>
          <thead><tr><th>Dia</th><th>Promessas</th><th>Cumpridas</th><th>Quebradas</th><th>Parcelas pagas</th></tr></thead>
          <tbody>${productivityRows || "<tr><td colspan='5'>Sem dados diarios.</td></tr>"}</tbody>
        </table>
      </div>
      <div class="block">
        <h3>Mora por Carteira</h3>
        <table>
          <thead><tr><th>Faixa</th><th>Contratos</th><th>Saldo</th><th>Mora</th></tr></thead>
          <tbody>${bucketRows || "<tr><td colspan='4'>Sem dados de faixas.</td></tr>"}</tbody>
        </table>
      </div>
    `;

    const ok = openCorporatePrintWindow({
      title: "Painel-Operacional-Cobranca",
      bodyHtml: html,
      company: company || undefined,
      browserControls: true,
    });
    setSuccess(ok ? "Painel operacional aberto para impressao/salvar em PDF." : "Nao foi possivel abrir janela de impressao.");
  };

  const renderTable = (list: Loan[]) => (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Contrato</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Gestor</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Valor Original</TableHead>
            <TableHead>Saldo Devedor</TableHead>
            <TableHead>Taxa</TableHead>
            <TableHead>Avalista</TableHead>
            <TableHead>Garantia</TableHead>
            <TableHead>Frequencia</TableHead>
            <TableHead>Proximo Pagamento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Mora Acumulada</TableHead>
            <TableHead>Faixa</TableHead>
            <TableHead className="text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((loan) => (
            <TableRow key={loan.id}>
              <TableCell className="font-mono font-medium">{loan.contractNo}</TableCell>
              <TableCell className="font-medium">{loan.client}</TableCell>
              <TableCell className="text-xs font-semibold uppercase">{loan.applicantType || loan.clientType || "-"}</TableCell>
              <TableCell className="text-sm">{loan.managerName}</TableCell>
              <TableCell className="text-sm">{loan.product}</TableCell>
              <TableCell className="font-semibold">{money.format(loan.amount)} MT</TableCell>
              <TableCell className="font-semibold text-blue-600">
                <div>{money.format(loan.balance)} MT</div>
                <div className="text-[11px] font-normal text-slate-500">
                  Pago: {money.format(loan.totalPaidPrincipal || 0)} | Perdoado: {money.format((loan.totalForgivenPrincipal || 0) + (loan.totalForgivenMora || 0))}
                </div>
              </TableCell>
              <TableCell>{loan.rate}%</TableCell>
              <TableCell className="text-sm">{loan.guarantor?.name || "-"}</TableCell>
              <TableCell className="text-sm font-semibold">{loan.guarantor ? `${money.format(loan.guarantor.guaranteedAmount)} MT` : "-"}</TableCell>
              <TableCell className="capitalize text-xs font-semibold">{loan.paymentFrequency}</TableCell>
              <TableCell className="text-sm">{loan.nextPayment}</TableCell>
              <TableCell>{getStatusBadge(loan.status, loan.daysOverdue, loan.balance)}</TableCell>
              <TableCell className="font-semibold text-red-700">{money.format(loan.moraAccrued || 0)} MT</TableCell>
              <TableCell className="text-xs font-semibold">{loan.delinquencyBucket}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(loan)}><Edit className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(loan.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const visibleLoans = useMemo(() => {
    const loans = payload?.loans || [];
    if (mode === "pedidos") {
      return loans.filter((loan) => loan.disbursementStatus === "pending");
    }
    return loans;
  }, [mode, payload?.loans]);

  const pageTitle = mode === "pedidos" ? "Pedidos de Credito" : "Gestao de Emprestimos";
  const pageSubtitle =
    mode === "pedidos"
      ? "Solicitacoes aprovadas aguardando desembolso e contratos pendentes de libertacao de fundos"
      : "Acompanhamento completo da carteira de credito";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="text-slate-600 mt-1">{pageSubtitle}</p>
        </div>
        <Button onClick={openCreateForm} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Nova Solicitacao
        </Button>
      </div>

      {!showForm && error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
      {!showForm && success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">{success}</p>}

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            resetForm();
            return;
          }
          setShowForm(true);
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Emprestimo" : "Nova Solicitacao de Emprestimo"}</DialogTitle>
            <DialogDescription>{editingId ? "Atualize os dados do emprestimo existente." : "Preencha os dados para criar a solicitacao, contrato e documentos automaticamente."}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
          {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">{success}</p>}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Contrato</Label>
              {editingId ? (
                <Input value={form.contractNo} disabled />
              ) : (
                <Input value="Gerado automaticamente ao salvar" disabled />
              )}
            </div>
            <div className="space-y-1">
              <Label>Tipo de solicitante</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={form.applicantType}
                onChange={(e) => setForm((s) => ({ ...s, applicantType: e.target.value as "singular" | "grupo" | "empresa" }))}
                disabled={editingId !== null}
              >
                <option value="singular">Singular</option>
                <option value="grupo">Grupo</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Cliente</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={form.clientId}
                onChange={(e) => {
                  const nextClientId = e.target.value;
                  setForm((s) => (
                    s.applicantType === "grupo"
                      ? {
                        ...s,
                        clientId: nextClientId,
                        groupMemberCount: 0,
                        groupMemberClientIds: [],
                        groupAllocations: [],
                      }
                      : { ...s, clientId: nextClientId }
                  ));
                }}
                required
              >
                <option value="">Selecione o cliente</option>
                {filteredClientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Gestor da carteira</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={form.managerUserId}
                onChange={(e) => setForm((s) => ({ ...s, managerUserId: e.target.value }))}
                required
              >
                <option value="">Selecione o gestor</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>{manager.fullName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Tipo de produto</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={form.product}
                onChange={(e) => setForm((s) => ({ ...s, product: e.target.value }))}
                required
              >
                {PRODUCT_TYPE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
                {!PRODUCT_TYPE_OPTIONS.includes(form.product as (typeof PRODUCT_TYPE_OPTIONS)[number]) && form.product && (
                  <option value={form.product}>{form.product}</option>
                )}
              </select>
              <p className="text-xs text-slate-500">
                Credito Normal e Reemprestimo exigem liquidacao do credito vigente. Credito Especial permite multiplos contratos ativos.
              </p>
            </div>
            {form.applicantType === "grupo" && (
              <div className="md:col-span-4 rounded border border-slate-200 bg-slate-50 p-3 space-y-3">
                <p className="text-sm font-medium text-slate-800">Configuracao de Grupo</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Total de membros do grupo</Label>
                    <Input value={String(Number(form.groupMemberCount || 0))} disabled />
                    <p className="text-xs text-slate-500">Calculado automaticamente com base no cadastro do grupo.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Membros vinculados ao lider</Label>
                    <div className="min-h-28 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm overflow-auto">
                      {(groupMemberOptions || []).length > 0 ? (
                        <ul className="space-y-1">
                          {(groupMemberOptions || []).map((member) => (
                            <li key={member.id} className="text-slate-700">
                              {member.memberName}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-500">Nenhum membro cadastrado para este grupo.</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Modo de financiamento</Label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                      value={form.groupFinancingMode}
                      onChange={(e) => setForm((s) => ({ ...s, groupFinancingMode: e.target.value as "total" | "per_member" }))}
                    >
                      <option value="total">Valor total para o grupo</option>
                      <option value="per_member">Valor por pessoa</option>
                    </select>
                  </div>
                </div>
                {form.groupFinancingMode === "per_member" && (
                  <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-700">Distribuicao por membro (deve somar o capital total)</p>
                    <p className="text-xs text-slate-500">Total calculado dos membros: {formatCurrencyInput(groupPerMemberTotal)} MT</p>
                    {(groupMemberOptions || []).map((member) => {
                      const row = (form.groupAllocations || []).find((item) => item.memberClientId === member.memberClientId && item.memberName === member.memberName)
                        || { memberClientId: member.memberClientId, memberName: member.memberName, amount: Number(member.allocationAmount || 0) };
                      return (
                        <div key={member.id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <Input value={member.memberName} disabled />
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={row.amount > 0 ? String(row.amount) : ""}
                            onChange={(e) => {
                              const value = parseMaskedNumber(e.target.value);
                              setForm((s) => {
                                const next = [...(s.groupAllocations || [])];
                                const idx = next.findIndex((item) => item.memberClientId === row.memberClientId && item.memberName === row.memberName);
                                const nextRow = { memberClientId: row.memberClientId, memberName: row.memberName, amount: value };
                                if (idx >= 0) next[idx] = nextRow;
                                else next.push(nextRow);
                                return { ...s, groupAllocations: next };
                              });
                            }}
                            placeholder="Valor (MT)"
                          />
                          <Input value={member.memberClientId ? `Cliente #${member.memberClientId}` : "Sem cliente vinculado"} disabled />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {editingId !== null && (
              <div className="space-y-1">
                <Label>Status</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                  <option value="active">Em Dia</option>
                  <option value="warning">Atencao</option>
                  <option value="overdue">Em Atraso</option>
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Capital (MT)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 250000"
                value={capitalInput}
                disabled={isGroupPerMemberMode}
                onFocus={() => {
                  setCapitalFocused(true);
                  setCapitalInput(form.amount > 0 ? String(form.amount) : "");
                }}
                onBlur={() => {
                  setCapitalFocused(false);
                  setCapitalInput(formatMaskedNumber(form.amount));
                }}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCapitalInput(raw);
                  const nextAmount = parseMaskedNumber(raw);
                  setForm((s) => ({
                    ...s,
                    amount: nextAmount,
                    balance: isBalanceAuto ? nextAmount : s.balance,
                  }));
                }}
                required
              />
              {isGroupPerMemberMode && (
                <p className="text-xs text-slate-500">No modo "Valor por pessoa", o capital total e calculado automaticamente pela soma dos membros.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Saldo devedor (MT)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 180000 (valor que ainda falta pagar)"
                value={formatMaskedNumber(form.balance)}
                onChange={(e) => {
                  setIsBalanceAuto(false);
                  setForm((s) => ({ ...s, balance: parseMaskedNumber(e.target.value) }));
                }}
                required
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsBalanceAuto(true);
                    setForm((s) => ({ ...s, balance: s.amount }));
                  }}
                >
                  Auto: igual ao valor original
                </Button>
                <span className="text-xs text-slate-500">{isBalanceAuto ? "Auto ativo" : "Manual"}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Taxa de juro mensal (%)</Label>
              <Input
                type="number"
                min={0.01}
                max={100}
                step="0.01"
                placeholder="Ex: 30 ou 0.30 (ao mes)"
                value={form.rate > 0 ? form.rate : ""}
                onChange={(e) => setForm((s) => ({ ...s, rate: Number(e.target.value) || 0 }))}
                required
              />
              <p className="text-xs text-slate-500">Aceita 30 ou 0.30 para 30% ao mes. O juro mensal calcula o total do periodo.</p>
            </div>
            <div className="space-y-1">
              <Label>Custos administrativos</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={form.administrativeFeeMode}
                onChange={(e) => setForm((s) => ({ ...s, administrativeFeeMode: e.target.value as "isento" | "aplicar" }))}
              >
                <option value="isento">Isento</option>
                <option value="aplicar">Aplicar 2%</option>
              </select>
              <p className="text-xs text-slate-500">Quando aplicado, desconta 2% do capital no desembolso liquido.</p>
            </div>
            <div className="space-y-1">
              <Label>Resumo de desembolso</Label>
              <div className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm flex items-center">
                Capital: {formatMaskedNumber(Number(form.amount || 0)) || "0.00"} MT | Preparo: {formatMaskedNumber(administrativeFeeAmountPreview) || "0.00"} MT | Liquido: {formatMaskedNumber(disbursementNetAmountPreview) || "0.00"} MT
              </div>
            </div>
            <div className="space-y-1">
              <Label>Frequencia</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={form.paymentFrequency}
                onChange={(e) => setForm((s) => ({ ...s, paymentFrequency: e.target.value as Loan["paymentFrequency"] }))}
              >
                <option value="diario">Diario (somente dias uteis)</option>
                <option value="semanal">Semanal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="mensal">Mensal</option>
              </select>
              <p className="text-xs text-slate-500">A frequencia apenas divide o total calculado no periodo (ex.: semanal = 4x por mes, diario = 21 dias uteis/mes).</p>
            </div>
            <div className="space-y-1">
              <Label>Periodo (meses)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.periodMonths}
                onChange={(e) => setForm((s) => ({ ...s, periodMonths: Math.max(1, Number(e.target.value) || 1) }))}
                required
              />
              <p className="text-xs text-slate-500">Quantidade de meses do contrato (pode ser qualquer valor acima de 1).</p>
            </div>
            {form.paymentFrequency === "diario" && (
              <div className="md:col-span-2 rounded border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-800">Dias de pagamento</p>
                <p className="text-xs text-slate-600 mb-2">Selecione os dias uteis em que o cliente vai pagar.</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {WEEKDAY_OPTIONS.map((item) => {
                    const checked = form.paymentDays.includes(item.value);
                    return (
                      <label key={item.value} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm((prev) => {
                              const nextSet = new Set(prev.paymentDays);
                              if (e.target.checked) nextSet.add(item.value);
                              else nextSet.delete(item.value);
                              const nextDays = normalizePaymentDays(Array.from(nextSet));
                              return { ...prev, paymentDays: nextDays.length ? nextDays : [1, 2, 3, 4, 5] };
                            });
                          }}
                        />
                        {item.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="md:col-span-2 rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Previsao de calculo</p>
              {!paymentPreview ? (
                <p className="text-xs text-slate-500 mt-1">Informe valor, taxa e datas para simular.</p>
              ) : paymentPreview.payment !== null ? (
                <p className="text-sm text-slate-700 mt-1">
                  {paymentPreview.installments} parcela(s), juros {paymentPreview.mode}: {moneyFixed.format(paymentPreview.payment)} MT por parcela.
                </p>
              ) : (
                <p className="text-sm text-slate-700 mt-1">
                  {paymentPreview.installments} parcela(s), juros {paymentPreview.mode}: 1a {moneyFixed.format(paymentPreview.firstPayment)} MT / ultima {moneyFixed.format(paymentPreview.lastPayment)} MT.
                </p>
              )}
            </div>
            <div className="md:col-span-4 rounded border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                <p className="text-sm font-medium text-slate-800">Tabela de controle de pagamentos</p>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Dia de pagamento</TableHead>
                      <TableHead>Valor previsto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentDatesPreview.slice(0, 200).map((date, index) => (
                      <TableRow key={`${date.toISOString()}-${index}`}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{formatDateInput(date)}</TableCell>
                        <TableCell>{moneyFixed.format(paymentPreview?.payment || 0)} MT</TableCell>
                      </TableRow>
                    ))}
                    {paymentDatesPreview.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-slate-500 py-4">Preencha dados para gerar tabela.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            {editingId !== null && (
              <div className="space-y-1">
                <Label>Dias de atraso</Label>
                <Input type="number" min={0} placeholder="Ex: 0 (0 = em dia)" value={form.daysOverdue} onChange={(e) => setForm((s) => ({ ...s, daysOverdue: Number(e.target.value) }))} />
                <p className="text-xs text-slate-500">Informacao de historico do contrato.</p>
              </div>
            )}
            <div className="space-y-1">
              <Label>Data de desembolso</Label>
              <Input type="date" value={form.disbursed} onChange={(e) => setForm((s) => ({ ...s, disbursed: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <Label>Data de vencimento</Label>
              <Input
                type="date"
                value={form.maturity}
                onChange={(e) => {
                  setIsDateAuto(false);
                  setForm((s) => ({ ...s, maturity: e.target.value }));
                }}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Proximo pagamento</Label>
              <Input
                type="date"
                value={form.nextPayment}
                onChange={(e) => {
                  setIsDateAuto(false);
                  setForm((s) => ({ ...s, nextPayment: e.target.value }));
                }}
                required
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const disbursed = form.disbursed || formatDateInput(new Date());
                    const automaticDates = buildAutomaticDates(disbursed, form.periodMonths, form.paymentFrequency, form.paymentDays);
                    if (!automaticDates) return;
                    setIsDateAuto(true);
                    setForm((s) => ({ ...s, disbursed, nextPayment: automaticDates.nextPayment, maturity: automaticDates.maturity }));
                  }}
                >
                  Auto datas
                </Button>
                <span className="text-xs text-slate-500">{isDateAuto ? `Auto ativo (${form.periodMonths} meses)` : "Manual"}</span>
              </div>
            </div>
            <div className="md:col-span-4 flex gap-2">
              <Button disabled={saving} type="submit">{editingId ? "Atualizar Emprestimo" : "Criar Solicitacao"}</Button>
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showInstallmentsModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowInstallmentsModal(false);
            setInstallmentsPayload(null);
            setCollectionsPayload(null);
            setSelectedLoan(null);
            setInstallmentsFilter("all");
            setAuditPeriodFilter("all");
            setAuditUserFilter("all");
            setAuditActionFilter("all");
            setAuditSearchTerm("");
            setContractAuditPage(1);
            setInstallmentAuditPage(1);
            setPromiseForm({ promisedFor: "", promisedAmount: "", note: "" });
            setRenegotiationForm({ reason: "", proposedRate: "", proposedMaturity: "", note: "" });
            setFinancialEventForm({
              eventType: "abatimento",
              amount: "",
              note: "",
              restructureRate: "",
              restructureDailyPenaltyRate: "",
              restructureMethod: "price",
              restructureFrequency: "mensal",
              restructureNextPaymentOn: "",
              restructureMaturityOn: "",
            });
            return;
          }
          setShowInstallmentsModal(true);
        }}
      >
        <DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historico de Pagamentos do Credito</DialogTitle>
            <DialogDescription>
              {selectedLoan ? `Contrato ${selectedLoan.contractNo} - ${selectedLoan.client}` : "Detalhe das parcelas do credito."}
            </DialogDescription>
          </DialogHeader>

          {installmentsLoading ? (
            <p className="text-sm text-slate-600">Carregando cronograma...</p>
          ) : !installmentsPayload ? (
            <p className="text-sm text-red-700">Nao foi possivel carregar o historico deste contrato.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50">
                  <p className="text-xs text-emerald-700">Pagas</p>
                  <p className="text-2xl font-bold text-emerald-800">{installmentsPayload.summary.paid}</p>
                </div>
                <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
                  <p className="text-xs text-amber-700">Pendentes</p>
                  <p className="text-2xl font-bold text-amber-800">{installmentsPayload.summary.pending}</p>
                </div>
                <div className="p-4 rounded-lg border border-red-200 bg-red-50">
                  <p className="text-xs text-red-700">Em atraso</p>
                  <p className="text-2xl font-bold text-red-800">{installmentsPayload.summary.late}</p>
                </div>
                <div className="p-4 rounded-lg border border-blue-200 bg-blue-50">
                  <p className="text-xs text-blue-700">Total de parcelas</p>
                  <p className="text-2xl font-bold text-blue-800">{installmentsPayload.summary.total}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50">
                  <p className="text-xs text-emerald-700">Valor ja pago</p>
                  <p className="text-xl font-bold text-emerald-800">{money.format(installmentsPayload.summary.paidAmount)} MT</p>
                </div>
                <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
                  <p className="text-xs text-amber-700">Valor vigente (remanescente)</p>
                  <p className="text-xl font-bold text-amber-800">{money.format(installmentsPayload.summary.pendingAmount)} MT</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50">
                  <p className="text-xs text-emerald-700">Capital pago (historico)</p>
                  <p className="text-xl font-bold text-emerald-800">{money.format(installmentsPayload.summary.paidPrincipalAmount || 0)} MT</p>
                </div>
                <div className="p-4 rounded-lg border border-sky-200 bg-sky-50">
                  <p className="text-xs text-sky-700">Capital perdoado (abate)</p>
                  <p className="text-xl font-bold text-sky-800">{money.format(installmentsPayload.summary.forgivenPrincipalAmount || 0)} MT</p>
                </div>
                <div className="p-4 rounded-lg border border-purple-200 bg-purple-50">
                  <p className="text-xs text-purple-700">Mora perdoada</p>
                  <p className="text-xl font-bold text-purple-800">{money.format(installmentsPayload.summary.forgivenMoraAmount || 0)} MT</p>
                </div>
              </div>

              {installmentsPayload.creditState?.enabled && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-indigo-900">Estado do Credito em Grupo</p>
                      <p className="text-xs text-indigo-700">Pedido, pagamentos gerais/por pessoa e vigente em tabelas separadas.</p>
                    </div>
                    <div className="text-xs text-indigo-800">
                      Membros: <strong>{installmentsPayload.creditState.resumo.totalMembros}</strong> | Pagos: <strong>{installmentsPayload.creditState.resumo.membrosPagos}</strong> | Parciais: <strong>{installmentsPayload.creditState.resumo.membrosParciais}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-indigo-200 bg-white p-3">
                      <p className="text-xs text-indigo-700">Pago geral (contrato)</p>
                      <p className="text-lg font-bold text-indigo-900">{money.format(installmentsPayload.creditState.resumo.totalPagoGeral || 0)} MT</p>
                      <p className="text-[11px] text-slate-500">Nao gera divida individual por membro.</p>
                    </div>
                    <div className="rounded-lg border border-indigo-200 bg-white p-3">
                      <p className="text-xs text-indigo-700">Pago por pessoa</p>
                      <p className="text-lg font-bold text-indigo-900">{money.format(installmentsPayload.creditState.resumo.totalPagoPorPessoa || installmentsPayload.creditState.resumo.totalPago || 0)} MT</p>
                      <p className="text-[11px] text-slate-500">Usado para controlar saldo individual dos membros.</p>
                    </div>
                    <div className="rounded-lg border border-indigo-200 bg-white p-3">
                      <p className="text-xs text-indigo-700">Nao classificado</p>
                      <p className="text-lg font-bold text-indigo-900">{money.format(installmentsPayload.creditState.resumo.totalPagoNaoClassificado || 0)} MT</p>
                      <p className="text-[11px] text-slate-500">Pagamentos antigos sem classificacao de modo.</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
                    <div className="px-3 py-2 bg-indigo-100 border-b border-indigo-200 text-sm font-semibold text-indigo-900">Tabela 1: Pedido</div>
                    {installmentsPayload.creditState.request && (
                      <div className="px-3 py-2 text-xs text-slate-700 border-b border-slate-200">
                        Solicitacao #{installmentsPayload.creditState.request.id} | Produto: {installmentsPayload.creditState.request.product || "-"} | Valor pedido: {money.format(installmentsPayload.creditState.request.requestedAmount)} MT | Status: {installmentsPayload.creditState.request.status}
                      </div>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Membro</TableHead>
                          <TableHead>ID Cliente</TableHead>
                          <TableHead>Valor Pedido</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(installmentsPayload.creditState.pedidoRows || []).map((row) => (
                          <TableRow key={`pedido-${row.allocationId}`}>
                            <TableCell>{row.memberName}</TableCell>
                            <TableCell>{row.memberClientId ? `#${row.memberClientId}` : "-"}</TableCell>
                            <TableCell>{money.format(row.requestedAmount)} MT</TableCell>
                          </TableRow>
                        ))}
                        {(installmentsPayload.creditState.pedidoRows || []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-xs text-slate-500 py-4">Sem membros no pedido.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
                    <div className="px-3 py-2 bg-indigo-100 border-b border-indigo-200 text-sm font-semibold text-indigo-900">Tabela 2A: Pagamentos gerais (contrato)</div>
                    <div className="px-3 py-2 text-xs text-slate-700 border-b border-slate-200">
                      No modo geral o pagamento e registrado no contrato. Por isso, esta tabela nao mostra divida individual por membro.
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Data</TableHead>
                          <TableHead>Valor recebido</TableHead>
                          <TableHead>Valor aplicado</TableHead>
                          <TableHead>Remanescente</TableHead>
                          <TableHead>Classificacao</TableHead>
                          <TableHead>Operador</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...groupGeneralPaymentEvents, ...groupUnknownPaymentEvents].map((row) => (
                          <TableRow key={`pagamento-geral-${row.id}`}>
                            <TableCell>{row.paymentDate}</TableCell>
                            <TableCell>{money.format(row.amountReceived)} MT</TableCell>
                            <TableCell>{money.format(row.amountApplied)} MT</TableCell>
                            <TableCell>{money.format(row.unappliedAmount)} MT</TableCell>
                            <TableCell className="text-xs uppercase">
                              {row.groupPaymentMode === "general" ? "GERAL" : "NAO CLASSIFICADO"}
                            </TableCell>
                            <TableCell>{row.createdByName}</TableCell>
                          </TableRow>
                        ))}
                        {[...groupGeneralPaymentEvents, ...groupUnknownPaymentEvents].length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-xs text-slate-500 py-4">Sem pagamentos gerais registrados para este contrato.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
                    <div className="px-3 py-2 bg-indigo-100 border-b border-indigo-200 text-sm font-semibold text-indigo-900">Tabela 2B: Pagamentos por pessoa (dívida individual)</div>
                    <div className="px-3 py-2 text-xs text-slate-700 border-b border-slate-200">
                      Esta tabela controla apenas pagamentos por membro. Pagamentos gerais nao reduzem nem expoem divida individual aqui.
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Membro</TableHead>
                          <TableHead>Alocado</TableHead>
                          <TableHead>Pago</TableHead>
                          <TableHead>Pendente</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(installmentsPayload.creditState.pagamentosRows || []).map((row) => (
                          <TableRow key={`pagamento-${row.allocationId}`}>
                            <TableCell>{row.memberName}</TableCell>
                            <TableCell>{money.format(row.allocatedAmount)} MT</TableCell>
                            <TableCell>{money.format(row.paidAmount)} MT</TableCell>
                            <TableCell>{money.format(row.remainingAmount)} MT</TableCell>
                            <TableCell className="uppercase text-xs">{row.status}</TableCell>
                          </TableRow>
                        ))}
                        {(installmentsPayload.creditState.pagamentosRows || []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-xs text-slate-500 py-4">Sem pagamentos por pessoa registrados.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    {groupIndividualPaymentEvents.length > 0 && (
                      <div className="px-3 py-2 border-t border-slate-200 text-xs text-indigo-800 bg-indigo-50">
                        Eventos classificados como pagamento por pessoa: <strong>{groupIndividualPaymentEvents.length}</strong> | Total aplicado: <strong>{money.format(groupCreditState?.resumo.totalPagoPorPessoa || 0)} MT</strong>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
                    <div className="px-3 py-2 bg-indigo-100 border-b border-indigo-200 text-sm font-semibold text-indigo-900">Tabela 3: Vigente (Parcelas nao pagas)</div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Parcela</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Vigente</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(installmentsPayload.creditState.vigenteRows || []).map((row) => (
                          <TableRow key={`vigente-${row.installmentId}`}>
                            <TableCell>#{row.installmentNo}</TableCell>
                            <TableCell>{row.dueDate}</TableCell>
                            <TableCell>{money.format(getVigenteAmount(row))} MT</TableCell>
                            <TableCell className="uppercase text-xs">{row.status}</TableCell>
                          </TableRow>
                        ))}
                        {(installmentsPayload.creditState.vigenteRows || []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-xs text-emerald-700 py-4">Sem parcelas pendentes ou em atraso.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Receber pagamento (reembolso)</p>
                  <p className="text-xs text-blue-700">Prioridade automatica: mora da prestacao vencida e depois a prestacao mais antiga.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label>Valor recebido (MT)</Label>
                    <Input
                      value={paymentAmountInput}
                      onChange={(e) => setPaymentAmountInput(formatMaskedNumber(parseMaskedNumber(e.target.value)))}
                      placeholder="Ex: 3,250.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Modo de alocacao</Label>
                    <select
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full"
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as "loan" | "client_auto")}
                    >
                      <option value="loan">Somente este contrato</option>
                      <option value="client_auto">Automatico (todos do cliente)</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full" onClick={handleApplyRepayment} disabled={savingRepayment}>
                      {savingRepayment ? "A aplicar..." : "Aplicar pagamento"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Filtro de parcelas</Label>
                  <select
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                    value={installmentsFilter}
                    onChange={(e) => setInstallmentsFilter(e.target.value as "all" | "paid" | "pending" | "late")}
                  >
                    <option value="all">Todas</option>
                    <option value="paid">Pagas</option>
                    <option value="pending">Pendentes</option>
                    <option value="late">Em atraso</option>
                  </select>
                </div>
                <Button variant="outline" onClick={handleExportInstallmentsPdf}>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar PDF
                </Button>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Parcela</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Prestacao</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Juros</TableHead>
                      <TableHead>Saldo apos parcela</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Acao</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInstallments.map((installment) => (
                      <TableRow key={installment.id}>
                        <TableCell className="font-medium">#{installment.installmentNo}</TableCell>
                        <TableCell>{installment.dueDate}</TableCell>
                        <TableCell>{money.format(installment.paymentAmount)} MT</TableCell>
                        <TableCell>{money.format(installment.principalAmount)} MT</TableCell>
                        <TableCell>{money.format(installment.interestAmount)} MT</TableCell>
                        <TableCell>{money.format(installment.balanceAfter)} MT</TableCell>
                        <TableCell>
                          {installment.status === "paid" && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Paga</Badge>}
                          {installment.status === "pending" && <Badge className="bg-blue-100 text-blue-800 border-blue-200">Pendente</Badge>}
                          {installment.status === "late" && <Badge className="bg-red-100 text-red-800 border-red-200">Em Atraso</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={installment.status === "paid" || payingInstallmentId === installment.id}
                              onClick={() => handlePayInstallment(installment.id)}
                            >
                              {installment.status === "paid" ? "Pago" : payingInstallmentId === installment.id ? "A guardar..." : "Marcar pago"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={installment.status === "late" || payingInstallmentId === installment.id}
                              onClick={() => handleChangeInstallmentStatus(installment.id, "late")}
                            >
                              Em atraso
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={installment.status === "pending" || payingInstallmentId === installment.id}
                              onClick={() => handleChangeInstallmentStatus(installment.id, "pending")}
                            >
                              Reabrir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredInstallments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-slate-500 py-6">
                          Nenhuma parcela encontrada para o filtro selecionado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Cobranca e Mora Operacional</h3>
                  <p className="text-xs text-slate-600 mt-1">Calculo diario de mora, regua de cobranca, promessas de pagamento e renegociacao.</p>
                </div>
                {collectionsLoading ? (
                  <div className="p-4 text-sm text-slate-600">Carregando dados operacionais...</div>
                ) : !collectionsPayload ? (
                  <div className="p-4 text-sm text-red-700">Nao foi possivel carregar o modulo de cobranca.</div>
                ) : (
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <p className="text-xs text-slate-600">Dias em mora</p>
                        <p className="text-2xl font-bold text-slate-900">{collectionsPayload.loan.daysOverdue}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-rose-200 bg-rose-50">
                        <p className="text-xs text-rose-700">Mora acumulada</p>
                        <p className="text-2xl font-bold text-rose-800">{money.format(collectionsPayload.loan.moraAccrued)} MT</p>
                      </div>
                      <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                        <p className="text-xs text-amber-700">Mora diaria</p>
                        <p className="text-2xl font-bold text-amber-800">{money.format(collectionsPayload.loan.dailyMora)} MT</p>
                      </div>
                      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
                        <p className="text-xs text-blue-700">Faixa</p>
                        <p className="text-2xl font-bold text-blue-800">{collectionsPayload.loan.delinquencyBucket}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                        <p className="text-xs text-emerald-700">Capital pago</p>
                        <p className="text-2xl font-bold text-emerald-800">{money.format(collectionsPayload.loan.totalPaidPrincipal || 0)} MT</p>
                      </div>
                      <div className="p-3 rounded-lg border border-sky-200 bg-sky-50">
                        <p className="text-xs text-sky-700">Capital perdoado</p>
                        <p className="text-2xl font-bold text-sky-800">{money.format(collectionsPayload.loan.totalForgivenPrincipal || 0)} MT</p>
                      </div>
                      <div className="p-3 rounded-lg border border-purple-200 bg-purple-50">
                        <p className="text-xs text-purple-700">Mora perdoada</p>
                        <p className="text-2xl font-bold text-purple-800">{money.format(collectionsPayload.loan.totalForgivenMora || 0)} MT</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 bg-white">
                      <p className="text-sm font-semibold text-slate-900">Regua de cobranca: {collectionsPayload.loan.collectionStage.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{collectionsPayload.loan.collectionStage.action}</p>
                      <p className="text-xs text-rose-700 mt-2">Mora perdoada acumulada: {money.format(collectionsPayload.loan.moraWaivedTotal)} MT</p>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-3">
                      <h4 className="font-semibold text-slate-900">Fluxos Financeiros Avancados</h4>
                      <form className="grid grid-cols-1 md:grid-cols-4 gap-2" onSubmit={handleApplyFinancialEvent}>
                        <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={financialEventForm.eventType} onChange={(e) => setFinancialEventForm((s) => ({ ...s, eventType: e.target.value as typeof s.eventType }))}>
                          <option value="estorno">Estorno</option>
                          <option value="abatimento">Abatimento</option>
                          <option value="capitalizacao">Capitalizacao</option>
                          <option value="perdao_mora">Perdao de Mora</option>
                          <option value="liquidacao_antecipada" disabled={!canRunCriticalFinancialEvents}>Liquidacao Antecipada</option>
                          <option value="reestruturacao_contrato" disabled={!canRunCriticalFinancialEvents}>Reestruturacao de Contrato</option>
                        </select>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="Valor (quando aplicavel)"
                          value={financialEventForm.amount}
                          onChange={(e) => setFinancialEventForm((s) => ({ ...s, amount: formatMaskedNumber(parseMaskedNumber(e.target.value)) }))}
                          disabled={financialEventForm.eventType === "liquidacao_antecipada" || financialEventForm.eventType === "reestruturacao_contrato"}
                        />
                        <Input placeholder={["liquidacao_antecipada", "reestruturacao_contrato"].includes(financialEventForm.eventType) ? "Justificativa obrigatoria" : "Nota do evento"} value={financialEventForm.note} onChange={(e) => setFinancialEventForm((s) => ({ ...s, note: e.target.value }))} required={["liquidacao_antecipada", "reestruturacao_contrato"].includes(financialEventForm.eventType)} />
                        <Button type="submit" disabled={savingFinancialEvent}>{savingFinancialEvent ? "A aplicar..." : "Aplicar Evento"}</Button>

                        {financialEventForm.eventType === "reestruturacao_contrato" && (
                          <>
                            <Input type="number" min={0} step="0.01" placeholder="Nova taxa de juro (%)" value={financialEventForm.restructureRate} onChange={(e) => setFinancialEventForm((s) => ({ ...s, restructureRate: e.target.value }))} />
                            <Input type="number" min={0} step="0.0001" placeholder="Nova taxa diaria mora (%)" value={financialEventForm.restructureDailyPenaltyRate} onChange={(e) => setFinancialEventForm((s) => ({ ...s, restructureDailyPenaltyRate: e.target.value }))} />
                            <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={financialEventForm.restructureMethod} onChange={(e) => setFinancialEventForm((s) => ({ ...s, restructureMethod: e.target.value as typeof s.restructureMethod }))}>
                              <option value="price">Price</option>
                              <option value="sac">SAC</option>
                              <option value="americano">Americano</option>
                            </select>
                            <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={financialEventForm.restructureFrequency} onChange={(e) => setFinancialEventForm((s) => ({ ...s, restructureFrequency: e.target.value as typeof s.restructureFrequency }))}>
                              <option value="diario">Diario</option>
                              <option value="semanal">Semanal</option>
                              <option value="quinzenal">Quinzenal</option>
                              <option value="mensal">Mensal</option>
                            </select>
                            <Input type="date" value={financialEventForm.restructureNextPaymentOn} onChange={(e) => setFinancialEventForm((s) => ({ ...s, restructureNextPaymentOn: e.target.value }))} />
                            <Input type="date" value={financialEventForm.restructureMaturityOn} onChange={(e) => setFinancialEventForm((s) => ({ ...s, restructureMaturityOn: e.target.value }))} />
                          </>
                        )}
                      </form>
                      {!canRunCriticalFinancialEvents && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          Perfil atual: apenas eventos criticos (liquidacao antecipada/reestruturacao) exigem perfil manager ou admin.
                        </p>
                      )}
                      <div className="space-y-2 max-h-56 overflow-auto">
                        {(collectionsPayload.financialEvents || []).map((event) => (
                          <div key={event.id} className="p-2 rounded border border-slate-200 bg-slate-50">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium capitalize">{event.eventType.replace("_", " ")}</p>
                              <p className="text-xs text-slate-600">{new Date(event.createdAt).toLocaleDateString("pt-PT")}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className="capitalize">{event.workflowStatus}</Badge>
                              <p className="text-xs text-slate-600">Valor: {event.amount !== null ? `${money.format(event.amount)} MT` : "N/A"} | Por: {event.createdByName}</p>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{event.note || "Sem nota"}</p>
                            {event.workflowStatus === "pending" && event.eventType === "reestruturacao_contrato" && canRunCriticalFinancialEvents && currentUser?.id !== event.createdByUserId && (
                              <div className="mt-2 space-y-2">
                                <Input
                                  placeholder="Justificativa obrigatoria da revisao (aprovacao/rejeicao)"
                                  value={financialEventReviewNotes[event.id] || ""}
                                  onChange={(e) => setFinancialEventReviewNotes((prev) => ({ ...prev, [event.id]: e.target.value }))}
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" disabled={reviewingFinancialEventId === event.id} onClick={() => handleReviewFinancialEvent(event.id, "approve")}>Aprovar</Button>
                                  <Button size="sm" variant="outline" disabled={reviewingFinancialEventId === event.id} onClick={() => handleReviewFinancialEvent(event.id, "reject")}>Rejeitar</Button>
                                </div>
                              </div>
                            )}
                            {event.reviewedAt && (
                              <p className="text-xs text-slate-500 mt-2">
                                Revisado por {event.reviewedByName || "Sistema"} em {new Date(event.reviewedAt).toLocaleDateString("pt-PT")} {event.reviewNote ? `| Nota: ${event.reviewNote}` : ""}
                              </p>
                            )}
                          </div>
                        ))}
                        {(collectionsPayload.financialEvents || []).length === 0 && <p className="text-xs text-slate-500">Sem eventos financeiros aplicados.</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-3">
                        <h4 className="font-semibold text-slate-900">Promessas de Pagamento</h4>
                        <form className="grid grid-cols-1 md:grid-cols-3 gap-2" onSubmit={handleCreatePromise}>
                          <Input type="date" value={promiseForm.promisedFor} onChange={(e) => setPromiseForm((s) => ({ ...s, promisedFor: e.target.value }))} required />
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="Valor prometido"
                            value={promiseForm.promisedAmount}
                            onChange={(e) => setPromiseForm((s) => ({ ...s, promisedAmount: formatMaskedNumber(parseMaskedNumber(e.target.value)) }))}
                            required
                          />
                          <Input placeholder="Nota da promessa" value={promiseForm.note} onChange={(e) => setPromiseForm((s) => ({ ...s, note: e.target.value }))} />
                          <div className="md:col-span-3">
                            <Button size="sm" type="submit" disabled={savingPromise}>{savingPromise ? "A salvar..." : "Registrar Promessa"}</Button>
                          </div>
                        </form>
                        <div className="space-y-2 max-h-56 overflow-auto">
                          {(collectionsPayload.promises || []).map((item) => (
                            <div key={item.id} className="p-2 rounded border border-slate-200 bg-slate-50">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">{item.promisedFor} - {money.format(item.promisedAmount)} MT</p>
                                <Badge className="capitalize">{item.status}</Badge>
                              </div>
                              <p className="text-xs text-slate-600 mt-1">{item.note || "Sem nota"} - {item.createdByName}</p>
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" variant="outline" onClick={() => handleUpdatePromiseStatus(item.id, "fulfilled")} disabled={item.status === "fulfilled"}>Cumprida</Button>
                                <Button size="sm" variant="outline" onClick={() => handleUpdatePromiseStatus(item.id, "broken")} disabled={item.status === "broken"}>Quebrada</Button>
                                <Button size="sm" variant="outline" onClick={() => handleUpdatePromiseStatus(item.id, "cancelled")} disabled={item.status === "cancelled"}>Cancelar</Button>
                              </div>
                            </div>
                          ))}
                          {(collectionsPayload.promises || []).length === 0 && <p className="text-xs text-slate-500">Sem promessas registradas.</p>}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-3">
                        <h4 className="font-semibold text-slate-900">Renegociacao</h4>
                        <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleCreateRenegotiation}>
                          <Input placeholder="Motivo da renegociacao" value={renegotiationForm.reason} onChange={(e) => setRenegotiationForm((s) => ({ ...s, reason: e.target.value }))} required />
                          <Input type="number" min={0} step="0.01" placeholder="Nova taxa (%)" value={renegotiationForm.proposedRate} onChange={(e) => setRenegotiationForm((s) => ({ ...s, proposedRate: e.target.value }))} />
                          <Input type="date" value={renegotiationForm.proposedMaturity} onChange={(e) => setRenegotiationForm((s) => ({ ...s, proposedMaturity: e.target.value }))} />
                          <Input placeholder="Nota da renegociacao" value={renegotiationForm.note} onChange={(e) => setRenegotiationForm((s) => ({ ...s, note: e.target.value }))} />
                          <div className="md:col-span-2">
                            <Button size="sm" type="submit" disabled={savingRenegotiation}>{savingRenegotiation ? "A salvar..." : "Registrar Renegociacao"}</Button>
                          </div>
                        </form>
                        <div className="space-y-2 max-h-56 overflow-auto">
                          {(collectionsPayload.renegotiations || []).map((item) => (
                            <div key={item.id} className="p-2 rounded border border-slate-200 bg-slate-50">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">{item.reason}</p>
                                <Badge className="capitalize">{item.status}</Badge>
                              </div>
                              <p className="text-xs text-slate-600 mt-1">Por: {item.createdByName}</p>
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" variant="outline" onClick={() => handleUpdateRenegotiationStatus(item.id, "approved")} disabled={item.status === "approved"}>Aprovar</Button>
                                <Button size="sm" variant="outline" onClick={() => handleUpdateRenegotiationStatus(item.id, "rejected")} disabled={item.status === "rejected"}>Rejeitar</Button>
                                <Button size="sm" variant="outline" onClick={() => handleUpdateRenegotiationStatus(item.id, "executed")} disabled={item.status === "executed"}>Executar</Button>
                              </div>
                            </div>
                          ))}
                          {(collectionsPayload.renegotiations || []).length === 0 && <p className="text-xs text-slate-500">Sem renegociacoes registradas.</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Auditoria do Contrato</h3>
                  <p className="text-xs text-slate-600 mt-1">Registo de criacao, edicao e exclusao do contrato com utilizador e data.</p>
                </div>
                <div className="px-4 py-3 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-sm">Periodo</Label>
                    <select
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                      value={auditPeriodFilter}
                      onChange={(e) => {
                        setAuditPeriodFilter(e.target.value as "all" | "today" | "7d" | "30d" | "90d");
                        setContractAuditPage(1);
                        setInstallmentAuditPage(1);
                      }}
                    >
                      <option value="all">Todos</option>
                      <option value="today">Hoje</option>
                      <option value="7d">Ultimos 7 dias</option>
                      <option value="30d">Ultimos 30 dias</option>
                      <option value="90d">Ultimos 90 dias</option>
                    </select>
                    <Label className="text-sm">Utilizador</Label>
                    <select
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                      value={auditUserFilter}
                      onChange={(e) => {
                        setAuditUserFilter(e.target.value);
                        setContractAuditPage(1);
                        setInstallmentAuditPage(1);
                      }}
                    >
                      <option value="all">Todos</option>
                      {auditUsers.map((user) => (
                        <option key={user} value={user}>{user}</option>
                      ))}
                    </select>
                    <Label className="text-sm">Acao</Label>
                    <select
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                      value={auditActionFilter}
                      onChange={(e) => {
                        setAuditActionFilter(e.target.value as "all" | "create" | "update" | "delete" | "mark_paid" | "manual_status_change");
                        setContractAuditPage(1);
                        setInstallmentAuditPage(1);
                      }}
                    >
                      <option value="all">Todas</option>
                      <option value="create">Criacao contrato</option>
                      <option value="update">Edicao contrato</option>
                      <option value="delete">Exclusao contrato</option>
                      <option value="mark_paid">Marcar pago parcela</option>
                      <option value="manual_status_change">Alteracao manual parcela</option>
                    </select>
                    <Label className="text-sm">Busca</Label>
                    <Input
                      className="h-10 w-60"
                      placeholder="Contrato, utilizador, acao..."
                      value={auditSearchTerm}
                      onChange={(e) => {
                        setAuditSearchTerm(e.target.value);
                        setContractAuditPage(1);
                        setInstallmentAuditPage(1);
                      }}
                    />
                  </div>
                  <Button variant="outline" onClick={handleExportAuditPdf}>
                    <Download className="w-4 h-4 mr-2" />
                    Exportar Auditoria PDF
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Data</TableHead>
                      <TableHead>Contrato</TableHead>
                      <TableHead>Acao</TableHead>
                      <TableHead>Utilizador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contractAuditRows.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{new Date(event.changedAt).toLocaleDateString("pt-PT")}</TableCell>
                        <TableCell className="font-mono">{event.contractNo}</TableCell>
                        <TableCell className="uppercase text-xs">{contractActionLabel(event.action)}</TableCell>
                        <TableCell>{event.changedByName || "Sistema"}</TableCell>
                      </TableRow>
                    ))}
                    {contractAuditRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">
                          Ainda nao existem alteracoes auditadas de contrato.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Pagina {contractAuditPagination.page} de {contractAuditPagination.totalPages}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={contractAuditPagination.page <= 1} onClick={() => setContractAuditPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                    <Button size="sm" variant="outline" disabled={contractAuditPagination.page >= contractAuditPagination.totalPages} onClick={() => setContractAuditPage((p) => Math.min(contractAuditPagination.totalPages, p + 1))}>Proxima</Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-900">Auditoria de Alteracoes das Parcelas</h3>
                  <p className="text-xs text-slate-600 mt-1">Registo completo de quem alterou status, quando e qual foi a mudanca.</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Data</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Alteracao</TableHead>
                      <TableHead>Acao</TableHead>
                      <TableHead>Utilizador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installmentAuditRows.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{new Date(event.changedAt).toLocaleDateString("pt-PT")}</TableCell>
                        <TableCell>#{event.installmentNo}</TableCell>
                        <TableCell className="capitalize">{statusLabel(event.previousStatus)} -&gt; {statusLabel(event.newStatus)}</TableCell>
                        <TableCell className="text-xs uppercase">{installmentActionLabel(event.action)}</TableCell>
                        <TableCell>{event.changedByName || "Sistema"}</TableCell>
                      </TableRow>
                    ))}
                    {installmentAuditRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-slate-500 py-6">
                          Ainda nao existem alteracoes auditadas para este contrato.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Pagina {installmentAuditPagination.page} de {installmentAuditPagination.totalPages}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={installmentAuditPagination.page <= 1} onClick={() => setInstallmentAuditPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                    <Button size="sm" variant="outline" disabled={installmentAuditPagination.page >= installmentAuditPagination.totalPages} onClick={() => setInstallmentAuditPage((p) => Math.min(installmentAuditPagination.totalPages, p + 1))}>Proxima</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total de Emprestimos", value: payload?.stats.total || 0, icon: CreditCard, color: "blue" },
          { label: "Em Dia", value: payload?.stats.active || 0, icon: CheckCircle2, color: "emerald" },
          { label: "Atencao (1-30d)", value: payload?.stats.warning || 0, icon: Clock, color: "amber" },
          { label: "Atraso (>30d)", value: payload?.stats.overdue || 0, icon: AlertTriangle, color: "red" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`p-5 bg-gradient-to-br from-${stat.color}-50 to-${stat.color}-100 rounded-xl border border-${stat.color}-200`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-${stat.color}-500 rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-slate-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="active">Em Dia</TabsTrigger>
          <TabsTrigger value="warning">Atencao</TabsTrigger>
          <TabsTrigger value="overdue">Em Atraso</TabsTrigger>
        </TabsList>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input placeholder="Pesquisar por cliente ou contrato..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <select
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            value={loanTypeFilter}
            onChange={(e) => setLoanTypeFilter(e.target.value as "all" | "singular" | "grupo" | "empresa")}
          >
            <option value="all">Todos os tipos</option>
            <option value="singular">Singular</option>
            <option value="grupo">Grupo</option>
            <option value="empresa">Empresa</option>
          </select>
          <Button variant="outline" onClick={() => setSuccess(`Filtro aplicado para "${searchTerm || "todos"}".`)}>
            <Filter className="w-4 h-4 mr-2" />
            Filtros
          </Button>
          <Button variant="outline" onClick={exportLoansPdf}>
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={exportLoansExcel}>
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel (CSV)
          </Button>
        </div>

        <TabsContent value="all" className="mt-0">{renderTable(visibleLoans)}</TabsContent>
        <TabsContent value="active" className="mt-0">{renderTable(visibleLoans.filter((loan) => loan.status === "active" && loan.daysOverdue === 0))}</TabsContent>
        <TabsContent value="warning" className="mt-0">{renderTable(visibleLoans.filter((loan) => loan.status === "warning" || (loan.daysOverdue > 0 && loan.daysOverdue <= 30)))}</TabsContent>
        <TabsContent value="overdue" className="mt-0">{renderTable(visibleLoans.filter((loan) => loan.status === "overdue" || loan.daysOverdue > 30))}</TabsContent>
      </Tabs>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-3">Carteira Total</h3>
          <p className="text-3xl font-bold text-blue-700">{money.format(payload?.totals.portfolio || 0)} MT</p>
          <p className="text-sm text-blue-600 mt-1">Valor desembolsado</p>
        </div>
        <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
          <h3 className="font-semibold text-emerald-900 mb-3">Saldo em Aberto</h3>
          <p className="text-3xl font-bold text-emerald-700">{money.format(payload?.totals.balance || 0)} MT</p>
          <p className="text-sm text-emerald-600 mt-1">Exposicao atual</p>
        </div>
        <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200">
          <h3 className="font-semibold text-amber-900 mb-3">Em Atraso</h3>
          <p className="text-3xl font-bold text-amber-700">{money.format(payload?.totals.overdueValue || 0)} MT</p>
          <p className="text-sm text-amber-600 mt-1">Saldo vencido</p>
        </div>
        <div className="p-5 bg-gradient-to-br from-rose-50 to-red-50 rounded-xl border border-rose-200">
          <h3 className="font-semibold text-rose-900 mb-3">Mora Acumulada</h3>
          <p className="text-3xl font-bold text-rose-700">{money.format(payload?.totals.moraTotal || 0)} MT</p>
          <p className="text-sm text-rose-600 mt-1">Calculada diariamente</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Quebra por Faixas de Mora</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {["0", "1-30", "31-60", "61-90", "90+"].map((bucket) => {
            const data = payload?.totals.bucketBreakdown?.[bucket] || { count: 0, balance: 0, mora: 0 };
            return (
              <div key={bucket} className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <p className="text-xs text-slate-600">Faixa {bucket} dias</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{data.count}</p>
                <p className="text-xs text-slate-600 mt-1">Saldo: {money.format(data.balance)} MT</p>
                <p className="text-xs text-rose-700">Mora: {money.format(data.mora)} MT</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-900 font-medium">Aba Empréstimos simplificada</p>
        <p className="text-sm text-blue-700 mt-1">
          Fluxos de pagamentos, reembolsos e cobranca foram concentrados na aba "Pagamentos e Reembolsos".
        </p>
      </div>
    </div>
  );
}
