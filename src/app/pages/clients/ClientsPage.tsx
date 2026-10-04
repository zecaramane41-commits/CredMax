import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Filter, Download, Users, Building2, UserCheck, Edit, Trash2, ClipboardCheck, ShieldCheck, Shield, FileUp, FileCheck, AlertTriangle, CreditCard, ChevronRight, ChevronDown, Eye, Printer, DollarSign, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/api";
import { listCarteiras } from "../../lib/carteiras";
import { getActiveCompanyId, getToken } from "../../lib/auth";
import { downloadTextFile, toCsv } from "../../lib/download";
import { formatCurrencyInput, formatCurrencyMT, parseCurrencyInput } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";
import ClientCreditDetails from "../../components/clients/ClientCreditDetails";
import ClientCreditsModal from "../../components/clients/ClientCreditsModal";
import { fetchClientCreditProfile } from "../../lib/notifications";
import type { ClientCreditProfile } from "../../lib/notifications";
import {
  MOZAMBIQUE_DOCUMENT_OPTIONS,
  MOZAMBIQUE_PROVINCES,
  getMozDistrictsByProvince,
  getMozDocumentInputConfig,
  normalizeMozDocumentNumber,
  normalizeMozNuit,
  validateMozDocumentNumber,
  validateMozNuit,
} from "../../lib/mozambique";

type Client = {
  id: number;
  name: string;
  type: "singular" | "grupo" | "empresa";
  nuit: string;
  phone: string;
  email: string;
  phoneAlt: string;
  documentType: string;
  documentNumber: string;
  birthDate: string;
  gender: string;
  maritalStatus: string;
  nationality: string;
  province: string;
  city: string;
  district: string;
  neighborhood: string;
  addressLine: string;
  houseNumber: string;
  occupation: string;
  employerName: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  businessName: string;
  businessSector: string;
  groupName: string;
  groupDescription: string;
  groupLeaderName: string;
  groupMembers: Array<{ id: number; memberClientId: number | null; memberName: string; allocationAmount: number }>;
  registrationDate: string;
  notes: string;
  score: number;
  status: string;
  carteiraId: number | null;
  carteiraNome: string;
  loans: number;
  debt: number;
};

type Guarantor = {
  id: number;
  name: string;
  nuit: string;
  phone: string;
  clientId: number | null;
  clientName: string;
  guaranteedAmount: number;
  activeGuarantees: number;
};

type Collateral = {
  id: number;
  clientId: number | null;
  clientName: string;
  collateralType: string;
  description: string;
  estimatedValue: number;
  documentRef: string;
  status: "active" | "released";
  createdAt: string;
};

type CollateralDraftRow = {
  rowKey: string;
  id?: number;
  collateralType: string;
  description: string;
  estimatedValue: number;
  documentRef: string;
  status: "active" | "released";
};

type ClientsResponse = {
  stats: { total: number; singular: number; grupo: number; empresa: number; guarantors: number; collaterals: number };
  clients: Client[];
  guarantors: Guarantor[];
  collaterals: Collateral[];
};

type EvaluationHistoryItem = {
  id: number;
  clientId: number;
  analystUserId: number | null;
  analystName: string;
  finalScore: number;
  decision: "Aprovado" | "Condicional" | "Reprovado";
  recommendation: string;
  reasons: string[];
  note: string;
  payloadSnapshot: {
    monthlyIncome?: number;
    monthlyExpenses?: number;
    disposableIncome?: number;
    debt?: number;
    debtToIncome?: number;
    loans?: number;
    score?: number;
    status?: string;
  };
  createdAt: string;
};

type DocumentChecklistItem = {
  type: string;
  label: string;
  required: boolean;
  status: "missing" | "expired" | "expiring" | "valid";
  isCompliant: boolean;
  document: ClientDocumentVersion | null;
};

type ClientDocumentVersion = {
  id: number;
  clientId: number;
  docType: string;
  title: string;
  versionNo: number;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  issuedOn: string | null;
  expiresOn: string | null;
  status: "expired" | "expiring" | "valid";
  note: string;
  uploadedByUserId: number | null;
  uploadedByName: string;
  uploadedAt: string;
};

type ClientDocumentsResponse = {
  client: { id: number; name: string };
  summary: {
    totalVersions: number;
    requiredItems: number;
    compliantItems: number;
    missingItems: number;
    expiredItems: number;
    checklistCompleted: boolean;
  };
  checklist: DocumentChecklistItem[];
  latestByType: ClientDocumentVersion[];
  versions: ClientDocumentVersion[];
};

const money = new Intl.NumberFormat("pt-PT");
const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" });
const MAX_NUIT_LENGTH = 9;
const COUNTRY_PREFIX = "+258";
const MAX_PHONE_LOCAL_LENGTH = 9;
const MAX_DOCUMENT_MB = 10;
const getTodayIso = () => new Date().toISOString().slice(0, 10);
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const DOCUMENT_TYPE_OPTIONS = [
  { value: "bi", label: "BI" },
  { value: "comprovativo_residencia", label: "Comprovativo de Residencia" },
  { value: "comprovativo_renda", label: "Comprovativo de Renda" },
  { value: "contrato_assinado", label: "Contrato Assinado" },
  { value: "outro", label: "Outro" },
];

type ProfessionalIncomeSource = "negociante" | "funcionario";

type ProfessionalCreditFormState = {
  incomeSource: ProfessionalIncomeSource;
  requestedAmountInput: string;
  periodMonths: string;
  monthlyRatePercent: string;
  salaryCommitmentPercent: string;
  salaryOtherIncomeInput: string;
  payrollDiscountsInput: string;
  existingDebtServiceInput: string;
  businessSalesInput: string;
  businessPurchasesInput: string;
  businessOperatingExpensesInput: string;
  businessOtherIncomeInput: string;
  stockTotalInput: string;
  stockAvailableInput: string;
  cashAvailableInput: string;
  receivablesInput: string;
  payablesInput: string;
  otherLiabilitiesInput: string;
};

type ProfessionalCreditAnalysis = {
  client: Client;
  incomeSource: ProfessionalIncomeSource;
  inferredIncomeSource: ProfessionalIncomeSource;
  requestedAmount: number;
  periodMonths: number;
  monthlyRatePercent: number;
  estimatedInstallment: number;
  totalRepayable: number;
  salaryBase: number;
  salaryCommitmentPercent: number;
  salaryPolicyCapacity: number;
  salaryOtherIncome: number;
  payrollDiscounts: number;
  businessSales: number;
  businessPurchases: number;
  grossProfit: number;
  grossMargin: number;
  businessOperatingExpenses: number;
  netProfit: number;
  netMargin: number;
  businessOtherIncome: number;
  existingDebt: number;
  existingDebtService: number;
  debtServiceTotal: number;
  paymentCapacity: number;
  capacityCoverage: number;
  debtServiceCoverage: number;
  debtToIncome: number;
  stockTotal: number;
  stockAvailable: number;
  cashAvailable: number;
  receivables: number;
  payables: number;
  otherLiabilities: number;
  currentAssets: number;
  availableLiquidity: number;
  currentRatio: number;
  collateralTotal: number;
  patrimonialCoverageBase: number;
  patrimonialCoverage: number;
  finalScore: number;
  decision: "Aprovado" | "Condicional" | "Reprovado";
  recommendation: string;
  reasons: string[];
  autoNote: string;
};

const emptyProfessionalCreditForm: ProfessionalCreditFormState = {
  incomeSource: "funcionario",
  requestedAmountInput: "",
  periodMonths: "12",
  monthlyRatePercent: "5",
  salaryCommitmentPercent: "30",
  salaryOtherIncomeInput: "",
  payrollDiscountsInput: "",
  existingDebtServiceInput: "",
  businessSalesInput: "",
  businessPurchasesInput: "",
  businessOperatingExpensesInput: "",
  businessOtherIncomeInput: "",
  stockTotalInput: "",
  stockAvailableInput: "",
  cashAvailableInput: "",
  receivablesInput: "",
  payablesInput: "",
  otherLiabilitiesInput: "",
};

function clampNumber(min: number, value: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inferProfessionalIncomeSource(client: Client): ProfessionalIncomeSource {
  const text = `${client.occupation || ""} ${client.businessName || ""} ${client.businessSector || ""} ${client.employerName || ""}`.toLowerCase();
  const looksBusiness = /(negoc|comerc|venda|mercado|empreend|loj|feira)/.test(text) || client.type === "empresa";
  const looksEmployee = /(funcion|assalariad|empregad|professor|tecnic|operador|publico)/.test(text) || Boolean(client.employerName);
  if (looksBusiness && !looksEmployee) return "negociante";
  if (looksEmployee && !looksBusiness) return "funcionario";
  return client.type === "empresa" ? "negociante" : "funcionario";
}

function buildProfessionalCreditFormDefaults(client: Client): ProfessionalCreditFormState {
  const incomeSource = inferProfessionalIncomeSource(client);
  const monthlyIncome = Math.max(0, safeNumber(client.monthlyIncome));
  const monthlyExpenses = Math.max(0, safeNumber(client.monthlyExpenses));
  const debt = Math.max(0, safeNumber(client.debt));
  const existingDebtService = debt > 0 ? Math.max(debt / 12, debt * 0.06) : 0;

  const businessSales = incomeSource === "negociante" ? Math.max(monthlyIncome, monthlyExpenses * 1.6, 10000) : Math.max(monthlyIncome * 0.2, 0);
  const businessPurchases = incomeSource === "negociante" ? businessSales * 0.55 : 0;
  const businessOperatingExpenses = incomeSource === "negociante" ? Math.max(monthlyExpenses * 0.6, businessSales * 0.16) : 0;
  const grossProfit = businessSales - businessPurchases;
  const netProfit = Math.max(0, grossProfit - businessOperatingExpenses);
  const stockTotal = incomeSource === "negociante" ? businessPurchases * 0.9 : 0;
  const stockAvailable = incomeSource === "negociante" ? stockTotal * 0.65 : 0;
  const cashAvailable = incomeSource === "negociante" ? Math.max(netProfit * 0.8, 0) : Math.max(monthlyIncome * 0.1, 0);
  const receivables = incomeSource === "negociante" ? businessSales * 0.18 : 0;
  const payables = incomeSource === "negociante" ? businessPurchases * 0.22 : 0;
  const otherLiabilities = incomeSource === "negociante" ? monthlyExpenses * 0.25 : Math.max(monthlyExpenses * 0.1, 0);

  return {
    incomeSource,
    requestedAmountInput: "",
    periodMonths: "12",
    monthlyRatePercent: "5",
    salaryCommitmentPercent: "30",
    salaryOtherIncomeInput: "",
    payrollDiscountsInput: formatCurrencyInput(Math.max(monthlyExpenses * 0.15, 0), { emptyIfZero: true }),
    existingDebtServiceInput: formatCurrencyInput(existingDebtService, { emptyIfZero: true }),
    businessSalesInput: formatCurrencyInput(businessSales, { emptyIfZero: true }),
    businessPurchasesInput: formatCurrencyInput(businessPurchases, { emptyIfZero: true }),
    businessOperatingExpensesInput: formatCurrencyInput(businessOperatingExpenses, { emptyIfZero: true }),
    businessOtherIncomeInput: formatCurrencyInput(Math.max(netProfit * 0.08, 0), { emptyIfZero: true }),
    stockTotalInput: formatCurrencyInput(stockTotal, { emptyIfZero: true }),
    stockAvailableInput: formatCurrencyInput(stockAvailable, { emptyIfZero: true }),
    cashAvailableInput: formatCurrencyInput(cashAvailable, { emptyIfZero: true }),
    receivablesInput: formatCurrencyInput(receivables, { emptyIfZero: true }),
    payablesInput: formatCurrencyInput(payables, { emptyIfZero: true }),
    otherLiabilitiesInput: formatCurrencyInput(otherLiabilities, { emptyIfZero: true }),
  };
}

function buildProfessionalCreditAnalysis(client: Client, form: ProfessionalCreditFormState, collateralTotalInput = 0): ProfessionalCreditAnalysis {
  const inferredIncomeSource = inferProfessionalIncomeSource(client);
  const incomeSource = form.incomeSource;
  const requestedAmount = Math.max(0, parseCurrencyInput(form.requestedAmountInput));
  const periodMonths = Math.max(1, Math.round(safeNumber(form.periodMonths) || 1));
  const monthlyRatePercent = Math.max(0, safeNumber(form.monthlyRatePercent));
  const monthlyRate = monthlyRatePercent / 100;
  const estimatedInstallment = periodMonths > 0
    ? requestedAmount > 0
      ? requestedAmount * (1 + monthlyRate * periodMonths) / periodMonths
      : 0
    : 0;
  const totalRepayable = estimatedInstallment * periodMonths;

  const salaryBase = Math.max(0, safeNumber(client.monthlyIncome));
  const baseExpenses = Math.max(0, safeNumber(client.monthlyExpenses));
  const existingDebt = Math.max(0, safeNumber(client.debt));
  const fallbackDebtService = existingDebt > 0 ? Math.max(existingDebt / 12, existingDebt * 0.06) : 0;
  const existingDebtService = Math.max(0, parseCurrencyInput(form.existingDebtServiceInput) || fallbackDebtService);

  const salaryCommitmentPercent = clampNumber(5, safeNumber(form.salaryCommitmentPercent) || 30, 80);
  const salaryOtherIncome = Math.max(0, parseCurrencyInput(form.salaryOtherIncomeInput));
  const payrollDiscounts = Math.max(0, parseCurrencyInput(form.payrollDiscountsInput));
  const salaryPolicyCapacity = salaryBase * (salaryCommitmentPercent / 100);

  const businessSales = Math.max(0, parseCurrencyInput(form.businessSalesInput));
  const businessPurchases = Math.max(0, parseCurrencyInput(form.businessPurchasesInput));
  const grossProfit = businessSales - businessPurchases;
  const grossMargin = businessSales > 0 ? (grossProfit / businessSales) * 100 : 0;
  const businessOperatingExpenses = Math.max(0, parseCurrencyInput(form.businessOperatingExpensesInput));
  const netProfit = grossProfit - businessOperatingExpenses;
  const netMargin = businessSales > 0 ? (netProfit / businessSales) * 100 : 0;
  const businessOtherIncome = Math.max(0, parseCurrencyInput(form.businessOtherIncomeInput));

  const stockTotal = Math.max(0, parseCurrencyInput(form.stockTotalInput));
  const stockAvailable = clampNumber(0, parseCurrencyInput(form.stockAvailableInput), stockTotal || Number.MAX_SAFE_INTEGER);
  const cashAvailable = Math.max(0, parseCurrencyInput(form.cashAvailableInput));
  const receivables = Math.max(0, parseCurrencyInput(form.receivablesInput));
  const payables = Math.max(0, parseCurrencyInput(form.payablesInput));
  const otherLiabilities = Math.max(0, parseCurrencyInput(form.otherLiabilitiesInput));
  const currentAssets = cashAvailable + receivables + stockTotal;
  const availableLiquidity = cashAvailable + stockAvailable;
  const currentRatio = payables + otherLiabilities > 0 ? currentAssets / (payables + otherLiabilities) : 9;
  const collateralTotal = Math.max(0, collateralTotalInput);
  const patrimonialCoverageBase = incomeSource === "negociante"
    ? collateralTotal + availableLiquidity
    : collateralTotal;

  const employeeGrossCapacity = Math.max(0, (salaryBase + salaryOtherIncome) - (baseExpenses + payrollDiscounts + existingDebtService));
  const employeePaymentCapacity = Math.max(0, Math.min(salaryPolicyCapacity, employeeGrossCapacity));
  const traderReserve = Math.max(baseExpenses * 0.2, 0);
  const traderPaymentCapacity = Math.max(0, (netProfit + businessOtherIncome) - existingDebtService - traderReserve);
  const paymentCapacity = incomeSource === "funcionario" ? employeePaymentCapacity : traderPaymentCapacity;

  const debtServiceTotal = existingDebtService + estimatedInstallment;
  const coverageBase = incomeSource === "funcionario"
    ? Math.max(0, (salaryBase + salaryOtherIncome) - (baseExpenses + payrollDiscounts))
    : Math.max(0, netProfit + businessOtherIncome);
  const debtServiceCoverage = debtServiceTotal > 0 ? coverageBase / debtServiceTotal : 9;
  const capacityCoverage = estimatedInstallment > 0 ? paymentCapacity / estimatedInstallment : 0;
  const patrimonialCoverage = totalRepayable > 0 ? patrimonialCoverageBase / totalRepayable : 0;
  const debtToIncome = salaryBase > 0 ? existingDebt / salaryBase : 999;

  let score = 100;
  if (requestedAmount <= 0) score -= 5;
  if (capacityCoverage < 1) score -= 32;
  else if (capacityCoverage < 1.2) score -= 16;
  else if (capacityCoverage >= 1.6) score += 4;
  if (debtServiceCoverage < 1) score -= 18;
  else if (debtServiceCoverage < 1.2) score -= 9;
  if (debtToIncome > 4) score -= 18;
  else if (debtToIncome > 2.5) score -= 10;
  if (client.score < 600) score -= 15;
  else if (client.score < 700) score -= 8;
  if (client.status === "warning") score -= 8;
  if (client.status === "alert") score -= 15;
  if (incomeSource === "negociante" && grossMargin < 18) score -= 10;
  if (incomeSource === "negociante" && netMargin < 8) score -= 8;
  if (incomeSource === "negociante" && currentRatio < 1) score -= 10;
  if (patrimonialCoverage > 0 && patrimonialCoverage < 1) score -= 8;
  if (incomeSource === "funcionario" && estimatedInstallment > salaryPolicyCapacity) score -= 14;
  if (incomeSource === "funcionario" && salaryBase <= baseExpenses) score -= 12;

  const finalScore = Math.round(clampNumber(0, score, 100));
  const decision: ProfessionalCreditAnalysis["decision"] = finalScore >= 75 ? "Aprovado" : finalScore >= 55 ? "Condicional" : "Reprovado";

  const reasons: string[] = [];
  reasons.push(`Fonte de rendimento tratada como ${incomeSource === "negociante" ? "negociante" : "funcionario"}${incomeSource !== inferredIncomeSource ? " (ajuste manual do analista)." : "."}`);
  if (requestedAmount > 0) reasons.push(`Prestacao estimada calculada em ${formatCurrencyMT(estimatedInstallment)} para ${periodMonths} meses a ${monthlyRatePercent.toFixed(2)}%.`);
  if (capacityCoverage < 1) reasons.push("Capacidade de pagamento abaixo da prestacao estimada.");
  else reasons.push("Capacidade de pagamento cobre a prestacao estimada.");
  if (totalRepayable > 0) {
    reasons.push(`Cobertura patrimonial (bens/garantias + liquidez) em ${patrimonialCoverage.toFixed(2)}x sobre o valor total a pagar.`);
  }
  if (incomeSource === "funcionario") {
    reasons.push(`Capacidade por politica salarial (${salaryCommitmentPercent.toFixed(0)}%) = ${formatCurrencyMT(salaryPolicyCapacity)}.`);
    if (salaryBase > 0 && estimatedInstallment > salaryPolicyCapacity) reasons.push("Prestacao estimada excede o limite percentual definido sobre o salario.");
  } else {
    reasons.push(`Margem bruta ${grossMargin.toFixed(1)}% e margem liquida ${netMargin.toFixed(1)}%.`);
    reasons.push(`Stock total ${formatCurrencyMT(stockTotal)} / disponivel ${formatCurrencyMT(stockAvailable)}.`);
    if (grossMargin < 18) reasons.push("Margem bruta abaixo do minimo recomendado de 18%.");
    if (currentRatio < 1) reasons.push("Liquidez corrente abaixo de 1.0, indicando pressao de caixa.");
  }
  if (debtToIncome > 3) reasons.push("Endividamento atual elevado em relacao ao rendimento declarado.");
  if (client.status === "warning" || client.status === "alert") reasons.push("Estado cadastral do cliente exige cautela adicional.");

  const recommendation =
    decision === "Aprovado"
      ? "Aprovacao recomendada com monitoria normal e validacao documental final."
      : decision === "Condicional"
        ? "Aprovacao condicional: ajustar valor/prazo, reforçar garantia e confirmar fluxo de caixa."
        : "Nao aprovar no formato atual. Rever capacidade, reduzir exposicao e atualizar comprovativos.";

  const autoNote = [
    `Analise profissional (${incomeSource === "negociante" ? "Negociante" : "Funcionario"})`,
    `Cliente: ${client.name} | Score: ${finalScore}/100 | Parecer: ${decision}`,
    `Prestacao estimada: ${formatCurrencyMT(estimatedInstallment)} | Total a pagar: ${formatCurrencyMT(totalRepayable)} | Cobertura de fluxo: ${capacityCoverage.toFixed(2)}x`,
    `Servico da divida (total): ${formatCurrencyMT(debtServiceTotal)} | Cobertura servico: ${debtServiceCoverage.toFixed(2)}x`,
    `Cobertura patrimonial: ${patrimonialCoverage.toFixed(2)}x | Base patrimonial: ${formatCurrencyMT(patrimonialCoverageBase)} | Garantias: ${formatCurrencyMT(collateralTotal)}`,
    incomeSource === "negociante"
      ? `Vendas: ${formatCurrencyMT(businessSales)} | Compras: ${formatCurrencyMT(businessPurchases)} | Margem bruta: ${grossMargin.toFixed(1)}% | Margem liquida: ${netMargin.toFixed(1)}%`
      : `Salario base: ${formatCurrencyMT(salaryBase)} | Limite percentual (${salaryCommitmentPercent.toFixed(0)}%): ${formatCurrencyMT(salaryPolicyCapacity)}`,
    `Recomendacao: ${recommendation}`,
  ].join("\n");

  return {
    client,
    incomeSource,
    inferredIncomeSource,
    requestedAmount,
    periodMonths,
    monthlyRatePercent,
    estimatedInstallment,
    totalRepayable,
    salaryBase,
    salaryCommitmentPercent,
    salaryPolicyCapacity,
    salaryOtherIncome,
    payrollDiscounts,
    businessSales,
    businessPurchases,
    grossProfit,
    grossMargin,
    businessOperatingExpenses,
    netProfit,
    netMargin,
    businessOtherIncome,
    existingDebt,
    existingDebtService,
    debtServiceTotal,
    paymentCapacity,
    capacityCoverage,
    debtServiceCoverage,
    debtToIncome,
    stockTotal,
    stockAvailable,
    cashAvailable,
    receivables,
    payables,
    otherLiabilities,
    currentAssets,
    availableLiquidity,
    currentRatio,
    collateralTotal,
    patrimonialCoverageBase,
    patrimonialCoverage,
    finalScore,
    decision,
    recommendation,
    reasons,
    autoNote,
  };
}

function computeAutomaticClientScore({ monthlyIncome, monthlyExpenses, status }: { monthlyIncome: number; monthlyExpenses: number; status: string }) {
  const income = Number(monthlyIncome || 0);
  const expenses = Number(monthlyExpenses || 0);
  const disposable = income - expenses;
  const expenseRatio = income > 0 ? expenses / income : 2;

  let score = 650;

  if (income <= 0) score -= 220;
  else if (disposable >= 30000) score += 140;
  else if (disposable >= 15000) score += 90;
  else if (disposable >= 5000) score += 40;
  else if (disposable >= 0) score += 10;
  else score -= 120;

  if (expenseRatio <= 0.4) score += 120;
  else if (expenseRatio <= 0.7) score += 60;
  else if (expenseRatio <= 1) score += 10;
  else score -= 80;

  if (status === "active") score += 60;
  else if (status === "warning") score -= 70;
  else if (status === "alert") score -= 140;

  return Math.max(0, Math.min(1000, Math.round(score)));
}

function normalizeNuitInput(value: string) {
  return normalizeMozNuit(value);
}

function normalizeClientDocumentInput(value: string, documentType: string) {
  return normalizeMozDocumentNumber(value, documentType);
}

function normalizePhoneLocalInput(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, MAX_PHONE_LOCAL_LENGTH);
}

function formatBytes(bytes: number) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler ficheiro selecionado."));
    reader.readAsDataURL(file);
  });
}

function composePhoneFromLocal(local: string) {
  const normalized = normalizePhoneLocalInput(local);
  return normalized ? `${COUNTRY_PREFIX}${normalized}` : "";
}

function extractPhoneLocal(value: string) {
  const digits = String(value || "").replace(/\D+/g, "");
  const local = digits.startsWith("258") ? digits.slice(3) : digits;
  return local.slice(0, MAX_PHONE_LOCAL_LENGTH);
}

const emptyClientForm = {
  name: "",
  type: "singular",
  nuit: "",
  phone: "",
  email: "",
  phoneAlt: "",
  documentType: "BI",
  documentNumber: "",
  birthDate: "",
  gender: "masculino",
  maritalStatus: "solteiro",
  nationality: "Mocambicana",
  province: "",
  city: "",
  district: "",
  neighborhood: "",
  addressLine: "",
  houseNumber: "",
  occupation: "",
  employerName: "",
  monthlyIncome: 0,
  monthlyExpenses: 0,
  businessName: "",
  businessSector: "",
  groupName: "",
  groupDescription: "",
  groupLeaderName: "",
  groupMembers: [] as Array<{ memberClientId: string; memberName: string; allocationAmount: number }>,
  registrationDate: getTodayIso(),
  notes: "",
  score: 650,
  status: "active",
  carteiraId: "",
  collateralRows: [] as Array<{ collateralType: string; description: string; estimatedValue: number; documentRef: string }>,
  hasGuarantor: false,
  guarantor: {
    name: "",
    nuit: "",
    phone: "",
    relation: "",
    occupation: "",
    monthlyIncome: 0,
    guaranteedAmount: 0,
    hasCollateral: false,
    collateralType: "Imovel",
    collateralDescription: "",
    collateralValue: 0,
    collateralDocumentRef: "",
  },
};

const emptyGuarantorForm = {
  name: "",
  nuit: "",
  phone: "",
  clientId: "",
  guaranteedAmount: 0,
  activeGuarantees: 0,
  hasGuarantee: false,
  guaranteeType: "",
  guaranteeDescription: "",
  guaranteeEstimatedValue: 0,
  guaranteeDocumentRef: "",
};

const emptyCollateralForm = { clientId: "" };

function createCollateralDraftRow(seed?: Partial<CollateralDraftRow>): CollateralDraftRow {
  return {
    rowKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    id: seed?.id,
    collateralType: seed?.collateralType || "Imovel",
    description: seed?.description || "",
    estimatedValue: Number(seed?.estimatedValue || 0),
    documentRef: seed?.documentRef || "",
    status: seed?.status || "active",
  };
}

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [payload, setPayload] = useState<ClientsResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showClientForm, setShowClientForm] = useState(false);
  const [creditDetailClient, setCreditDetailClient] = useState<{ id: number; name: string } | null>(null);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [clientFormFeedback, setClientFormFeedback] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const [showGuarantorForm, setShowGuarantorForm] = useState(false);
  const [guarantorForm, setGuarantorForm] = useState(emptyGuarantorForm);
  const [editingGuarantorId, setEditingGuarantorId] = useState<number | null>(null);
  const [savingGuarantor, setSavingGuarantor] = useState(false);
  const [guarantorFormFeedback, setGuarantorFormFeedback] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const [showCollateralForm, setShowCollateralForm] = useState(false);
  const [collateralForm, setCollateralForm] = useState(emptyCollateralForm);
  const [collateralRows, setCollateralRows] = useState<CollateralDraftRow[]>([createCollateralDraftRow()]);
  const [collateralDeletedIds, setCollateralDeletedIds] = useState<number[]>([]);
  const [savingCollateral, setSavingCollateral] = useState(false);
  const [collateralFormFeedback, setCollateralFormFeedback] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [evaluationClientId, setEvaluationClientId] = useState("");
  const [evaluationNote, setEvaluationNote] = useState("");
  const [evaluationHistory, setEvaluationHistory] = useState<EvaluationHistoryItem[]>([]);
  const [loadingEvaluationHistory, setLoadingEvaluationHistory] = useState(false);
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [professionalEvaluationForm, setProfessionalEvaluationForm] = useState<ProfessionalCreditFormState>({ ...emptyProfessionalCreditForm });
  const [documentClientId, setDocumentClientId] = useState("");
  const [documentsPayload, setDocumentsPayload] = useState<ClientDocumentsResponse | null>(null);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentForm, setDocumentForm] = useState<{
    docType: string;
    title: string;
    issuedOn: string;
    expiresOn: string;
    note: string;
    file: File | null;
  }>({
    docType: "bi",
    title: "BI",
    issuedOn: "",
    expiresOn: "",
    note: "",
    file: null,
  });

  const [expandedClientIds, setExpandedClientIds] = useState<Set<number>>(new Set());
  const [clientCreditProfiles, setClientCreditProfiles] = useState<Record<number, ClientCreditProfile>>({});
  const [loadingProfiles, setLoadingProfiles] = useState<Set<number>>(new Set());
  const [creditModalClient, setCreditModalClient] = useState<{ id: number; name: string; type: "active" | "paid" | "all" } | null>(null);
  const [creditModalProfile, setCreditModalProfile] = useState<ClientCreditProfile | null>(null);
  const [creditModalLoading, setCreditModalLoading] = useState(false);

  const loadClientCreditProfile = useCallback(async (clientId: number) => {
    if (clientCreditProfiles[clientId] || loadingProfiles.has(clientId)) return;
    setLoadingProfiles((prev) => new Set(prev).add(clientId));
    try {
      const profile = await fetchClientCreditProfile(clientId);
      setClientCreditProfiles((prev) => ({ ...prev, [clientId]: profile }));
    } catch {
      // Silently fail
    } finally {
      setLoadingProfiles((prev) => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  }, [clientCreditProfiles, loadingProfiles]);

  // Load credit profile when credit modal is opened
  useEffect(() => {
    if (!creditModalClient) {
      setCreditModalProfile(null);
      setCreditModalLoading(false);
      return;
    }
    const existingProfile = clientCreditProfiles[creditModalClient.id];
    if (existingProfile) {
      setCreditModalProfile(existingProfile);
      setCreditModalLoading(false);
      return;
    }
    setCreditModalLoading(true);
    setCreditModalProfile(null);
    fetchClientCreditProfile(creditModalClient.id)
      .then((profile) => {
        setCreditModalProfile(profile);
        setClientCreditProfiles((prev) => ({ ...prev, [creditModalClient.id]: profile }));
      })
      .catch(() => setCreditModalProfile(null))
      .finally(() => setCreditModalLoading(false));
  }, [creditModalClient?.id, clientCreditProfiles]);

  const toggleClientExpand = useCallback((clientId: number) => {
    setExpandedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
        setTimeout(() => loadClientCreditProfile(clientId), 0);
      }
      return next;
    });
  }, [loadClientCreditProfile]);

  const loadData = useCallback(async () => {
    const type = ["all", "singular", "grupo", "empresa"].includes(activeTab) ? activeTab : "all";
    try {
      setError("");
      const data = await apiFetch<ClientsResponse>(`/clients?search=${encodeURIComponent(searchTerm)}&type=${type}`);
      setPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar clientes.");
    }
  }, [activeTab, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const clients = useMemo(() => payload?.clients || [], [payload]);
  const [carteirasLista, setCarteirasLista] = useState<{ id: number; name: string }[]>([]);
  const [carteiraFilter, setCarteiraFilter] = useState<string>("all");
  useEffect(() => {
    let ignore = false;
    listCarteiras()
      .then((d) => {
        if (!ignore) {
          setCarteirasLista(
            (d.carteiras || []).map((c: any) => ({
              id: c.id,
              name: c.gestor_user_name || c.gestor_name
                ? `${c.name} (${c.gestor_user_name || c.gestor_name})`
                : c.name,
            })),
          );
        }
      })
      .catch(() => {
        if (!ignore) setCarteirasLista([]);
      });
    return () => {
      ignore = true;
    };
  }, []);
  const clientsFiltered = useMemo(
    () => (carteiraFilter === "all" ? clients : clients.filter((client) => client.carteiraId === Number(carteiraFilter))),
    [clients, carteiraFilter],
  );
  const selectedEvaluationClient = useMemo(
    () => clients.find((client) => client.id === Number(evaluationClientId)) || null,
    [clients, evaluationClientId],
  );
  const guarantors = payload?.guarantors || [];
  const collaterals = payload?.collaterals || [];

  const loadEvaluationHistory = useCallback(async (clientId: string) => {
    if (!clientId) {
      setEvaluationHistory([]);
      return;
    }
    try {
      setLoadingEvaluationHistory(true);
      const result = await apiFetch<{ history: EvaluationHistoryItem[] }>(`/clients/${clientId}/evaluations`);
      setEvaluationHistory(result.history || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar historico de avaliacoes.");
      setEvaluationHistory([]);
    } finally {
      setLoadingEvaluationHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadEvaluationHistory(evaluationClientId);
  }, [evaluationClientId, loadEvaluationHistory]);

  useEffect(() => {
    if (!selectedEvaluationClient) {
      setProfessionalEvaluationForm({ ...emptyProfessionalCreditForm });
      return;
    }
    setProfessionalEvaluationForm(buildProfessionalCreditFormDefaults(selectedEvaluationClient));
  }, [selectedEvaluationClient]);

  const updateProfessionalEvaluationField = (field: keyof ProfessionalCreditFormState, value: string) => {
    setProfessionalEvaluationForm((current) => ({ ...current, [field]: value }));
  };

  const loadDocuments = useCallback(async (clientId: string) => {
    if (!clientId) {
      setDocumentsPayload(null);
      return;
    }
    try {
      setLoadingDocuments(true);
      const data = await apiFetch<ClientDocumentsResponse>(`/clients/${clientId}/documents`);
      setDocumentsPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar documentos do cliente.");
      setDocumentsPayload(null);
    } finally {
      setLoadingDocuments(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments(documentClientId);
  }, [documentClientId, loadDocuments]);
  const guarantorByClientId = useMemo(() => {
    const map = new Map<number, Guarantor>();
    guarantors.forEach((g) => {
      if (g.clientId) map.set(g.clientId, g);
    });
    return map;
  }, [guarantors]);
  const collateralsByClientId = useMemo(() => {
    const map = new Map<number, Collateral[]>();
    collaterals.forEach((co) => {
      if (!co.clientId) return;
      const bucket = map.get(co.clientId) || [];
      bucket.push(co);
      map.set(co.clientId, bucket);
    });
    return map;
  }, [collaterals]);
  const selectedEvaluationCollateralTotal = useMemo(() => {
    if (!selectedEvaluationClient) return 0;
    const rows = collateralsByClientId.get(selectedEvaluationClient.id) || [];
    return rows.reduce((sum, row) => sum + Math.max(0, Number(row.estimatedValue || 0)), 0);
  }, [collateralsByClientId, selectedEvaluationClient]);

  const evaluation = useMemo(() => {
    const selected = selectedEvaluationClient;
    if (!selected) return null;

    const monthlyIncome = Number(selected.monthlyIncome || 0);
    const monthlyExpenses = Number(selected.monthlyExpenses || 0);
    const disposableIncome = monthlyIncome - monthlyExpenses;
    const debtToIncome = monthlyIncome > 0 ? Number(selected.debt || 0) / monthlyIncome : 999;

    let points = 50;
    const reasons: string[] = [];

    if (monthlyIncome <= 0) {
      points -= 30;
      reasons.push("Renda mensal nao informada ou invalida.");
    } else if (disposableIncome >= 20000) {
      points += 15;
      reasons.push("Boa folga financeira mensal para suportar prestacoes.");
    } else if (disposableIncome >= 10000) {
      points += 10;
      reasons.push("Folga financeira aceitavel.");
    } else if (disposableIncome >= 0) {
      points += 4;
      reasons.push("Folga financeira baixa, exige cautela.");
    } else {
      points -= 20;
      reasons.push("Despesas mensais superiores a renda mensal.");
    }

    if (debtToIncome <= 1) {
      points += 20;
      reasons.push("Endividamento atual baixo em relacao a renda.");
    } else if (debtToIncome <= 3) {
      points += 10;
      reasons.push("Endividamento moderado, ainda controlavel.");
    } else if (debtToIncome <= 5) {
      reasons.push("Endividamento elevado para a renda declarada.");
    } else {
      points -= 15;
      reasons.push("Endividamento muito elevado para a renda declarada.");
    }

    if (selected.score >= 800) {
      points += 20;
      reasons.push("Score de credito excelente.");
    } else if (selected.score >= 700) {
      points += 12;
      reasons.push("Score de credito bom.");
    } else if (selected.score >= 600) {
      points += 4;
      reasons.push("Score medio, com risco controlado.");
    } else {
      points -= 15;
      reasons.push("Score baixo, risco elevado.");
    }

    if (selected.status === "active") {
      points += 8;
      reasons.push("Historico atual em estado ativo.");
    } else if (selected.status === "warning") {
      points -= 6;
      reasons.push("Cliente em estado de atencao.");
    } else if (selected.status === "alert") {
      points -= 12;
      reasons.push("Cliente em estado de alerta.");
    }

    if (selected.loans > 3) {
      points -= 4;
      reasons.push("Cliente com varios creditos em carteira.");
    } else if (selected.loans === 0) {
      reasons.push("Sem credito ativo no momento.");
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(points)));
    const decision = finalScore >= 75 ? "Aprovado" : finalScore >= 55 ? "Condicional" : "Reprovado";
    const recommendation =
      decision === "Aprovado"
        ? "Aprovacao recomendada com plano normal de acompanhamento."
        : decision === "Condicional"
          ? "Aprovacao condicional: reduzir valor, exigir avalista ou entrada maior."
          : "Nao aprovar agora. Recomenda-se reavaliacao apos melhoria financeira.";

    return {
      client: selected,
      monthlyIncome,
      monthlyExpenses,
      disposableIncome,
      debtToIncome,
      finalScore,
      decision,
      recommendation,
      reasons,
    };
  }, [selectedEvaluationClient]);

  const professionalCreditAnalysis = useMemo(() => {
    if (!selectedEvaluationClient) return null;
    return buildProfessionalCreditAnalysis(selectedEvaluationClient, professionalEvaluationForm, selectedEvaluationCollateralTotal);
  }, [selectedEvaluationClient, professionalEvaluationForm, selectedEvaluationCollateralTotal]);

  const districtOptions = useMemo(() => getMozDistrictsByProvince(clientForm.province), [clientForm.province]);
  const clientDocumentInput = useMemo(() => getMozDocumentInputConfig(clientForm.documentType), [clientForm.documentType]);

  const clientFormLiveErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const nuitError = validateMozNuit(clientForm.nuit);
    if (nuitError) {
      errors.nuit = nuitError;
    }

    if (clientForm.documentNumber) {
      const documentError = validateMozDocumentNumber(clientForm.documentNumber, clientForm.documentType);
      if (documentError) errors.documentNumber = documentError;
    }

    const phoneLocal = extractPhoneLocal(clientForm.phone);
    if (phoneLocal && phoneLocal.length < MAX_PHONE_LOCAL_LENGTH) {
      errors.phone = `Telefone deve ter ${MAX_PHONE_LOCAL_LENGTH} digitos apos o prefixo.`;
    }

    const phoneAltLocal = extractPhoneLocal(clientForm.phoneAlt);
    if (phoneAltLocal && phoneAltLocal.length < MAX_PHONE_LOCAL_LENGTH) {
      errors.phoneAlt = `Telefone alternativo deve ter ${MAX_PHONE_LOCAL_LENGTH} digitos.`;
    }
    return errors;
  }, [clientForm.nuit, clientForm.documentType, clientForm.documentNumber, clientForm.phone, clientForm.phoneAlt]);

  const getStatusBadge = (status: string) => {
    if (status === "active") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Ativo</Badge>;
    if (status === "warning") return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Atencao</Badge>;
    if (status === "alert") return <Badge className="bg-red-100 text-red-800 border-red-200">Alerta</Badge>;
    return <Badge>Desconhecido</Badge>;
  };

  const resetClientForm = () => {
    setClientForm(emptyClientForm);
    setEditingClientId(null);
    setClientFormFeedback(null);
    setShowClientForm(false);
  };

  const openCreateClientForm = () => {
    setClientForm({
      ...emptyClientForm,
      registrationDate: getTodayIso(),
      score: computeAutomaticClientScore({
        monthlyIncome: emptyClientForm.monthlyIncome,
        monthlyExpenses: emptyClientForm.monthlyExpenses,
        status: emptyClientForm.status,
      }),
    });
    setEditingClientId(null);
    setClientFormFeedback(null);
    setShowClientForm(true);
  };

  const handleEditClient = (client: Client) => {
    const documentType = MOZAMBIQUE_DOCUMENT_OPTIONS.some((option) => option.value === client.documentType)
      ? client.documentType
      : "BI";
    setEditingClientId(client.id);

    // Carrega garantias previamente cadastradas para o cliente
    const existingCollaterals = collaterals
      .filter((c) => c.clientId === client.id && !c.description?.startsWith("[Avalista:"))
      .map((c) => ({
        id: c.id,
        collateralType: c.collateralType || "Imovel",
        description: c.description || "",
        estimatedValue: Number(c.estimatedValue || 0),
        documentRef: c.documentRef || "",
      }));

    // Carrega avalista previamente cadastrado para o cliente
    const existingGuarantor = guarantors.find((g) => g.clientId === client.id);
    const existingAvalistaCollateral = collaterals.find(
      (c) => c.clientId === client.id && c.description?.startsWith("[Avalista:"),
    );

    const hasGuarantor = Boolean(existingGuarantor);
    const guarantorData = {
      name: existingGuarantor?.name || "",
      nuit: existingGuarantor?.nuit || "",
      phone: existingGuarantor?.phone || "",
      relation: "",
      occupation: "",
      monthlyIncome: 0,
      guaranteedAmount: Number(existingGuarantor?.guaranteedAmount || 0),
      hasCollateral: Boolean(existingAvalistaCollateral),
      collateralType: existingAvalistaCollateral?.collateralType || "Imovel",
      collateralDescription: existingAvalistaCollateral
        ? existingAvalistaCollateral.description.replace(/^\[Avalista:[^\]]*\]\s*/, "")
        : "",
      collateralValue: Number(existingAvalistaCollateral?.estimatedValue || 0),
      collateralDocumentRef: existingAvalistaCollateral?.documentRef || "",
    };

    setClientForm({
      name: client.name || "",
      type: client.type || "singular",
      nuit: normalizeNuitInput(client.nuit || ""),
      phone: client.phone || "",
      email: client.email || "",
      phoneAlt: client.phoneAlt || "",
      documentType,
      documentNumber: normalizeClientDocumentInput(client.documentNumber || "", documentType),
      birthDate: client.birthDate ? String(client.birthDate).slice(0, 10) : "",
      gender: client.gender || "masculino",
      maritalStatus: client.maritalStatus || "solteiro",
      nationality: client.nationality || "Mocambicana",
      province: client.province || "",
      city: client.city || "",
      district: client.district || "",
      neighborhood: client.neighborhood || "",
      addressLine: client.addressLine || "",
      houseNumber: client.houseNumber || "",
      occupation: client.occupation || "",
      employerName: client.employerName || "",
      monthlyIncome: Number(client.monthlyIncome || 0),
      monthlyExpenses: Number(client.monthlyExpenses || 0),
      businessName: client.businessName || "",
      businessSector: client.businessSector || "",
      groupName: client.groupName || "",
      groupDescription: client.groupDescription || "",
      groupLeaderName: client.groupLeaderName || "",
      groupMembers: (client.groupMembers || []).map((member) => ({
        memberClientId: "",
        memberName: member.memberName || "",
        allocationAmount: Number(member.allocationAmount || 0),
      })),
      registrationDate: client.registrationDate ? String(client.registrationDate).slice(0, 10) : getTodayIso(),
      notes: client.notes || "",
      score: client.score || 700,
      status: client.status || "active",
      carteiraId: client.carteiraId ? String(client.carteiraId) : "",
      collateralRows: existingCollaterals,
      hasGuarantor,
      guarantor: guarantorData,
    });
    setShowClientForm(true);
    setClientFormFeedback(null);
  };

  useEffect(() => {
    setClientForm((prev) => {
      const nextScore = computeAutomaticClientScore({
        monthlyIncome: prev.monthlyIncome,
        monthlyExpenses: prev.monthlyExpenses,
        status: prev.status,
      });
      if (prev.score === nextScore) return prev;
      return { ...prev, score: nextScore };
    });
  }, [clientForm.monthlyIncome, clientForm.monthlyExpenses, clientForm.status]);

  const handleSubmitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(clientFormLiveErrors).length > 0) {
      setClientFormFeedback({ type: "error", text: "Corrija os campos destacados antes de salvar o cliente." });
      return;
    }
    try {
      setSavingClient(true);
      setClientFormFeedback(null);
      const normalizedClientForm = {
        ...clientForm,
        nuit: normalizeNuitInput(clientForm.nuit),
        documentNumber: normalizeClientDocumentInput(clientForm.documentNumber, clientForm.documentType),
        phone: composePhoneFromLocal(extractPhoneLocal(clientForm.phone)),
        phoneAlt: composePhoneFromLocal(extractPhoneLocal(clientForm.phoneAlt)),
      };

      if (!normalizedClientForm.province || !normalizedClientForm.district) {
        setClientFormFeedback({ type: "error", text: "Selecione provincia e distrito do endereco." });
        return;
      }

      const validDistricts = getMozDistrictsByProvince(normalizedClientForm.province);
      if (validDistricts.length > 0 && !validDistricts.includes(normalizedClientForm.district)) {
        setClientFormFeedback({ type: "error", text: "Distrito invalido para a provincia selecionada." });
        return;
      }

      const duplicateCheck = clients.find((c) => {
        if (editingClientId && c.id === editingClientId) return false;
        const nameMatch = c.name.trim().toLowerCase() === normalizedClientForm.name.trim().toLowerCase();
        const nuitMatch = c.nuit && normalizedClientForm.nuit && c.nuit === normalizedClientForm.nuit;
        const docMatch = c.documentNumber && normalizedClientForm.documentNumber && c.documentNumber === normalizedClientForm.documentNumber;
        const phoneMatch = c.phone && normalizedClientForm.phone && c.phone === normalizedClientForm.phone;
        const phoneAltMatch = c.phoneAlt && normalizedClientForm.phoneAlt && c.phoneAlt === normalizedClientForm.phoneAlt;
        return nameMatch || nuitMatch || docMatch || phoneMatch || phoneAltMatch;
      });

      if (duplicateCheck) {
        const conflicts: string[] = [];
        if (duplicateCheck.name.trim().toLowerCase() === normalizedClientForm.name.trim().toLowerCase()) conflicts.push("nome completo");
        if (duplicateCheck.nuit && normalizedClientForm.nuit && duplicateCheck.nuit === normalizedClientForm.nuit) conflicts.push("NUIT");
        if (duplicateCheck.documentNumber && normalizedClientForm.documentNumber && duplicateCheck.documentNumber === normalizedClientForm.documentNumber) conflicts.push("numero de documento");
        if (duplicateCheck.phone && normalizedClientForm.phone && duplicateCheck.phone === normalizedClientForm.phone) conflicts.push("telefone principal");
        if (duplicateCheck.phoneAlt && normalizedClientForm.phoneAlt && duplicateCheck.phoneAlt === normalizedClientForm.phoneAlt) conflicts.push("telefone alternativo");
        setClientFormFeedback({ type: "error", text: `Ja existe um cliente registado com o(s) mesmo(s): ${conflicts.join(", ")}.` });
        return;
      }

      const response = await apiFetch<{ message?: string; client?: Client }>(editingClientId ? `/clients/${editingClientId}` : "/clients", {
        method: editingClientId ? "PUT" : "POST",
        body: JSON.stringify(normalizedClientForm),
      });
      setSuccess(response.message || (editingClientId ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso."));
      await loadData();
      resetClientForm();
    } catch (err) {
      setClientFormFeedback({ type: "error", text: err instanceof Error ? err.message : "Falha ao salvar cliente." });
    } finally {
      setSavingClient(false);
    }
  };

  const handleDeleteClient = async (id: number) => {
    const ok = window.confirm("Deseja realmente remover este cliente?");
    if (!ok) return;
    try {
      setError("");
      setSuccess("");
      await apiFetch(`/clients/${id}`, { method: "DELETE" });
      setSuccess("Cliente removido com sucesso.");
      if (editingClientId === id) resetClientForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover cliente.");
    }
  };

  const addGroupMemberDraft = () => {
    setClientForm((prev) => ({
      ...prev,
      groupMembers: [...(prev.groupMembers || []), { memberClientId: "", memberName: "", allocationAmount: 0 }],
    }));
  };

  const removeGroupMemberDraft = (idx: number) => {
    setClientForm((prev) => {
      const next = [...(prev.groupMembers || [])];
      next.splice(idx, 1);
      return { ...prev, groupMembers: next };
    });
  };

  const resetGuarantorForm = () => {
    setGuarantorForm(emptyGuarantorForm);
    setEditingGuarantorId(null);
    setGuarantorFormFeedback(null);
    setCollateralRows([createCollateralDraftRow()]);
    setCollateralDeletedIds([]);
    setShowGuarantorForm(false);
  };

  const openCreateGuarantorForm = () => {
    setGuarantorForm(emptyGuarantorForm);
    setEditingGuarantorId(null);
    setGuarantorFormFeedback(null);
    setCollateralRows([createCollateralDraftRow()]);
    setCollateralDeletedIds([]);
    setShowGuarantorForm(true);
  };

  const handleEditGuarantor = (guarantor: Guarantor) => {
    setEditingGuarantorId(guarantor.id);
    setGuarantorForm({
      name: guarantor.name,
      nuit: guarantor.nuit,
      phone: guarantor.phone,
      clientId: guarantor.clientId ? String(guarantor.clientId) : "",
      guaranteedAmount: guarantor.guaranteedAmount,
      activeGuarantees: guarantor.activeGuarantees,
      hasGuarantee: (guarantor.activeGuarantees || 0) > 0,
      guaranteeType: "",
      guaranteeDescription: "",
      guaranteeEstimatedValue: 0,
      guaranteeDocumentRef: "",
    });
    setCollateralRows([createCollateralDraftRow()]);
    setCollateralDeletedIds([]);
    setShowGuarantorForm(true);
    setGuarantorFormFeedback(null);
  };

  const handleSubmitGuarantor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingGuarantor(true);
      setGuarantorFormFeedback(null);
      const response = await apiFetch<{ message?: string }>(editingGuarantorId ? `/clients/guarantors/${editingGuarantorId}` : "/clients/guarantors", {
        method: editingGuarantorId ? "PUT" : "POST",
        body: JSON.stringify({
          ...guarantorForm,
          clientId: Number(guarantorForm.clientId),
        }),
      });
      setGuarantorFormFeedback({
        type: "success",
        text: response.message || (editingGuarantorId ? "Avalista atualizado com sucesso." : "Avalista criado com sucesso."),
      });
      if (!editingGuarantorId) setGuarantorForm(emptyGuarantorForm);
      await loadData();
    } catch (err) {
      setGuarantorFormFeedback({ type: "error", text: err instanceof Error ? err.message : "Falha ao salvar avalista." });
    } finally {
      setSavingGuarantor(false);
    }
  };

  const handleDeleteGuarantor = async (id: number) => {
    const ok = window.confirm("Deseja realmente remover este avalista?");
    if (!ok) return;
    try {
      setError("");
      setSuccess("");
      await apiFetch(`/clients/guarantors/${id}`, { method: "DELETE" });
      setSuccess("Avalista removido com sucesso.");
      if (editingGuarantorId === id) resetGuarantorForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover avalista.");
    }
  };

  const resetCollateralForm = () => {
    setCollateralForm(emptyCollateralForm);
    setCollateralRows([createCollateralDraftRow()]);
    setCollateralDeletedIds([]);
    setCollateralFormFeedback(null);
    setShowCollateralForm(false);
  };

  const hydrateCollateralRowsForClient = (clientId: number | null) => {
    if (!clientId) {
      setCollateralRows([createCollateralDraftRow()]);
      setCollateralDeletedIds([]);
      return;
    }
    const existing = collateralsByClientId.get(clientId) || [];
    if (!existing.length) {
      setCollateralRows([createCollateralDraftRow()]);
      setCollateralDeletedIds([]);
      return;
    }
    setCollateralRows(
      existing.map((item) =>
        createCollateralDraftRow({
          id: item.id,
          collateralType: item.collateralType,
          description: item.description,
          estimatedValue: item.estimatedValue,
          documentRef: item.documentRef,
          status: item.status,
        }),
      ),
    );
    setCollateralDeletedIds([]);
  };

  const openCreateCollateralForm = () => {
    setCollateralForm(emptyCollateralForm);
    setCollateralRows([createCollateralDraftRow()]);
    setCollateralDeletedIds([]);
    setCollateralFormFeedback(null);
    setShowCollateralForm(true);
  };

  const handleEditCollateral = (collateral: Collateral) => {
    const clientId = collateral.clientId ? String(collateral.clientId) : "";
    setCollateralForm({ clientId });
    hydrateCollateralRowsForClient(collateral.clientId);
    setShowCollateralForm(true);
    setCollateralFormFeedback(null);
  };

  const handleCollateralClientChange = (clientIdValue: string) => {
    setCollateralForm({ clientId: clientIdValue });
    setCollateralFormFeedback(null);
    const clientId = Number(clientIdValue);
    hydrateCollateralRowsForClient(Number.isInteger(clientId) && clientId > 0 ? clientId : null);
  };

  const updateCollateralRow = (rowKey: string, patch: Partial<CollateralDraftRow>) => {
    setCollateralRows((rows) => rows.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)));
  };

  const addCollateralRow = () => {
    setCollateralRows((rows) => [...rows, createCollateralDraftRow()]);
  };

  const removeCollateralRow = (rowKey: string) => {
    setCollateralRows((rows) => {
      const target = rows.find((row) => row.rowKey === rowKey);
      if (target?.id) setCollateralDeletedIds((ids) => [...ids, target.id as number]);
      const next = rows.filter((row) => row.rowKey !== rowKey);
      return next.length ? next : [createCollateralDraftRow()];
    });
  };

  const handleSubmitCollateral = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingCollateral(true);
      setCollateralFormFeedback(null);
      const clientId = Number(collateralForm.clientId);
      if (!Number.isInteger(clientId) || clientId <= 0) {
        throw new Error("Selecione um cliente para salvar as garantias.");
      }

      const cleanedRows = collateralRows
        .map((row) => ({
          ...row,
          collateralType: String(row.collateralType || "").trim(),
          description: String(row.description || "").trim(),
          documentRef: String(row.documentRef || "").trim(),
          estimatedValue: Number(row.estimatedValue || 0),
        }))
        .filter((row) => row.collateralType || row.description || row.estimatedValue > 0 || row.documentRef);

      for (const row of cleanedRows) {
        if (!row.collateralType || !row.description) {
          throw new Error("Cada linha deve ter tipo de garantia e descricao.");
        }
        if (!Number.isFinite(row.estimatedValue) || row.estimatedValue < 0) {
          throw new Error("Valor estimado invalido em uma das garantias.");
        }
      }

      for (const id of collateralDeletedIds) {
        await apiFetch(`/clients/collaterals/${id}`, { method: "DELETE" });
      }

      for (const row of cleanedRows) {
        const payload = {
          clientId,
          collateralType: row.collateralType,
          description: row.description,
          estimatedValue: row.estimatedValue,
          documentRef: row.documentRef,
          status: row.status,
        };
        if (row.id) {
          await apiFetch(`/clients/collaterals/${row.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await apiFetch("/clients/collaterals", { method: "POST", body: JSON.stringify(payload) });
        }
      }

      const response = { message: "Garantias salvas com sucesso." };
      setCollateralFormFeedback({
        type: "success",
        text: response.message,
      });
      await loadData();
      hydrateCollateralRowsForClient(clientId);
    } catch (err) {
      setCollateralFormFeedback({ type: "error", text: err instanceof Error ? err.message : "Falha ao salvar garantia." });
    } finally {
      setSavingCollateral(false);
    }
  };

  const handleDeleteCollateral = async (id: number) => {
    const ok = window.confirm("Deseja realmente remover esta garantia?");
    if (!ok) return;
    try {
      setError("");
      setSuccess("");
      await apiFetch(`/clients/collaterals/${id}`, { method: "DELETE" });
      setSuccess("Garantia removida com sucesso.");
      const selectedClientId = Number(collateralForm.clientId);
      if (Number.isInteger(selectedClientId) && selectedClientId > 0) {
        hydrateCollateralRowsForClient(selectedClientId);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover garantia.");
    }
  };

  const handleRegisterEvaluation = async () => {
    if (!evaluationClientId) {
      setError("Selecione um cliente para registrar a avaliacao.");
      return;
    }
    const noteToPersist = evaluationNote.trim() || professionalCreditAnalysis?.autoNote || "";
    try {
      setSavingEvaluation(true);
      setError("");
      setSuccess("");
      await apiFetch<{ message: string }>(`/clients/${evaluationClientId}/evaluations`, {
        method: "POST",
        body: JSON.stringify({ note: noteToPersist }),
      });
      setSuccess(noteToPersist && !evaluationNote.trim()
        ? "Avaliacao registrada no historico com resumo automatico."
        : "Avaliacao registrada no historico com sucesso.");
      setEvaluationNote("");
      await loadEvaluationHistory(evaluationClientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registrar avaliacao.");
    } finally {
      setSavingEvaluation(false);
    }
  };

  const handleCreateLoanRequest = async () => {
    if (!evaluationClientId || !selectedEvaluationClient) {
      setError("Selecione um cliente valido para solicitar credito.");
      return;
    }
    const requestedAmount = Math.max(0, parseCurrencyInput(professionalEvaluationForm.requestedAmountInput));
    if (requestedAmount <= 0) {
      setError("Informe o valor solicitado para o credito.");
      return;
    }
    const periodMonths = Math.max(1, Math.round(safeNumber(professionalEvaluationForm.periodMonths) || 12));
    const monthlyRatePercent = Math.max(0, safeNumber(professionalEvaluationForm.monthlyRatePercent) || 5);

    const hasActiveLoans = (selectedEvaluationClient.loans || 0) > 0;
    const product = hasActiveLoans ? "Reemprestimo" : "Credito Normal";

    const applicantType = selectedEvaluationClient.type === "grupo" ? "grupo"
      : selectedEvaluationClient.type === "empresa" ? "empresa"
      : "singular";

    const payload = {
      clientId: Number(evaluationClientId),
      requestedAmount,
      product,
      applicantType,
      periodMonths,
      monthlyRatePercent,
      administrativeFeeMode: "isento",
      amortizationMethod: "price",
      paymentFrequency: "mensal",
      disbursed: getTodayIso(),
      maturity: (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + periodMonths);
        return d.toISOString().slice(0, 10);
      })(),
      note: professionalCreditAnalysis?.autoNote || evaluationNote.trim() || `Solicitacao automatica apos avaliacao: ${professionalCreditAnalysis?.decision || ""}`,
    };

    try {
      setError("");
      setSuccess("");
      const result = await apiFetch<{ contractNo?: string; status?: string; message?: string }>(
        "/loans/approval/requests",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      setSuccess(result.message || `Solicitacao de credito registrada com sucesso. Contrato: ${result.contractNo || "-"}`);
      setProfessionalEvaluationForm({ ...emptyProfessionalCreditForm, requestedAmountInput: "", periodMonths: String(periodMonths), monthlyRatePercent: String(monthlyRatePercent) });
      setEvaluationNote("");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao solicitar credito.");
    }
  };

  const handleDocumentTypeChange = (value: string) => {
    const selected = DOCUMENT_TYPE_OPTIONS.find((item) => item.value === value);
    setDocumentForm((prev) => ({
      ...prev,
      docType: value,
      title: selected?.label || prev.title,
    }));
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentClientId) {
      setError("Selecione um cliente para carregar documento.");
      return;
    }
    if (!documentForm.file) {
      setError("Selecione um ficheiro para upload.");
      return;
    }
    if (documentForm.file.size > MAX_DOCUMENT_MB * 1024 * 1024) {
      setError(`O ficheiro excede ${MAX_DOCUMENT_MB}MB.`);
      return;
    }
    try {
      setUploadingDocument(true);
      setError("");
      setSuccess("");
      const fileBase64 = await toBase64(documentForm.file);
      const response = await apiFetch<{ message: string }>(`/clients/${documentClientId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          docType: documentForm.docType,
          title: documentForm.title,
          issuedOn: documentForm.issuedOn || null,
          expiresOn: documentForm.expiresOn || null,
          note: documentForm.note,
          fileName: documentForm.file.name,
          mimeType: documentForm.file.type,
          fileBase64,
        }),
      });
      setSuccess(response.message || "Documento carregado com sucesso.");
      setDocumentForm((prev) => ({ ...prev, file: null, note: "" }));
      await loadDocuments(documentClientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar documento.");
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleDownloadDocument = async (documentId: number, suggestedName: string) => {
    if (!documentClientId) return;
    try {
      const token = getToken();
      if (!token) throw new Error("Sessao invalida. Faca login novamente.");
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${token}`);
      const companyId = getActiveCompanyId();
      if (companyId) headers.set("x-company-id", String(companyId));
      const response = await fetch(`${API_BASE_URL}/clients/${documentClientId}/documents/${documentId}/download`, {
        method: "GET",
        headers,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || "Falha ao descarregar documento.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedName || `documento-${documentId}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao descarregar documento.");
    }
  };

  const exportClientsExcel = () => {
    const rows = clients.map((client) => ({
      garantias_lista: (collateralsByClientId.get(client.id) || []).map((co) => `${co.collateralType}: ${co.description}`).join(" | "),
      garantias_qtd: (collateralsByClientId.get(client.id) || []).length,
      garantias_valor_total: (collateralsByClientId.get(client.id) || []).reduce((sum, co) => sum + Number(co.estimatedValue || 0), 0),
      nome: client.name,
      tipo: client.type,
      nuit: client.nuit,
      telefone: client.phone,
      email: client.email,
      provincia: client.province,
      cidade: client.city,
      ocupacao: client.occupation,
      renda_mensal: client.monthlyIncome,
      despesas_mensais: client.monthlyExpenses,
      avalista: guarantorByClientId.get(client.id)?.name || "",
      contacto_avalista: guarantorByClientId.get(client.id)?.phone || "",
      valor_garantido: guarantorByClientId.get(client.id)?.guaranteedAmount || 0,
      garantias_ativas: guarantorByClientId.get(client.id)?.activeGuarantees || 0,
      score: client.score,
      status: client.status,
    }));
    downloadTextFile("clientes-completo.csv", toCsv(rows), "text/csv;charset=utf-8");
    setSuccess("Exportacao em Excel (CSV) concluida.");
  };

  const exportClientsPdf = () => {
    const now = new Date().toLocaleString("pt-PT");
    const rows = clients
      .map(
        (client) =>
          `<tr>
            <td>${client.name}</td>
            <td>${client.type}</td>
            <td>${client.nuit}</td>
            <td>${client.phone}</td>
            <td>${client.email || "-"}</td>
            <td>${client.city || "-"}</td>
            <td>${guarantorByClientId.get(client.id)?.name || "-"}</td>
            <td>${
              (collateralsByClientId.get(client.id) || []).length
                ? `${money.format((collateralsByClientId.get(client.id) || []).reduce((sum, co) => sum + Number(co.estimatedValue || 0), 0))} MT (${(collateralsByClientId.get(client.id) || []).length})`
                : "-"
            }</td>
            <td>${client.score}</td>
            <td>${client.status}</td>
          </tr>`,
      )
      .join("");
    const html = `
      <h1 class="title">Lista de Clientes</h1>
      <p class="sub">Gerado em ${now} | Total: ${clients.length}</p>
      <table>
        <thead>
          <tr><th>Cliente</th><th>Tipo</th><th>NUIT</th><th>Contacto</th><th>Email</th><th>Cidade</th><th>Avalista</th><th>Garantia</th><th>Score</th><th>Status</th></tr>
        </thead>
        <tbody>${rows || "<tr><td colspan='10'>Sem clientes para exportar.</td></tr>"}</tbody>
      </table>
    `;
    const ok = openCorporatePrintWindow({
      title: "Clientes",
      bodyHtml: html,
      browserControls: true,
    });
    setSuccess(ok ? "Documento aberto para impressao/salvar em PDF." : "Nao foi possivel abrir janela de impressao.");
  };

  const renderClientsTable = (list: Client[]) => (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Cliente</TableHead>
            <TableHead>NUIT</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Cidade</TableHead>
            <TableHead>Avalista vinculado</TableHead>
            <TableHead>Garantia</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">{client.name}</TableCell>
              <TableCell className="font-mono text-sm">{client.nuit}</TableCell>
              <TableCell className="text-sm">{client.phone}</TableCell>
              <TableCell className="text-sm">{client.email || "-"}</TableCell>
              <TableCell>{client.city || "-"}</TableCell>
              <TableCell className="text-sm">{guarantorByClientId.get(client.id)?.name || "-"}</TableCell>
              <TableCell className="text-sm font-semibold">
                {(collateralsByClientId.get(client.id) || []).length
                  ? `${money.format((collateralsByClientId.get(client.id) || []).reduce((sum, co) => sum + Number(co.estimatedValue || 0), 0))} MT`
                  : "-"}
              </TableCell>
              <TableCell>{client.score}</TableCell>
              <TableCell>{getStatusBadge(client.status)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => setCreditDetailClient({ id: client.id, name: client.name })}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-100 transition-colors"
                    title="Detalhes de crédito"
                  >
                    <CreditCard className="w-4 h-4 text-blue-600" />
                  </button>
                  <button
                    onClick={() => handleEditClient(client)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-100 transition-colors"
                    title="Editar cliente"
                  >
                    <Edit className="w-4 h-4 text-amber-600" />
                  </button>
                  <button
                    onClick={() => handleDeleteClient(client.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-100 transition-colors"
                    title="Excluir cliente"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestao de Clientes</h1>
          <p className="text-slate-600 mt-1">Cadastro completo e acompanhamento de clientes</p>
        </div>
        <Button onClick={openCreateClientForm} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Abrir Formulario de Cadastro
        </Button>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
      {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">{success}</p>}

      <Dialog open={showClientForm} onOpenChange={(open) => (!open ? resetClientForm() : setShowClientForm(true))}>
        <DialogContent className="max-w-[calc(100vw-6rem)] sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClientId ? "Editar Cadastro de Cliente" : "Novo Cadastro de Cliente"}</DialogTitle>
            <DialogDescription>Preencha todos os campos do cadastro completo do cliente.</DialogDescription>
          </DialogHeader>
          {clientFormFeedback && (
            <p
              className={
                clientFormFeedback.type === "error"
                  ? "text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3"
                  : "text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3"
              }
            >
              {clientFormFeedback.text}
            </p>
          )}
          <form onSubmit={handleSubmitClient} className="space-y-4">
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Dados Gerais</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1 md:col-span-2">
                    <Label>Nome completo / razao social</Label>
                    <Input placeholder="Ex: Joao Manuel Silva" value={clientForm.name} onChange={(e) => setClientForm((s) => ({ ...s, name: e.target.value }))} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo de cliente</Label>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={clientForm.type} onChange={(e) => setClientForm((s) => ({ ...s, type: e.target.value, groupMembers: e.target.value === "grupo" ? s.groupMembers : [] }))}>
                      <option value="singular">Singular</option>
                      <option value="grupo">Grupo</option>
                      <option value="empresa">Empresa</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Data de cadastro</Label>
                    <Input type="date" value={clientForm.registrationDate} onChange={(e) => setClientForm((s) => ({ ...s, registrationDate: e.target.value }))} />
                    <p className="text-xs text-slate-500">Preenchida automaticamente com hoje, mas pode alterar.</p>
                  </div>
                </div>
                {clientForm.type === "grupo" && (
                  <div className="mt-3 rounded border border-indigo-200 bg-indigo-50 p-3 space-y-3">
                    <p className="text-sm font-semibold text-indigo-900">Identificacao do Grupo</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Nome do grupo</Label>
                        <Input value={clientForm.groupName} onChange={(e) => setClientForm((s) => ({ ...s, groupName: e.target.value }))} placeholder="Ex: Grupo Solidario Mavalane" required />
                      </div>
                      <div className="space-y-1">
                        <Label>Lider geral</Label>
                        <Input value={clientForm.groupLeaderName} onChange={(e) => setClientForm((s) => ({ ...s, groupLeaderName: e.target.value }))} placeholder="Nome do lider" />
                      </div>
                      <div className="space-y-1 md:col-span-1">
                        <Label>Descricao</Label>
                        <Input value={clientForm.groupDescription} onChange={(e) => setClientForm((s) => ({ ...s, groupDescription: e.target.value }))} placeholder="Breve descricao do grupo" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-indigo-900">Membros e valor previsto</p>
                        <Button type="button" size="sm" variant="outline" onClick={addGroupMemberDraft}>Adicionar membro</Button>
                      </div>
                      {(clientForm.groupMembers || []).map((member, idx) => (
                        <div key={`group-member-${idx}`} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <Input value="Vinculado ao lider (grupo)" disabled />
                          <Input
                            value={member.memberName}
                            onChange={(e) => {
                              const value = e.target.value;
                              setClientForm((s) => {
                                const next = [...(s.groupMembers || [])];
                                next[idx] = { ...next[idx], memberClientId: "", memberName: value };
                                return { ...s, groupMembers: next };
                              });
                            }}
                            placeholder="Nome do membro"
                          />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={member.allocationAmount || ""}
                            onChange={(e) => {
                              const value = Number(e.target.value) || 0;
                              setClientForm((s) => {
                                const next = [...(s.groupMembers || [])];
                                next[idx] = { ...next[idx], memberClientId: "", allocationAmount: value };
                                return { ...s, groupMembers: next };
                              });
                            }}
                            placeholder="Valor previsto (MT)"
                          />
                          <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => removeGroupMemberDraft(idx)}>Remover</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Identificacao e Contactos</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label>NUIT</Label>
                    <Input
                      placeholder="Ex: 123456789"
                      value={clientForm.nuit}
                      maxLength={MAX_NUIT_LENGTH}
                      inputMode="numeric"
                      onChange={(e) => setClientForm((s) => ({ ...s, nuit: normalizeNuitInput(e.target.value) }))}
                      required
                    />
                    {clientFormLiveErrors.nuit ? (
                      <p className="text-xs text-red-700">{clientFormLiveErrors.nuit}</p>
                    ) : (
                      <p className="text-xs text-slate-500">Somente numeros, exatamente 9 digitos.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo de documento</Label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                      value={clientForm.documentType}
                      onChange={(e) =>
                        setClientForm((s) => ({
                          ...s,
                          documentType: e.target.value,
                          documentNumber: normalizeClientDocumentInput(s.documentNumber, e.target.value),
                        }))
                      }
                    >
                      {MOZAMBIQUE_DOCUMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Numero do documento</Label>
                    <Input
                      placeholder={clientDocumentInput.placeholder}
                      value={clientForm.documentNumber}
                      maxLength={clientDocumentInput.maxLength}
                      onChange={(e) =>
                        setClientForm((s) => ({
                          ...s,
                          documentNumber: normalizeClientDocumentInput(e.target.value, s.documentType),
                        }))
                      }
                      required
                    />
                    {clientFormLiveErrors.documentNumber ? (
                      <p className="text-xs text-red-700">{clientFormLiveErrors.documentNumber}</p>
                    ) : (
                      <p className="text-xs text-slate-500">{clientDocumentInput.hint}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input placeholder="Ex: cliente@empresa.mz" type="email" value={clientForm.email} onChange={(e) => setClientForm((s) => ({ ...s, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone principal</Label>
                    <div className="flex h-10 rounded-md border border-slate-300 bg-white">
                      <div className="inline-flex items-center px-3 text-sm text-slate-600 border-r border-slate-300 bg-slate-50">{COUNTRY_PREFIX}</div>
                      <Input
                        className="border-0 rounded-none h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                        placeholder="841234567"
                        value={extractPhoneLocal(clientForm.phone)}
                        maxLength={MAX_PHONE_LOCAL_LENGTH}
                        inputMode="numeric"
                        onChange={(e) => setClientForm((s) => ({ ...s, phone: composePhoneFromLocal(e.target.value) }))}
                        required
                      />
                    </div>
                    {clientFormLiveErrors.phone ? (
                      <p className="text-xs text-red-700">{clientFormLiveErrors.phone}</p>
                    ) : (
                      <p className="text-xs text-slate-500">Digite somente os 9 digitos apos o prefixo.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone alternativo</Label>
                    <div className="flex h-10 rounded-md border border-slate-300 bg-white">
                      <div className="inline-flex items-center px-3 text-sm text-slate-600 border-r border-slate-300 bg-slate-50">{COUNTRY_PREFIX}</div>
                      <Input
                        className="border-0 rounded-none h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                        placeholder="861234567"
                        value={extractPhoneLocal(clientForm.phoneAlt)}
                        maxLength={MAX_PHONE_LOCAL_LENGTH}
                        inputMode="numeric"
                        onChange={(e) => setClientForm((s) => ({ ...s, phoneAlt: composePhoneFromLocal(e.target.value) }))}
                      />
                    </div>
                    {clientFormLiveErrors.phoneAlt ? (
                      <p className="text-xs text-red-700">{clientFormLiveErrors.phoneAlt}</p>
                    ) : (
                      <p className="text-xs text-slate-500">Opcional. Digite somente os 9 digitos.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Dados Pessoais</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label>Data de nascimento/fundacao</Label>
                    <Input type="date" value={clientForm.birthDate} onChange={(e) => setClientForm((s) => ({ ...s, birthDate: e.target.value }))} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Genero</Label>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={clientForm.gender} onChange={(e) => setClientForm((s) => ({ ...s, gender: e.target.value }))}>
                      <option value="masculino">Masculino</option>
                      <option value="feminino">Feminino</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Estado civil</Label>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={clientForm.maritalStatus} onChange={(e) => setClientForm((s) => ({ ...s, maritalStatus: e.target.value }))}>
                      <option value="solteiro">Solteiro</option>
                      <option value="casado">Casado</option>
                      <option value="divorciado">Divorciado</option>
                      <option value="viuvo">Viuvo</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Nacionalidade</Label>
                    <Input placeholder="Ex: Mocambicana" value={clientForm.nationality} onChange={(e) => setClientForm((s) => ({ ...s, nationality: e.target.value }))} required />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Endereco</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label>Provincia</Label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                      value={clientForm.province}
                      onChange={(e) =>
                        setClientForm((s) => ({
                          ...s,
                          province: e.target.value,
                          district: "",
                        }))
                      }
                      required
                    >
                      <option value="">Selecione a provincia</option>
                      {MOZAMBIQUE_PROVINCES.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Cidade</Label>
                    <Input placeholder="Ex: Maputo Cidade" value={clientForm.city} onChange={(e) => setClientForm((s) => ({ ...s, city: e.target.value }))} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Distrito</Label>
                    <select
                      className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                      value={clientForm.district}
                      onChange={(e) => setClientForm((s) => ({ ...s, district: e.target.value }))}
                      disabled={!clientForm.province}
                      required
                    >
                      <option value="">Selecione o distrito</option>
                      {districtOptions.map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Bairro</Label>
                    <Input placeholder="Ex: Alto Mae" value={clientForm.neighborhood} onChange={(e) => setClientForm((s) => ({ ...s, neighborhood: e.target.value }))} />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label>Endereco completo</Label>
                    <Input placeholder="Ex: Avenida 24 de Julho" value={clientForm.addressLine} onChange={(e) => setClientForm((s) => ({ ...s, addressLine: e.target.value }))} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Numero da casa/escritorio</Label>
                    <Input placeholder="Ex: 250" value={clientForm.houseNumber} onChange={(e) => setClientForm((s) => ({ ...s, houseNumber: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Dados Financeiros e Negocio</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label>Profissao / atividade principal</Label>
                    <Input placeholder="Ex: Comerciante" value={clientForm.occupation} onChange={(e) => setClientForm((s) => ({ ...s, occupation: e.target.value }))} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Entidade empregadora</Label>
                    <Input placeholder="Ex: Mercado Central" value={clientForm.employerName} onChange={(e) => setClientForm((s) => ({ ...s, employerName: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Nome da empresa/negocio</Label>
                    <Input placeholder="Ex: Negocio Familiar Silva" value={clientForm.businessName} onChange={(e) => setClientForm((s) => ({ ...s, businessName: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Setor de atividade</Label>
                    <Input placeholder="Ex: Comercio / Agricultura / Servicos" value={clientForm.businessSector} onChange={(e) => setClientForm((s) => ({ ...s, businessSector: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Renda mensal (MT)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 85000"
                      value={clientForm.monthlyIncome || ""}
                      onChange={(e) => setClientForm((s) => ({ ...s, monthlyIncome: Number(e.target.value) || 0 }))}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Despesas mensais (MT)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 32000"
                      value={clientForm.monthlyExpenses || ""}
                      onChange={(e) => setClientForm((s) => ({ ...s, monthlyExpenses: Number(e.target.value) || 0 }))}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Score de credito (automatico)</Label>
                    <Input type="number" min={0} max={1000} value={clientForm.score} readOnly disabled />
                    <p className="text-xs text-slate-500">Calculado automaticamente com base em renda, despesas e status.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Carteira do cliente</Label>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={clientForm.carteiraId} onChange={(e) => setClientForm((s) => ({ ...s, carteiraId: e.target.value }))}>
                      <option value="">Sem carteira</option>
                      {carteirasLista.map((c) => (
                        <option key={c.id} value={String(c.id)}>{c.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">Define a carteira responsável por este cliente, seus desembolsos e reembolsos.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Status atual do cliente</Label>
                    <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={clientForm.status} onChange={(e) => setClientForm((s) => ({ ...s, status: e.target.value }))}>
                      <option value="active">Ativo</option>
                      <option value="warning">Atencao</option>
                      <option value="alert">Alerta</option>
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-4">
                    <Label>Observacoes adicionais</Label>
                    <Input placeholder="Ex: Cliente com historico positivo de pagamento" value={clientForm.notes} onChange={(e) => setClientForm((s) => ({ ...s, notes: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Secção de Garantias do Cliente */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-indigo-600" /> Garantias do Cliente
                    </h3>
                    <p className="text-xs text-slate-500">Registe os bens ou garantias materiais em posse do cliente que serão salvos na base de dados.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setClientForm((s) => ({
                        ...s,
                        collateralRows: [...(s.collateralRows || []), { collateralType: "Imovel", description: "", estimatedValue: 0, documentRef: "" }],
                      }));
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    + Adicionar Garantia
                  </button>
                </div>

                <div className="space-y-2">
                  {(clientForm.collateralRows || []).map((row, idx) => (
                    <div key={`client-collateral-${idx}`} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm items-end">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-700">Tipo de Bem</Label>
                        <select
                          className="h-9 w-full rounded-md border border-slate-300 bg-white text-slate-900 px-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                          value={row.collateralType}
                          onChange={(e) => {
                            const newRows = [...(clientForm.collateralRows || [])];
                            newRows[idx] = { ...newRows[idx], collateralType: e.target.value };
                            setClientForm((s) => ({ ...s, collateralRows: newRows }));
                          }}
                        >
                          <option value="Imovel" className="text-slate-900 bg-white">Imóvel (Casa/Terreno)</option>
                          <option value="Viatura" className="text-slate-900 bg-white">Viatura / Moto</option>
                          <option value="Equipamento" className="text-slate-900 bg-white">Equipamento / Máquina</option>
                          <option value="Mercadoria" className="text-slate-900 bg-white">Stock / Mercadoria</option>
                          <option value="Outro" className="text-slate-900 bg-white">Outro</option>
                        </select>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs font-medium text-slate-700">Descrição do Bem</Label>
                        <Input
                          placeholder="Ex: Terreno com DUAT nº 1234 em Moatize"
                          value={row.description}
                          className="h-9 text-xs"
                          onChange={(e) => {
                            const newRows = [...(clientForm.collateralRows || [])];
                            newRows[idx] = { ...newRows[idx], description: e.target.value };
                            setClientForm((s) => ({ ...s, collateralRows: newRows }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-700">Doc. / Registo</Label>
                        <Input
                          placeholder="Ex: Registo Predial / Matrícula"
                          value={row.documentRef}
                          className="h-9 text-xs"
                          onChange={(e) => {
                            const newRows = [...(clientForm.collateralRows || [])];
                            newRows[idx] = { ...newRows[idx], documentRef: e.target.value };
                            setClientForm((s) => ({ ...s, collateralRows: newRows }));
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="space-y-1 flex-1">
                          <Label className="text-xs font-medium text-slate-700">Valor Estimado (MT)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="h-9 text-xs font-bold text-indigo-700"
                            value={row.estimatedValue || ""}
                            onChange={(e) => {
                              const newRows = [...(clientForm.collateralRows || [])];
                              newRows[idx] = { ...newRows[idx], estimatedValue: Number(e.target.value) || 0 };
                              setClientForm((s) => ({ ...s, collateralRows: newRows }));
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newRows = (clientForm.collateralRows || []).filter((_, i) => i !== idx);
                            setClientForm((s) => ({ ...s, collateralRows: newRows }));
                          }}
                          className="h-9 px-2 text-xs font-medium rounded-md border border-red-200 text-red-600 hover:bg-red-50 mt-5"
                          title="Remover garantia"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!clientForm.collateralRows || clientForm.collateralRows.length === 0) && (
                    <p className="text-xs text-slate-400 italic py-1">Nenhuma garantia adicionada até ao momento. Clique em "+ Adicionar Garantia" para registar.</p>
                  )}
                </div>
              </div>

              {/* Secção de Avalista / Fiador */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-600" /> Avalista / Fiador do Cliente
                    </h3>
                    <p className="text-xs text-slate-500">Indique se o cliente possui um terceiro como avalista solidário.</p>
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-lg">
                    <span className="text-xs font-semibold text-slate-700 pl-2">Tem Avalista?</span>
                    <button
                      type="button"
                      onClick={() => setClientForm((s) => ({ ...s, hasGuarantor: false }))}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        !clientForm.hasGuarantor ? "bg-slate-200 text-slate-900 font-bold" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Não
                    </button>
                    <button
                      type="button"
                      onClick={() => setClientForm((s) => ({ ...s, hasGuarantor: true }))}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        clientForm.hasGuarantor ? "bg-emerald-600 text-white font-bold shadow-sm" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Sim
                    </button>
                  </div>
                </div>

                {clientForm.hasGuarantor && (
                  <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm space-y-4 transition-all">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Nome Completo do Avalista *</Label>
                        <Input
                          placeholder="Ex: Carlos Alberto Mondlane"
                          value={clientForm.guarantor?.name || ""}
                          onChange={(e) => setClientForm((s) => ({ ...s, guarantor: { ...(s.guarantor || {}), name: e.target.value } }))}
                          required={clientForm.hasGuarantor}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">NUIT do Avalista</Label>
                        <Input
                          placeholder="Ex: 123456789"
                          maxLength={9}
                          value={clientForm.guarantor?.nuit || ""}
                          onChange={(e) => setClientForm((s) => ({ ...s, guarantor: { ...(s.guarantor || {}), nuit: e.target.value } }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Telefone / Contacto *</Label>
                        <Input
                          placeholder="Ex: 841234567"
                          value={clientForm.guarantor?.phone || ""}
                          onChange={(e) => setClientForm((s) => ({ ...s, guarantor: { ...(s.guarantor || {}), phone: e.target.value } }))}
                          required={clientForm.hasGuarantor}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-700">Grau de Parentesco / Relação</Label>
                        <Input
                          placeholder="Ex: Irmão, Cônjuge, Sócio, Colega"
                          value={clientForm.guarantor?.relation || ""}
                          onChange={(e) => setClientForm((s) => ({ ...s, guarantor: { ...(s.guarantor || {}), relation: e.target.value } }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-700">Profissão / Actividade</Label>
                        <Input
                          placeholder="Ex: Funcionário Público, Comerciante"
                          value={clientForm.guarantor?.occupation || ""}
                          onChange={(e) => setClientForm((s) => ({ ...s, guarantor: { ...(s.guarantor || {}), occupation: e.target.value } }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-700">Montante Assegurado (MT)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={clientForm.guarantor?.guaranteedAmount || ""}
                          onChange={(e) => setClientForm((s) => ({ ...s, guarantor: { ...(s.guarantor || {}), guaranteedAmount: Number(e.target.value) || 0 } }))}
                        />
                      </div>
                    </div>

                    {/* Garantia Adicional do Avalista */}
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                            checked={Boolean(clientForm.guarantor?.hasCollateral)}
                            onChange={(e) =>
                              setClientForm((s) => ({
                                ...s,
                                guarantor: { ...(s.guarantor || {}), hasCollateral: e.target.checked },
                              }))
                            }
                          />
                          O Avalista possui Garantia material/financeira associada?
                        </Label>
                      </div>

                      {clientForm.guarantor?.hasCollateral && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-slate-700">Tipo de Garantia</Label>
                            <select
                              className="h-9 w-full rounded-md border border-slate-300 bg-white text-slate-900 px-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                              value={clientForm.guarantor?.collateralType || "Imovel"}
                              onChange={(e) =>
                                setClientForm((s) => ({
                                  ...s,
                                  guarantor: { ...(s.guarantor || {}), collateralType: e.target.value },
                                }))
                              }
                            >
                              <option value="Imovel" className="text-slate-900 bg-white">Imóvel</option>
                              <option value="Viatura" className="text-slate-900 bg-white">Viatura</option>
                              <option value="Equipamento" className="text-slate-900 bg-white">Equipamento</option>
                              <option value="DeclaracaoRendimento" className="text-slate-900 bg-white">Declaração de Rendimento</option>
                              <option value="Outro" className="text-slate-900 bg-white">Outro</option>
                            </select>
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label className="text-xs font-medium text-slate-700">Descrição da Garantia do Avalista</Label>
                            <Input
                              placeholder="Ex: Livrete de viatura Toyota Hilux nº ABC-123"
                              value={clientForm.guarantor?.collateralDescription || ""}
                              className="h-9 text-xs"
                              onChange={(e) =>
                                setClientForm((s) => ({
                                  ...s,
                                  guarantor: { ...(s.guarantor || {}), collateralDescription: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-slate-700">Valor Estimado (MT)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={clientForm.guarantor?.collateralValue || ""}
                              className="h-9 text-xs font-bold text-indigo-700"
                              onChange={(e) =>
                                setClientForm((s) => ({
                                  ...s,
                                  guarantor: { ...(s.guarantor || {}), collateralValue: Number(e.target.value) || 0 },
                                }))
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="outline" onClick={resetClientForm}>Cancelar</Button>
              <Button disabled={savingClient} type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                {savingClient ? "A salvar registo..." : editingClientId ? "Atualizar Cadastro" : "Salvar Cadastro Completo"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showGuarantorForm} onOpenChange={(open) => (!open ? resetGuarantorForm() : setShowGuarantorForm(true))}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingGuarantorId ? "Editar Avalista" : "Novo Avalista"}</DialogTitle>
            <DialogDescription>Preencha os dados completos do avalista.</DialogDescription>
          </DialogHeader>
          {guarantorFormFeedback && (
            <p
              className={
                guarantorFormFeedback.type === "error"
                  ? "text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3"
                  : "text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3"
              }
            >
              {guarantorFormFeedback.text}
            </p>
          )}
          <form onSubmit={handleSubmitGuarantor} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nome completo</Label>
              <Input value={guarantorForm.name} onChange={(e) => setGuarantorForm((s) => ({ ...s, name: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <Label>NUIT</Label>
              <Input
                value={guarantorForm.nuit}
                maxLength={MAX_NUIT_LENGTH}
                inputMode="numeric"
                onChange={(e) => setGuarantorForm((s) => ({ ...s, nuit: normalizeNuitInput(e.target.value) }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <div className="flex h-10 rounded-md border border-slate-300 bg-white">
                <div className="inline-flex items-center px-3 text-sm text-slate-600 border-r border-slate-300 bg-slate-50">{COUNTRY_PREFIX}</div>
                <Input
                  className="border-0 rounded-none h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={extractPhoneLocal(guarantorForm.phone)}
                  maxLength={MAX_PHONE_LOCAL_LENGTH}
                  inputMode="numeric"
                  onChange={(e) => setGuarantorForm((s) => ({ ...s, phone: composePhoneFromLocal(e.target.value) }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Cliente associado</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={guarantorForm.clientId}
                onChange={(e) => setGuarantorForm((s) => ({ ...s, clientId: e.target.value }))}
                required
              >
                <option value="">Selecione o cliente que terá este avalista</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.nuit})
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={guarantorForm.hasGuarantee}
                  onChange={(e) => setGuarantorForm((s) => ({ ...s, hasGuarantee: e.target.checked }))}
                />
                <span className="text-sm text-slate-700">Este avalista oferece garantia real?</span>
              </label>
            </div>
            {guarantorForm.hasGuarantee && (
              <>
                <div className="space-y-1">
                  <Label>Tipo de garantia</Label>
                  <select
                    className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                    value={guarantorForm.guaranteeType}
                    onChange={(e) => setGuarantorForm((s) => ({ ...s, guaranteeType: e.target.value }))}
                    required={guarantorForm.hasGuarantee}
                  >
                    <option value="">Selecione o tipo</option>
                    <option value="Imóvel">Imóvel</option>
                    <option value="Veículo">Veículo</option>
                    <option value="Equipamento">Equipamento</option>
                    <option value="Mercadoria">Mercadoria</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Input
                    placeholder="Descreva a garantia oferecida"
                    value={guarantorForm.guaranteeDescription}
                    onChange={(e) => setGuarantorForm((s) => ({ ...s, guaranteeDescription: e.target.value }))}
                    required={guarantorForm.hasGuarantee}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Valor estimado (MT)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={guarantorForm.guaranteeEstimatedValue || ""}
                    onChange={(e) => setGuarantorForm((s) => ({ ...s, guaranteeEstimatedValue: Number(e.target.value) || 0 }))}
                    required={guarantorForm.hasGuarantee}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Referência documental</Label>
                  <Input
                    placeholder="Ex: Certidão nº 1234/2025"
                    value={guarantorForm.guaranteeDocumentRef}
                    onChange={(e) => setGuarantorForm((s) => ({ ...s, guaranteeDocumentRef: e.target.value }))}
                  />
                </div>
              </>
            )}
            <div className="md:col-span-2 flex gap-2 pt-2">
              <Button disabled={savingGuarantor} type="submit">{editingGuarantorId ? "Atualizar Avalista" : "Salvar Avalista"}</Button>
              <Button type="button" variant="outline" onClick={resetGuarantorForm}>Cancelar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCollateralForm} onOpenChange={(open) => (!open ? resetCollateralForm() : setShowCollateralForm(true))}>
        <DialogContent className="sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Garantias do Cliente</DialogTitle>
            <DialogDescription>Adicione, edite ou remova varias garantias e salve tudo de uma so vez.</DialogDescription>
          </DialogHeader>
          {collateralFormFeedback && (
            <p
              className={
                collateralFormFeedback.type === "error"
                  ? "text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3"
                  : "text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3"
              }
            >
              {collateralFormFeedback.text}
            </p>
          )}
          <form onSubmit={handleSubmitCollateral} className="space-y-3">
            <div className="space-y-1">
              <Label>Cliente associado</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                value={collateralForm.clientId}
                onChange={(e) => handleCollateralClientChange(e.target.value)}
                required
              >
                <option value="">Selecione o cliente da garantia</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.nuit})
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descricao</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Valor (MT)</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acao</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collateralRows.map((row) => (
                    <TableRow key={row.rowKey}>
                      <TableCell>
                        <select
                          className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          value={row.collateralType}
                          onChange={(e) => updateCollateralRow(row.rowKey, { collateralType: e.target.value })}
                        >
                          <option value="Imovel">Imovel</option>
                          <option value="Viatura">Viatura</option>
                          <option value="Equipamento">Equipamento</option>
                          <option value="Mercadoria">Mercadoria</option>
                          <option value="Outro">Outro</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Descricao da garantia"
                          value={row.description}
                          onChange={(e) => updateCollateralRow(row.rowKey, { description: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Referencia documental"
                          value={row.documentRef}
                          onChange={(e) => updateCollateralRow(row.rowKey, { documentRef: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.estimatedValue || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCollateralRow(row.rowKey, { estimatedValue: val === "" ? 0 : Number(val) });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          value={row.status}
                          onChange={(e) => updateCollateralRow(row.rowKey, { status: e.target.value as "active" | "released" })}
                        >
                          <option value="active">Ativa</option>
                          <option value="released">Liberada</option>
                        </select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => removeCollateralRow(row.rowKey)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={3} className="font-semibold">Total Geral</TableCell>
                    <TableCell className="font-semibold">
                      {money.format(collateralRows.reduce((sum, row) => sum + Number(row.estimatedValue || 0), 0))} MT
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={addCollateralRow}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar linha
              </Button>
              <Button disabled={savingCollateral} type="submit">Salvar todas as garantias</Button>
              <Button type="button" variant="outline" onClick={resetCollateralForm}>Cancelar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        {[
          { label: "Total de Clientes", value: payload?.stats.total || 0, icon: Users, color: "blue" },
          { label: "Clientes Singulares", value: payload?.stats.singular || 0, icon: Users, color: "emerald" },
          { label: "Grupos", value: payload?.stats.grupo || 0, icon: Users, color: "indigo" },
          { label: "Empresas", value: payload?.stats.empresa || 0, icon: Building2, color: "purple" },
          { label: "Avalistas", value: payload?.stats.guarantors || 0, icon: UserCheck, color: "amber" },
          { label: "Garantias", value: payload?.stats.collaterals || 0, icon: ShieldCheck, color: "teal" },
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
        <TabsList className="grid w-full grid-cols-8 mb-6">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="singular">Singulares</TabsTrigger>
          <TabsTrigger value="grupo">Grupos</TabsTrigger>
          <TabsTrigger value="empresa">Empresas</TabsTrigger>
          <TabsTrigger value="guarantors">Avalistas</TabsTrigger>
          <TabsTrigger value="collaterals">Garantias</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
          <TabsTrigger value="evaluation">Avaliacao + Analise</TabsTrigger>
        </TabsList>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input placeholder="Pesquisar por nome ou NUIT..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <select value={carteiraFilter} onChange={(e) => setCarteiraFilter(e.target.value)} className="h-10 px-3 rounded-md border border-slate-300 text-sm bg-white" aria-label="Filtrar por carteira">
            <option value="all">Todas as carteiras</option>
            {carteirasLista.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
          <Button variant="outline" onClick={() => setSuccess(`Filtro aplicado para "${searchTerm || "todos"}".`)}>
            <Filter className="w-4 h-4 mr-2" />
            Filtros
          </Button>
          <Button variant="outline" onClick={exportClientsPdf}>
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={exportClientsExcel}>
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel (CSV)
          </Button>
        </div>

        <TabsContent forceMount value="all" className="mt-0">{renderClientsTable(clientsFiltered)}</TabsContent>
        <TabsContent forceMount value="singular" className="mt-0">{renderClientsTable(clientsFiltered.filter((client) => client.type === "singular"))}</TabsContent>
        <TabsContent forceMount value="grupo" className="mt-0">{renderClientsTable(clientsFiltered.filter((client) => client.type === "grupo"))}</TabsContent>
        <TabsContent forceMount value="empresa" className="mt-0">{renderClientsTable(clientsFiltered.filter((client) => client.type === "empresa"))}</TabsContent>
        <TabsContent forceMount value="guarantors" className="mt-0">
          <div className="flex justify-end mb-3">
            <Button onClick={openCreateGuarantorForm} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              Novo Avalista
            </Button>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Avalista</TableHead>
                  <TableHead>Cliente Vinculado</TableHead>
                  <TableHead>NUIT</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Valor Garantido</TableHead>
                  <TableHead>Garantias Ativas</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guarantors.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell>{g.clientName || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{g.nuit}</TableCell>
                    <TableCell className="text-sm">{g.phone}</TableCell>
                    <TableCell className="font-semibold">{money.format(g.guaranteedAmount)} MT</TableCell>
                    <TableCell>{g.activeGuarantees}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleEditGuarantor(g)}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteGuarantor(g.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent forceMount value="collaterals" className="mt-0">
          <div className="flex justify-end mb-3">
            <Button onClick={openCreateCollateralForm} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              Nova Garantia
            </Button>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Cliente Vinculado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Valor Estimado</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collaterals.map((co) => (
                  <TableRow key={co.id}>
                    <TableCell className="font-medium">{co.clientName || "-"}</TableCell>
                    <TableCell>{co.collateralType}</TableCell>
                    <TableCell>{co.description}</TableCell>
                    <TableCell>{co.documentRef || "-"}</TableCell>
                    <TableCell>
                      <Badge className={co.status === "active" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200"}>
                        {co.status === "active" ? "Ativa" : "Liberada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{money.format(co.estimatedValue)} MT</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleEditCollateral(co)}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteCollateral(co.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent forceMount value="documents" className="mt-0 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <FileCheck className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Gestao Documental Robusta</h3>
                <p className="text-sm text-slate-600">
                  Upload com versionamento, validade e checklist obrigatorio (BI, comprovativos e contrato assinado).
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1 md:col-span-2">
              <Label>Cliente</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                value={documentClientId}
                onChange={(e) => setDocumentClientId(e.target.value)}
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.nuit})
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Checklist Obrigatorio</p>
              <p className="text-xl font-bold text-slate-900">
                {documentsPayload?.summary.compliantItems || 0}/{documentsPayload?.summary.requiredItems || 0}
              </p>
              <p className="text-xs text-slate-600">
                {documentsPayload?.summary.checklistCompleted ? "Conforme" : "Pendente"}
              </p>
            </div>
          </div>

          {documentClientId && (
            <form onSubmit={handleUploadDocument} className="rounded-lg border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Documento</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                  value={documentForm.docType}
                  onChange={(e) => handleDocumentTypeChange(e.target.value)}
                >
                  {DOCUMENT_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Titulo</Label>
                <Input value={documentForm.title} onChange={(e) => setDocumentForm((s) => ({ ...s, title: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Ficheiro (PDF/PNG/JPG, ate {MAX_DOCUMENT_MB}MB)</Label>
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(e) => setDocumentForm((s) => ({ ...s, file: e.target.files?.[0] || null }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Data de Emissao</Label>
                <Input type="date" value={documentForm.issuedOn} onChange={(e) => setDocumentForm((s) => ({ ...s, issuedOn: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Data de Validade</Label>
                <Input type="date" value={documentForm.expiresOn} onChange={(e) => setDocumentForm((s) => ({ ...s, expiresOn: e.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label>Nota</Label>
                <Textarea value={documentForm.note} onChange={(e) => setDocumentForm((s) => ({ ...s, note: e.target.value }))} />
              </div>
              <div className="md:col-span-3">
                <Button type="submit" disabled={uploadingDocument} className="bg-gradient-to-r from-blue-600 to-sky-700 hover:from-blue-700 hover:to-sky-800">
                  <FileUp className="w-4 h-4 mr-2" />
                  {uploadingDocument ? "A carregar..." : "Carregar Nova Versao"}
                </Button>
              </div>
            </form>
          )}

          {!documentClientId && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
              Selecione um cliente para ver checklist e carregar documentos.
            </div>
          )}

          {loadingDocuments && <p className="text-sm text-slate-600">A carregar documentos...</p>}

          {documentClientId && documentsPayload && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {documentsPayload.checklist.map((item) => (
                  <div key={item.type} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-1">Obrigatorio</p>
                    <div className="mt-2">
                      {item.status === "missing" && <Badge className="bg-slate-100 text-slate-800 border-slate-200">Em falta</Badge>}
                      {item.status === "expired" && <Badge className="bg-red-100 text-red-800 border-red-200">Expirado</Badge>}
                      {item.status === "expiring" && <Badge className="bg-amber-100 text-amber-800 border-amber-200">A expirar</Badge>}
                      {item.status === "valid" && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Valido</Badge>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Tipo</TableHead>
                      <TableHead>Titulo</TableHead>
                      <TableHead>Versao</TableHead>
                      <TableHead>Ficheiro</TableHead>
                      <TableHead>Tamanho</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Carregado Por</TableHead>
                      <TableHead className="text-right">Acao</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentsPayload.versions.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>{DOCUMENT_TYPE_OPTIONS.find((d) => d.value === doc.docType)?.label || doc.docType}</TableCell>
                        <TableCell>{doc.title}</TableCell>
                        <TableCell>v{doc.versionNo}</TableCell>
                        <TableCell>{doc.fileName}</TableCell>
                        <TableCell>{formatBytes(doc.fileSizeBytes)}</TableCell>
                        <TableCell>{doc.expiresOn || "-"}</TableCell>
                        <TableCell>
                          {doc.status === "expired" && <Badge className="bg-red-100 text-red-800 border-red-200">Expirado</Badge>}
                          {doc.status === "expiring" && <Badge className="bg-amber-100 text-amber-800 border-amber-200">A expirar</Badge>}
                          {doc.status === "valid" && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Valido</Badge>}
                        </TableCell>
                        <TableCell>{doc.uploadedByName || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => handleDownloadDocument(doc.id, doc.fileName)}>
                            <Download className="w-4 h-4 mr-1" />
                            Baixar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {documentsPayload.versions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-sm text-slate-500 py-6">
                          Nenhum documento carregado para este cliente.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {(documentsPayload.summary.expiredItems > 0 || documentsPayload.summary.missingItems > 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Checklist incompleto: existem documentos obrigatorios em falta ou expirados.
                </div>
              )}
            </>
          )}
        </TabsContent>
        <TabsContent forceMount value="evaluation" className="mt-0 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-100 p-2">
                <ClipboardCheck className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Avaliacao + Analise de Credito</h3>
                <p className="text-sm text-slate-600">
                  Avaliacao automatica com analise profissional integrada por fonte de rendimento (funcionario/negociante), incluindo capacidade de pagamento, servico da divida e margens.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1 md:col-span-2">
                <Label>Cliente para avaliacao</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                  value={evaluationClientId}
                  onChange={(e) => setEvaluationClientId(e.target.value)}
                >
                  <option value="">Selecione um cliente cadastrado</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.nuit}) - {client.type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Valor solicitado (MT)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="Ex: 250000"
                  value={professionalEvaluationForm.requestedAmountInput}
                  onChange={(e) => updateProfessionalEvaluationField("requestedAmountInput", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Prazo (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  value={professionalEvaluationForm.periodMonths}
                  onChange={(e) => updateProfessionalEvaluationField("periodMonths", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Taxa mensal (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={professionalEvaluationForm.monthlyRatePercent}
                  onChange={(e) => updateProfessionalEvaluationField("monthlyRatePercent", e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label>Nota do analista (opcional)</Label>
                <Textarea
                  placeholder="Escreva observacoes desta avaliacao (ex: condicoes especiais, documentos pendentes, justificacao de parecer)."
                  value={evaluationNote}
                  onChange={(e) => setEvaluationNote(e.target.value)}
                />
              </div>
              <div className="md:col-span-4 flex flex-wrap gap-2">
                <Button type="button" onClick={handleRegisterEvaluation} disabled={savingEvaluation || !evaluationClientId}>
                  {savingEvaluation ? "A registar..." : "Registrar Avaliacao no Historico"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedEvaluationClient}
                  onClick={() => {
                    if (!selectedEvaluationClient) return;
                    setProfessionalEvaluationForm(buildProfessionalCreditFormDefaults(selectedEvaluationClient));
                  }}
                >
                  Recarregar dados automaticos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!professionalCreditAnalysis}
                  onClick={() => setEvaluationNote(professionalCreditAnalysis?.autoNote || "")}
                >
                  Preencher nota com resumo automatico
                </Button>
                <Button
                  type="button"
                  disabled={!evaluationClientId || !selectedEvaluationClient || !professionalCreditAnalysis || professionalCreditAnalysis.requestedAmount <= 0}
                  onClick={handleCreateLoanRequest}
                  className="bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800"
                >
                  Solicitar Credito / Reemprestimo
                </Button>
              </div>
            </div>
          </div>

          {!evaluation && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
              Selecione um cliente para gerar a avaliacao automatica e a analise profissional.
            </div>
          )}

          {evaluation && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Score da Avaliacao</p>
                  <p className="text-2xl font-bold text-slate-900">{evaluation.finalScore}/100</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Parecer</p>
                  <p className="text-lg font-semibold text-slate-900">{evaluation.decision}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Renda - Despesas</p>
                  <p className="text-lg font-semibold text-slate-900">{money.format(evaluation.disposableIncome)} MT</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Divida / Renda</p>
                  <p className="text-lg font-semibold text-slate-900">{evaluation.debtToIncome.toFixed(2)}x</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Score cadastral</p>
                  <p className="text-lg font-semibold text-slate-900">{evaluation.client.score}/1000</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-semibold text-slate-900">Analise Profissional Integrada</h4>
                  {professionalCreditAnalysis && (
                    <div className="flex items-center gap-2 text-xs">
                      <Badge className="bg-slate-100 text-slate-800 border-slate-200">
                        Fonte inferida: {professionalCreditAnalysis.inferredIncomeSource === "negociante" ? "Negociante" : "Funcionario"}
                      </Badge>
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                        Fonte usada: {professionalCreditAnalysis.incomeSource === "negociante" ? "Negociante" : "Funcionario"}
                      </Badge>
                    </div>
                  )}
                </div>

                {selectedEvaluationClient && (
                  <div className="space-y-4">
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={professionalEvaluationForm.incomeSource === "funcionario" ? "default" : "ghost"}
                        className={professionalEvaluationForm.incomeSource === "funcionario" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-600"}
                        onClick={() => updateProfessionalEvaluationField("incomeSource", "funcionario")}
                      >
                        Funcionario
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={professionalEvaluationForm.incomeSource === "negociante" ? "default" : "ghost"}
                        className={professionalEvaluationForm.incomeSource === "negociante" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-600"}
                        onClick={() => updateProfessionalEvaluationField("incomeSource", "negociante")}
                      >
                        Negociante
                      </Button>
                    </div>

                    <div
                      className={professionalEvaluationForm.incomeSource === "funcionario" ? "grid grid-cols-1 md:grid-cols-4 gap-3" : "hidden"}
                      aria-hidden={professionalEvaluationForm.incomeSource !== "funcionario"}
                    >
                        <div className="space-y-1">
                          <Label>Salario base (auto)</Label>
                          <Input value={formatCurrencyInput(selectedEvaluationClient.monthlyIncome)} readOnly className="bg-slate-50" />
                        </div>
                        <div className="space-y-1">
                          <Label>Outros rendimentos</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.salaryOtherIncomeInput} onChange={(e) => updateProfessionalEvaluationField("salaryOtherIncomeInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Descontos/compromissos</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.payrollDiscountsInput} onChange={(e) => updateProfessionalEvaluationField("payrollDiscountsInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Servico da divida atual</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.existingDebtServiceInput} onChange={(e) => updateProfessionalEvaluationField("existingDebtServiceInput", e.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-4">
                          <Label>Percentual maximo sobre salario (opcional)</Label>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => updateProfessionalEvaluationField("salaryCommitmentPercent", "30")}>30%</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => updateProfessionalEvaluationField("salaryCommitmentPercent", "40")}>40%</Button>
                            <div className="w-28">
                              <Input type="number" min={5} max={80} step="1" value={professionalEvaluationForm.salaryCommitmentPercent} onChange={(e) => updateProfessionalEvaluationField("salaryCommitmentPercent", e.target.value)} />
                            </div>
                          </div>
                        </div>
                      </div>
                    <div
                      className={professionalEvaluationForm.incomeSource === "negociante" ? "grid grid-cols-1 md:grid-cols-4 gap-3" : "hidden"}
                      aria-hidden={professionalEvaluationForm.incomeSource !== "negociante"}
                    >
                        <div className="space-y-1">
                          <Label>Vendas</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.businessSalesInput} onChange={(e) => updateProfessionalEvaluationField("businessSalesInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Compras</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.businessPurchasesInput} onChange={(e) => updateProfessionalEvaluationField("businessPurchasesInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Gastos operacionais</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.businessOperatingExpensesInput} onChange={(e) => updateProfessionalEvaluationField("businessOperatingExpensesInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Outros rendimentos</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.businessOtherIncomeInput} onChange={(e) => updateProfessionalEvaluationField("businessOtherIncomeInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Servico da divida atual</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.existingDebtServiceInput} onChange={(e) => updateProfessionalEvaluationField("existingDebtServiceInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Total em stock</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.stockTotalInput} onChange={(e) => updateProfessionalEvaluationField("stockTotalInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Stock disponivel</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.stockAvailableInput} onChange={(e) => updateProfessionalEvaluationField("stockAvailableInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Caixa disponivel</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.cashAvailableInput} onChange={(e) => updateProfessionalEvaluationField("cashAvailableInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Contas a receber</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.receivablesInput} onChange={(e) => updateProfessionalEvaluationField("receivablesInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Contas a pagar</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.payablesInput} onChange={(e) => updateProfessionalEvaluationField("payablesInput", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Outros passivos</Label>
                          <Input inputMode="decimal" value={professionalEvaluationForm.otherLiabilitiesInput} onChange={(e) => updateProfessionalEvaluationField("otherLiabilitiesInput", e.target.value)} />
                        </div>
                      </div>
                  </div>
                )}

                {professionalCreditAnalysis && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Score profissional</p>
                        <p className="text-2xl font-bold text-slate-900">{professionalCreditAnalysis.finalScore}/100</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Parecer</p>
                        <p className="text-lg font-semibold text-slate-900">{professionalCreditAnalysis.decision}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Prestacao estimada</p>
                        <p className="text-lg font-semibold text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.estimatedInstallment)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Capacidade</p>
                        <p className="text-lg font-semibold text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.paymentCapacity)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Cobertura de fluxo</p>
                        <p className="text-lg font-semibold text-slate-900">{professionalCreditAnalysis.capacityCoverage.toFixed(2)}x</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Cobertura patrimonial</p>
                        <p className="text-lg font-semibold text-slate-900">{professionalCreditAnalysis.patrimonialCoverage.toFixed(2)}x</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <h5 className="text-sm font-semibold text-slate-900 mb-2">Indicadores Principais</h5>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <span className="text-slate-600">Divida atual</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.existingDebt)}</span>
                          <span className="text-slate-600">Servico da divida atual</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.existingDebtService)}</span>
                          <span className="text-slate-600">Servico da divida total</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.debtServiceTotal)}</span>
                          <span className="text-slate-600">Cobertura serv. divida</span><span className="text-right font-medium text-slate-900">{professionalCreditAnalysis.debtServiceCoverage.toFixed(2)}x</span>
                          <span className="text-slate-600">Divida / renda</span><span className="text-right font-medium text-slate-900">{professionalCreditAnalysis.debtToIncome.toFixed(2)}x</span>
                          <span className="text-slate-600">Total a pagar</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.totalRepayable)}</span>
                          <span className="text-slate-600">Base patrimonial</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.patrimonialCoverageBase)}</span>
                          <span className="text-slate-600">Garantias (bens)</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.collateralTotal)}</span>
                          {professionalCreditAnalysis.incomeSource === "funcionario" ? (
                            <>
                              <span className="text-slate-600">Limite por % salario</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.salaryPolicyCapacity)}</span>
                              <span className="text-slate-600">% aplicado</span><span className="text-right font-medium text-slate-900">{professionalCreditAnalysis.salaryCommitmentPercent.toFixed(0)}%</span>
                            </>
                          ) : (
                            <>
                              <span className="text-slate-600">Lucro bruto</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.grossProfit)}</span>
                              <span className="text-slate-600">Lucro liquido</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.netProfit)}</span>
                              <span className="text-slate-600">Margem bruta</span><span className="text-right font-medium text-slate-900">{professionalCreditAnalysis.grossMargin.toFixed(1)}%</span>
                              <span className="text-slate-600">Margem liquida</span><span className="text-right font-medium text-slate-900">{professionalCreditAnalysis.netMargin.toFixed(1)}%</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <h5 className="text-sm font-semibold text-slate-900 mb-2">
                          {professionalCreditAnalysis.incomeSource === "negociante" ? "Liquidez e Stock" : "Capacidade por Percentagem Salarial"}
                        </h5>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {professionalCreditAnalysis.incomeSource === "negociante" ? (
                            <>
                              <span className="text-slate-600">Total em stock</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.stockTotal)}</span>
                              <span className="text-slate-600">Stock disponivel</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.stockAvailable)}</span>
                              <span className="text-slate-600">Caixa disponivel</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.cashAvailable)}</span>
                              <span className="text-slate-600">Contas a receber</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.receivables)}</span>
                              <span className="text-slate-600">Ativo circulante</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.currentAssets)}</span>
                              <span className="text-slate-600">Liquidez disponivel</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.availableLiquidity)}</span>
                              <span className="text-slate-600">Contas a pagar</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.payables)}</span>
                              <span className="text-slate-600">Outros passivos</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.otherLiabilities)}</span>
                              <span className="text-slate-600">Liquidez corrente</span><span className="text-right font-medium text-slate-900">{professionalCreditAnalysis.currentRatio.toFixed(2)}x</span>
                            </>
                          ) : (
                            <>
                              <span className="text-slate-600">Salario base</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.salaryBase)}</span>
                              <span className="text-slate-600">Outros rendimentos</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.salaryOtherIncome)}</span>
                              <span className="text-slate-600">Descontos/compromissos</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.payrollDiscounts)}</span>
                              <span className="text-slate-600">Limite percentual</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.salaryPolicyCapacity)}</span>
                              <span className="text-slate-600">Capacidade final</span><span className="text-right font-medium text-slate-900">{formatCurrencyMT(professionalCreditAnalysis.paymentCapacity)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="font-semibold text-slate-900">Conclusao da Analise Profissional</h5>
                        <Badge
                          className={
                            professionalCreditAnalysis.decision === "Aprovado"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : professionalCreditAnalysis.decision === "Condicional"
                                ? "bg-amber-100 text-amber-800 border-amber-200"
                                : "bg-red-100 text-red-800 border-red-200"
                          }
                        >
                          {professionalCreditAnalysis.decision}
                        </Badge>
                      </div>
                      <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                        {professionalCreditAnalysis.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <span className="font-medium text-slate-900">Recomendacao:</span> {professionalCreditAnalysis.recommendation}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-slate-900">Justificativas da Avaliacao Base</h4>
                  <Badge
                    className={
                      evaluation.decision === "Aprovado"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : evaluation.decision === "Condicional"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-red-100 text-red-800 border-red-200"
                    }
                  >
                    {evaluation.decision}
                  </Badge>
                </div>
                <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                  {evaluation.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Recomendacao:</span> {evaluation.recommendation}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="font-semibold text-slate-900">Historico de Avaliacoes do Cliente</h4>
            {loadingEvaluationHistory && <p className="text-sm text-slate-600">A carregar historico...</p>}
            {!loadingEvaluationHistory && !evaluationClientId && (
              <p className="text-sm text-slate-600">Selecione um cliente para visualizar o historico de avaliacoes.</p>
            )}
            {!loadingEvaluationHistory && evaluationClientId && evaluationHistory.length === 0 && (
              <p className="text-sm text-slate-600">Este cliente ainda nao possui avaliacoes registradas.</p>
            )}
            {!loadingEvaluationHistory && evaluationHistory.length > 0 && (
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Data</TableHead>
                      <TableHead>Parecer</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Analista</TableHead>
                      <TableHead>Nota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evaluationHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{dateTimeFmt.format(new Date(item.createdAt))}</TableCell>
                        <TableCell>{item.decision}</TableCell>
                        <TableCell>{item.finalScore}/100</TableCell>
                        <TableCell>{item.analystName || "-"}</TableCell>
                        <TableCell className="max-w-[360px] truncate" title={item.note || "Sem nota"}>
                          {item.note || "Sem nota"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ClientCreditDetails
        clientId={creditDetailClient?.id ?? null}
        clientName={creditDetailClient?.name}
        open={Boolean(creditDetailClient)}
        onOpenChange={(open) => { if (!open) setCreditDetailClient(null); }}
      />

      <Dialog open={Boolean(creditModalClient)} onOpenChange={(open) => { if (!open) setCreditModalClient(null); }}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-cyan-600" />
              Créditos — {creditModalClient?.name || "Cliente"}
            </DialogTitle>
            <DialogDescription>
              Todos os créditos do cliente com opções de filtro (activo/pago), impressão e visualização do estado actual.
            </DialogDescription>
          </DialogHeader>
          <ClientCreditsModal
            profile={creditModalProfile}
            loading={creditModalLoading}
            clientName={creditModalClient?.name}
            open={Boolean(creditModalClient)}
            onOpenChange={(open) => { if (!open) setCreditModalClient(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
