import { useEffect, useMemo, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { downloadTextFile, toCsv } from "../../lib/download";
import { formatCurrency, formatCurrencyInput, formatCurrencyMT, parseCurrencyInput } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";

type ContractOption = {
  id: number;
  contractNo: string;
  product: string;
  principal: number;
  balance: number;
  outstandingAmount?: number;
  reversibleAmount?: number;
  disbursementStatus: "pending" | "disbursed";
  status: string;
  disbursedOn: string;
  nextPaymentOn: string;
  clientType: "singular" | "grupo" | "empresa";
  applicantType: "singular" | "grupo" | "empresa";
  isLiquidated: boolean;
  isPayable: boolean;
  isReversible?: boolean;
};

type GroupAllocationOption = {
  id: number;
  memberClientId: number | null;
  memberName: string;
  allocatedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: "open" | "partial" | "paid";
};

type Reimbursement = {
  id: number;
  receiptNo: string | null;
  clientId: number;
  clientName: string;
  loanId: number | null;
  contractNo: string | null;
  paymentDate: string;
  amountReceived: number;
  amountApplied: number;
  principalApplied: number;
  interestApplied: number;
  moraApplied: number;
  capital: number;
  interest: number;
  mora: number;
  total: number;
  unappliedAmount: number;
  allocationMode: "loan" | "client_auto";
  createdByName: string;
  managerName?: string;
};

type ReimbursementsResponse = {
  totals: { received: number; applied: number; principal: number; interest: number; mora: number };
  byManager: Array<{ manager: string; count: number; amountApplied: number; moraApplied: number }>;
  detailedSummary?: {
    totalRows: number;
    daysLate: number;
    mora: number;
    costs: number;
    interest: number;
    principal: number;
    total: number;
  };
  detailedRows?: Array<{
    allocationId: number;
    repaymentId: number;
    receiptNo: string;
    paymentDate: string;
    clientId: number;
    clientName: string;
    clientPhone?: string;
    clientOccupation?: string;
    clientNeighborhood?: string;
    clientType?: "singular" | "grupo" | "empresa";
    loanId: number;
    contractNo: string;
    product?: string;
    managerName: string;
    disbursedOn?: string | null;
    disbursedAmount?: number;
    installmentId: number;
    installmentNo: number;
    totalInstallments?: number;
    dueDate: string;
    daysLate: number;
    moraAmount: number;
    costAmount: number;
    interestAmount: number;
    principalAmount: number;
    totalAmount: number;
    destinationAccountLabel?: string;
    paymentChannelLabel?: string;
    repaymentNote?: string;
  }>;
  reimbursements: Reimbursement[];
};

type ReimbursementReceiptResponse = {
  repayment: {
    id: number;
    receiptNo: string | null;
    clientId: number;
    clientName: string;
    clientPhone: string;
    loanId: number | null;
    contractNo: string | null;
    paymentDate: string;
    amountReceived: number;
    amountApplied: number;
    principalApplied: number;
    interestApplied: number;
    moraApplied: number;
    capital: number;
    interest: number;
    mora: number;
    total: number;
    unappliedAmount: number;
    allocationMode: "loan" | "client_auto";
    note: string;
    createdByName: string;
    createdAt: string;
  };
  company: {
    name: string;
    legalName: string;
    nuit: string;
    phone: string;
    email: string;
    address: string;
  };
  client?: {
    id: number;
    name: string;
    phone: string;
    phoneAlt?: string;
    nuit?: string;
    documentType?: string;
    documentNumber?: string;
    email?: string;
    occupation?: string;
    addressLine?: string;
    houseNumber?: string;
    neighborhood?: string;
    district?: string;
    city?: string;
    province?: string;
  };
  allocations: Array<{
    loanId: number;
    contractNo: string;
    installmentId: number;
    installmentNo: number;
    dueDate: string;
    daysOverdue: number;
    principalAmount: number;
    interestAmount: number;
    installmentAmount: number;
    moraAmount: number;
    totalApplied: number;
  }>;
  settlement: {
    isTotalDebtSettlement: boolean;
    remainingDebt: number;
    selectedLoanRemainingDebt?: number | null;
    context?: "loan" | "client";
    totalDebtBeforePayment?: number;
    totalPaidAmount?: number;
    receivedAmount?: number;
    status?: "paid" | "partial";
  };
};

type LoanInstallmentsReceiptResponse = {
  loanId: number;
  contractNo: string;
  summary: {
    total: number;
    paid: number;
    pending: number;
    late: number;
    paidAmount: number;
    pendingAmount: number;
  };
  installments: Array<{
    id: number;
    installmentNo: number;
    dueDate: string;
    paymentAmount: number;
    principalAmount: number;
    interestAmount: number;
    status: "pending" | "late" | "paid";
    paidAt: string | null;
    baseRemainingAmount?: number;
    totalOutstandingAmount?: number;
  }>;
};

type ForecastResponse = {
  periodDays: number;
  summary: { totalCount: number; totalValue: number; lateCount: number; lateValue: number };
  items: Array<{
    installmentId: number;
    loanId: number;
    contractNo: string;
    clientId: number;
    clientName: string;
    clientOccupation?: string;
    clientPhone?: string;
    managerName?: string;
    lineName?: string;
    companyName?: string;
    portfolioLabel?: string;
    totalInstallments?: number;
    installmentNo: number;
    dueDate: string;
    vigenteAmount?: number;
    paymentAmount: number;
    status: "pending" | "late";
    daysLate: number;
  }>;
};

type MoraResponse = {
  from?: string | null;
  to?: string | null;
  referenceDate?: string;
  calculationDate?: string;
  dateFilterMode?: "up_to_today" | "up_to_day" | "on_day" | "range";
  summary?: {
    clientCount: number;
    creditCount: number;
    disbursedAmount: number;
    capitalRiskAmount: number;
    overdueInstallments: number;
    daysLateTotal: number;
    daysLateVigenteTotal: number;
    moraAmount: number;
    principalOverdueAmount: number;
    interestOverdueAmount: number;
    totalOverdueAmount: number;
  };
  totals: { overdueInstallments: number; overdueAmount: number; mora: number };
  byManager: Array<{ manager: string; overdueInstallments: number; overdueAmount: number; mora: number }>;
  creditRows?: Array<{
    loanId: number;
    contractNo: string;
    product?: string;
    clientId: number;
    clientName: string;
    clientPhone?: string;
    clientOccupation?: string;
    clientNeighborhood?: string;
    managerName: string;
    disbursedOn?: string | null;
    disbursedAmount: number;
    overdueInstallments: number;
    daysLateTotal: number;
    daysLateVigente: number;
    moraAmount: number;
    capitalRiskAmount: number;
    principalOverdueAmount: number;
    interestOverdueAmount: number;
    totalOverdueAmount: number;
  }>;
  portfolioGroups?: Array<{
    managerName: string;
    clientCount: number;
    creditCount: number;
    disbursedAmount: number;
    capitalRiskAmount: number;
    overdueInstallments: number;
    daysLateTotal: number;
    daysLateVigenteTotal: number;
    moraAmount: number;
    principalOverdueAmount: number;
    interestOverdueAmount: number;
    totalOverdueAmount: number;
    rows: Array<{
      loanId: number;
      contractNo: string;
      product?: string;
      clientId: number;
      clientName: string;
      clientPhone?: string;
      clientOccupation?: string;
      clientNeighborhood?: string;
      managerName: string;
      disbursedOn?: string | null;
      disbursedAmount: number;
      overdueInstallments: number;
      daysLateTotal: number;
      daysLateVigente: number;
      moraAmount: number;
      capitalRiskAmount: number;
      principalOverdueAmount: number;
      interestOverdueAmount: number;
      totalOverdueAmount: number;
    }>;
  }>;
  items: Array<{
    loanId: number;
    contractNo: string;
    product?: string;
    clientId?: number;
    clientName: string;
    clientPhone?: string;
    clientOccupation?: string;
    clientNeighborhood?: string;
    managerName: string;
    disbursedOn?: string | null;
    disbursedAmount?: number;
    installmentId?: number;
    installmentNo: number;
    dueDate: string;
    daysLate: number;
    vigenteAmount?: number;
    baseOverdueAmount?: number;
    principalOverdueAmount?: number;
    interestOverdueAmount?: number;
    totalOverdueAmount?: number;
    installmentAmount: number;
    mora: number;
  }>;
};

type PerformanceMonthlyRow = {
  actorId: number | null;
  actorName: string;
  actorRole: "manager" | "agent";
  disbursementAmount: number;
  newClients: number;
  reimbursementCount: number;
  vigenteCount: number;
  vigenteCapital: number;
  reimbursementInterest: number;
  reimbursementPrincipal: number;
  moraTodayCount: number;
  moraTodayCapital: number;
  moraTotalCount: number;
  moraTotalCapital: number;
  moraRiskPercent: number;
  moraOver7Count: number;
  moraOver7Capital: number;
  moraOver15Count: number;
  moraOver15Capital: number;
  moraOver30Count: number;
  moraOver30Capital: number;
};

type PerformanceMonthlyResponse = {
  generatedAt: string;
  source: "live" | "closed";
  month: string;
  monthStart: string;
  monthEnd: string;
  referenceDate: string;
  isCurrentMonth: boolean;
  manager: string;
  status: "open" | "closed";
  closure: null | {
    id: number;
    closedAt: string;
    closedByUserId: number | null;
    closedByName: string;
    referenceDate: string;
  };
  rows: PerformanceMonthlyRow[];
  totals: Omit<PerformanceMonthlyRow, "actorId" | "actorName" | "actorRole">;
};

type ReversalsResponse = {
  eventType?: "all" | "estorno" | "abatimento" | "capitalizacao" | "perdao_mora";
  items: Array<{
    id: number;
    loanId: number;
    eventType?: "estorno" | "abatimento" | "capitalizacao" | "perdao_mora";
    eventTypeLabel?: string;
    contractNo: string;
    clientName: string;
    managerName: string;
    amount: number;
    note: string;
    workflowStatus: string;
    createdByName: string;
    eventDate?: string;
    transferTargetClientName?: string | null;
    transferTargetContractNo?: string | null;
    createdAt: string;
  }>;
};

type ClientsOptionsResponse = { clients: Array<{ id: number; name: string; type: "singular" | "grupo" | "empresa" }> };
type ManagersOptionsResponse = { users: Array<{ id: number; fullName: string; role: string; isActive: boolean }> };
type LoanInstallmentsLiteResponse = {
  installments: Array<{
    id: number;
    installmentNo: number;
    dueDate: string;
    paymentAmount: number;
    principalAmount: number;
    interestAmount: number;
    status: "pending" | "late" | "paid";
    paidAt: string | null;
    baseRemainingAmount?: number;
    totalOutstandingAmount?: number;
    moraOutstandingAmount?: number;
  }>;
};

type PaymentClientType = "singular" | "grupo" | "empresa";
type GroupPaymentEntryMode = "individual" | "general";

function formatDateOnly(value: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-PT");
}

function formatDateTimePT(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || "-");
  return d.toLocaleString("pt-PT");
}

function formatYearMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelPt(yearMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(yearMonth || ""));
  if (!match) return yearMonth || "-";
  const d = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

function nextYearMonth(yearMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(yearMonth || ""));
  if (!match) return formatYearMonthValue();
  const d = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return formatYearMonthValue(d);
}

function clampYearMonthToMax(value: string, maxYearMonth: string) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return maxYearMonth;
  return raw > maxYearMonth ? maxYearMonth : raw;
}

function formatTimeOnlyPT(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString("pt-PT");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type ReceiptInvoiceParty = {
  name?: string;
  legalName?: string;
  nuit?: string;
  phone?: string;
  phoneAlt?: string;
  email?: string;
  address?: string;
  documentType?: string;
  documentNumber?: string;
  occupation?: string;
};

type ReceiptInvoiceLine = {
  description: string;
  price: number;
  qty: number;
  total: number;
  note?: string;
};

function compactLabel(parts: Array<string | undefined | null>) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function round2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function renderReceiptInvoiceDocument(input: {
  title: string;
  docNo: string;
  issueDate: string;
  generatedAt: string;
  operatorName: string;
  company: ReceiptInvoiceParty;
  client: ReceiptInvoiceParty;
  lines: ReceiptInvoiceLine[];
  totalDebt: number;
  totalPaid: number;
  remainingDebt: number;
  paymentReceived?: number;
  paymentApplied?: number;
  statusLabel: string;
  scopeLabel?: string;
  duplicateOnA4?: boolean;
}) {
  const companyName = input.company.legalName || input.company.name || "Empresa";
  const companyAddress = String(input.company.address || "").trim() || "-";
  const clientAddress = String(input.client.address || "").trim() || "-";
  const statusToneClass = input.remainingDebt <= 0.009 ? "status-paid" : "status-partial";
  const duplicateMode = Boolean(input.duplicateOnA4);
  const maxLinesPerCopy = duplicateMode ? 10 : Math.max(input.lines.length, 1);
  const visibleLines = input.lines.slice(0, maxLinesPerCopy);
  const hiddenLinesCount = Math.max(0, input.lines.length - visibleLines.length);
  const rowsHtml = visibleLines
    .map(
      (line) => `
        <tr>
          <td>
            <div class="item-main">${escapeHtml(line.description)}</div>
            ${line.note ? `<div class="item-note">${escapeHtml(line.note)}</div>` : ""}
          </td>
          <td class="num">${escapeHtml(formatCurrency(Number(line.price || 0)))}</td>
          <td class="center">${Number(line.qty || 0)}</td>
          <td class="num">${escapeHtml(formatCurrency(Number(line.total || 0)))}</td>
        </tr>
      `,
    )
    .join("");
  const hiddenLineHtml = hiddenLinesCount
    ? `<tr><td colspan="4" class="hidden-note">+${hiddenLinesCount} item(ns) adicionais no detalhe completo do sistema.</td></tr>`
    : "";
  const paymentReceived = Number(input.paymentReceived ?? input.totalPaid);
  const paymentApplied = Number(input.paymentApplied ?? input.totalPaid);
  const receiptScope = escapeHtml(input.scopeLabel || "-");
  const clientDoc = escapeHtml(compactLabel([input.client.documentType, input.client.documentNumber]) || "-");
  const clientPhone = escapeHtml(compactLabel([input.client.phone, input.client.phoneAlt]) || "-");
  const clientEmail = escapeHtml(input.client.email || "-");
  const clientOccupation = escapeHtml(input.client.occupation || "-");
  const operatorName = escapeHtml(input.operatorName || "Sistema");

  const renderCopy = (copyLabel: string, copyNote: string) => `
    <section class="receipt-copy">
      <div class="header">
        <div>
          <div class="brand">${escapeHtml(companyName)}</div>
          <div class="brand-sub">
            NUIT: ${escapeHtml(input.company.nuit || "-")} | Telefone: ${escapeHtml(input.company.phone || "-")} | Email: ${escapeHtml(input.company.email || "-")}
          </div>
          <div class="brand-sub">Endereco: ${escapeHtml(companyAddress)}</div>
        </div>
        <div class="doc-box">
          <div class="doc-title">${escapeHtml(input.title)}</div>
          <div class="doc-meta"><strong>Recibo:</strong> ${escapeHtml(input.docNo || "-")}</div>
          <div class="doc-meta"><strong>Pagamento:</strong> ${escapeHtml(input.issueDate)}</div>
          <div class="doc-meta"><strong>Emitido:</strong> ${escapeHtml(input.generatedAt)}</div>
          <div class="doc-meta"><strong>Operador:</strong> ${operatorName}</div>
          <div class="doc-badge">${escapeHtml(copyLabel)}</div>
        </div>
      </div>

      <div class="client-grid">
        <div class="client-card">
          <div class="sec-title">Cliente</div>
          <div><strong>${escapeHtml(input.client.name || "-")}</strong></div>
          <div>Documento: ${clientDoc}</div>
          <div>NUIT: ${escapeHtml(input.client.nuit || "-")}</div>
          <div>Contato: ${clientPhone}</div>
          <div>Email: ${clientEmail}</div>
          <div>Profissao: ${clientOccupation}</div>
          <div>Endereco: ${escapeHtml(clientAddress)}</div>
        </div>
        <div class="client-card">
          <div class="sec-title">Referencia</div>
          <div><strong>Escopo:</strong> ${receiptScope}</div>
          <div><strong>Status:</strong> <span class="status-chip ${statusToneClass}">${escapeHtml(input.statusLabel)}</span></div>
          <div><strong>Via:</strong> ${escapeHtml(copyNote)}</div>
        </div>
      </div>

      <table class="line-items">
        <thead>
          <tr>
            <th style="width:58%;">Descricao</th>
            <th style="width:16%;">Preco</th>
            <th style="width:10%;">QTD</th>
            <th style="width:16%;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="4" class="center">Sem itens para este recibo.</td></tr>`}
          ${hiddenLineHtml}
        </tbody>
      </table>

      <table class="totals">
        <tbody>
          <tr><td class="lbl">Total em divida</td><td class="value">${escapeHtml(formatCurrency(Number(input.totalDebt || 0)))}</td></tr>
          <tr><td class="lbl">Total pago</td><td class="value">${escapeHtml(formatCurrency(Number(input.totalPaid || 0)))}</td></tr>
          <tr><td class="lbl">Valor recebido</td><td class="value">${escapeHtml(formatCurrency(paymentReceived))}</td></tr>
          <tr><td class="lbl">Aplicado no credito</td><td class="value">${escapeHtml(formatCurrency(paymentApplied))}</td></tr>
          <tr class="grand"><td>Remanescente</td><td class="value">${escapeHtml(formatCurrency(Number(input.remainingDebt || 0)))}</td></tr>
        </tbody>
      </table>

      <div class="footer-row">
        <div class="foot-note">${escapeHtml(copyNote)}. Documento valido para conciliacao interna.</div>
        <div class="sign-block">
          <div class="sign-line"></div>
          <div>Assinatura do Operador</div>
        </div>
      </div>
    </section>
  `;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(input.title)}</title>
        <style>
          @page { size: A4 portrait; margin: 6mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; background: #e5e7eb; color: #0f172a; }
          .page { max-width: 198mm; margin: 0 auto; background: #ffffff; padding: 3mm; min-height: 100vh; box-shadow: 0 16px 36px rgba(15, 23, 42, .18); }
          .receipt-copy { border: 1px solid #94a3b8; border-radius: 8px; padding: 4mm; background: #ffffff; display: flex; flex-direction: column; gap: 2.8mm; page-break-inside: avoid; }
          .duplicate-mode .receipt-copy { height: 136mm; overflow: hidden; }
          .single-mode .receipt-copy { min-height: calc(297mm - 18mm); }
          .cut-line { border-top: 2px dashed #64748b; text-align: center; margin: 2.2mm 1mm; position: relative; }
          .cut-line span { position: relative; top: -8px; background: #ffffff; padding: 0 7px; font-size: 10px; color: #334155; letter-spacing: .5px; }
          .header { display: flex; justify-content: space-between; gap: 6mm; border-bottom: 2px solid #334155; padding-bottom: 2mm; }
          .brand { font-size: 17px; font-weight: 700; color: #0f172a; letter-spacing: .4px; }
          .brand-sub { margin-top: 1mm; font-size: 10px; color: #475569; line-height: 1.3; }
          .doc-box { min-width: 76mm; text-align: right; font-size: 10px; color: #334155; }
          .doc-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 1.2mm; letter-spacing: .3px; }
          .doc-meta { margin-top: .8mm; }
          .doc-badge { display: inline-block; margin-top: 1.6mm; border: 1px solid #334155; border-radius: 999px; padding: 1.2mm 3mm; font-size: 9px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #0f172a; background: #f8fafc; }
          .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
          .client-card { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 2.2mm; font-size: 10px; line-height: 1.35; color: #334155; }
          .sec-title { font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 1mm; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .line-items th { background: #334155; color: #f8fafc; border: 1px solid #334155; font-size: 9px; text-transform: uppercase; padding: 1.6mm 1.8mm; }
          .line-items td { border: 1px solid #dbe3ee; font-size: 9.5px; padding: 1.4mm 1.8mm; vertical-align: top; }
          .line-items tbody tr:nth-child(even) td { background: #f8fafc; }
          .item-main { font-weight: 700; color: #0f172a; }
          .item-note { margin-top: .8mm; color: #64748b; font-size: 9px; line-height: 1.2; }
          .hidden-note { text-align: center; color: #475569; font-size: 9px; background: #eef2f7; }
          .center { text-align: center; }
          .num { text-align: right; }
          .totals { margin-left: auto; width: 84mm; border-collapse: collapse; }
          .totals td { border: 1px solid #dbe3ee; padding: 1.4mm 1.8mm; font-size: 10px; }
          .totals .lbl { background: #f8fafc; font-weight: 600; color: #334155; width: 60%; }
          .totals .value { text-align: right; font-weight: 700; color: #0f172a; }
          .totals .grand td { background: #e2e8f0; font-size: 10.5px; font-weight: 800; }
          .status-chip { display: inline-block; margin-top: .8mm; padding: 1px 7px; border-radius: 999px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
          .status-paid { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
          .status-partial { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
          .footer-row { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; gap: 4mm; }
          .foot-note { font-size: 9px; color: #64748b; }
          .sign-block { min-width: 50mm; text-align: center; font-size: 9px; color: #475569; }
          .sign-line { border-top: 1px solid #64748b; margin-bottom: 1mm; }
          @media print {
            body { background: #ffffff; }
            .page { max-width: none; box-shadow: none; padding: 0; min-height: auto; }
          }
        </style>
      </head>
      <body>
        <div class="page ${duplicateMode ? "duplicate-mode" : "single-mode"}">
          ${renderCopy("Via Cliente", "Original entregue ao cliente")}
          ${duplicateMode ? `<div class="cut-line"><span>RECORTAR AQUI</span></div>` : ""}
          ${duplicateMode ? renderCopy("Via Empresa", "Copia para arquivo da empresa") : ""}
        </div>
        <div data-corp-footer="1" style="display:none"></div>
      </body>
    </html>
  `;
}

function clientTypeLabel(value: string) {
  if (value === "singular") return "Pessoal";
  if (value === "grupo") return "Grupo";
  if (value === "empresa") return "Empresa";
  return value || "-";
}

type OtherOperationType = "all" | "perdao_mora" | "capitalizacao" | "estorno" | "abatimento";
type OtherEventType = Exclude<OtherOperationType, "all">;
type OtherEstornoMode = "estorno_only" | "estorno_and_pay";

function otherOperationLabel(value: string) {
  if (value === "perdao_mora") return "Perdao de Mora";
  if (value === "capitalizacao") return "Capitalizacao";
  if (value === "estorno") return "Estornos";
  if (value === "abatimento") return "Abates";
  return "Tudo";
}

function otherOperationDescription(value: string) {
  if (value === "perdao_mora") return "Movimentos de perdao de mora aplicados no periodo selecionado, com reflexo imediato no estado do credito.";
  if (value === "capitalizacao") return "Movimentos de capitalizacao registrados no periodo selecionado, com reflexo imediato no saldo.";
  if (value === "estorno") return "Movimentos de estorno registrados no periodo selecionado, com reflexo imediato no contrato de origem.";
  if (value === "abatimento") return "Movimentos de abate registrados no periodo selecionado, com reflexo imediato no saldo e na quitacao.";
  return "Visao consolidada de perdao de mora, capitalizacao, estornos e abates com reflexo imediato.";
}

function otherOperationAmountLabel(value: string) {
  if (value === "perdao_mora") return "Valor perdoado (mora)";
  if (value === "capitalizacao") return "Valor capitalizado";
  if (value === "estorno") return "Valor estornado";
  if (value === "abatimento") return "Valor abatido";
  return "Valor do movimento";
}

function otherOperationInputAmountLabel(value: string) {
  if (value === "perdao_mora") return "Valor a perdoar (mora)";
  if (value === "capitalizacao") return "Valor a capitalizar";
  if (value === "estorno") return "Valor a estornar";
  if (value === "abatimento") return "Valor a abater";
  return "Valor da operacao";
}

function otherOperationTotalLabel(value: string) {
  if (value === "perdao_mora") return "Total perdoado (mora)";
  if (value === "capitalizacao") return "Total capitalizado";
  if (value === "estorno") return "Total estornado";
  if (value === "abatimento") return "Total abatido";
  return "Total dos movimentos";
}

function otherOperationSubmitLabel(value: string) {
  if (value === "perdao_mora") return "Aplicar perdao de mora";
  if (value === "capitalizacao") return "Aplicar capitalizacao";
  if (value === "estorno") return "Aplicar estorno";
  if (value === "abatimento") return "Aplicar abatimento";
  return "Aplicar operacao";
}

function isOtherSourceContractSelectable(contract: ContractOption, eventType: OtherEventType) {
  if (eventType === "estorno") return Boolean(contract.isReversible);
  return Boolean(contract.isPayable);
}

function installmentStatusLabel(value: string) {
  if (value === "paid") return "Paga";
  if (value === "late") return "Em atraso";
  return "Pendente";
}

function normalizeCurrencyInputText(value: string) {
  return String(value ?? "").replace(/[^\d.,-]/g, "");
}

function commitCurrencyInputText(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return formatCurrencyInput(parseCurrencyInput(raw), { emptyIfZero: true });
}

function forecastVigenteAmount(item: { vigenteAmount?: number; paymentAmount: number }) {
  return Number(item.vigenteAmount ?? item.paymentAmount ?? 0);
}

function moraVigenteAmount(item: { vigenteAmount?: number; installmentAmount: number }) {
  return Number(item.vigenteAmount ?? item.installmentAmount ?? 0);
}

function forecastPortfolioLabel(item: {
  managerName?: string;
  portfolioLabel?: string;
  companyName?: string;
  lineName?: string;
}) {
  const manager = String(item.managerName || "").trim();
  if (manager) return manager;
  const fromApi = String(item.portfolioLabel || "").trim();
  if (fromApi) return fromApi;
  const company = String(item.companyName || "Empresa").trim();
  const line = String(item.lineName || "-").trim();
  return `CARTEIRA ${company} - ${line}`;
}

function forecastInstallmentNumberLabel(item: { installmentNo: number; totalInstallments?: number }) {
  const no = Number(item.installmentNo || 0);
  const total = Number(item.totalInstallments || 0);
  if (total > 0) return `${no} de ${total}`;
  return `${no}`;
}

function forecastProfessionLabel(item: { clientOccupation?: string }) {
  const value = String(item.clientOccupation || "").trim();
  return value || "-";
}

function forecastContactLabel(item: { clientPhone?: string }) {
  const value = String(item.clientPhone || "").trim();
  return value || "-";
}

function forecastReferenceLabel(fromDate: string, toDate: string) {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (fromDate && toDate) {
    if (fromDate === toDate) return formatDateOnly(fromDate);
    return `${formatDateOnly(fromDate)} - ${formatDateOnly(toDate)}`;
  }
  if (fromDate) return `${formatDateOnly(fromDate)} em diante`;
  if (toDate) return `Ate ${formatDateOnly(toDate)}`;
  return `${formatDateOnly(todayIso)} em diante`;
}

function reimbursementReferenceLabel(fromDate: string, toDate: string, periodDays: number) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  if (fromDate && toDate) {
    if (fromDate === toDate) return `${formatDateOnly(fromDate)} - ${formatDateOnly(toDate)}`;
    return `${formatDateOnly(fromDate)} - ${formatDateOnly(toDate)}`;
  }
  if (fromDate) return `${formatDateOnly(fromDate)} - ${formatDateOnly(fromDate)}`;
  if (toDate) return `${formatDateOnly(toDate)} - ${formatDateOnly(toDate)}`;
  const start = new Date(today.getTime());
  start.setDate(start.getDate() - Math.max(0, Number(periodDays || 30) - 1));
  return `${formatDateOnly(start.toISOString().slice(0, 10))} - ${formatDateOnly(todayIso)}`;
}

function reimbursementInstallmentLabel(row: { installmentNo?: number; totalInstallments?: number }) {
  const no = Number(row.installmentNo || 0);
  const total = Number(row.totalInstallments || 0);
  if (total > 0 && no > 0) return `${no} de ${total}`;
  if (no > 0) return `${no}`;
  return "-";
}

function reimbursementDestinationLabel(row: { destinationAccountLabel?: string; paymentChannelLabel?: string }) {
  const dest = String(row.destinationAccountLabel || "").trim();
  const channel = String(row.paymentChannelLabel || "").trim();
  if (dest) return dest;
  if (channel) return channel;
  return "N/A";
}

function moraClientLineLabel(row: {
  clientName: string;
  clientOccupation?: string;
  clientNeighborhood?: string;
  clientPhone?: string;
  contractNo?: string;
  product?: string;
}) {
  const parts = [
    String(row.clientName || "").trim(),
    String(row.clientOccupation || "").trim(),
    row.clientNeighborhood ? `BAIRRO: ${String(row.clientNeighborhood).trim()}` : "",
    row.clientPhone ? String(row.clientPhone).trim() : "",
    row.contractNo ? `CONTRATO: ${String(row.contractNo).trim()}` : "",
    row.product ? `PRODUTO: ${String(row.product).trim()}` : "",
  ].filter(Boolean);
  return parts.join(" - ") || "-";
}

function moraReferenceHeaderLabel(mora: MoraResponse | null, fromDate: string, toDate: string) {
  const responseMode = String(mora?.dateFilterMode || "").trim();
  const ref = String(mora?.referenceDate || "").trim();
  if (responseMode === "up_to_today") return `ATE ${formatDateOnly(ref || new Date().toISOString().slice(0, 10))}`;
  if (responseMode === "up_to_day") return `ATE ${formatDateOnly(ref)}`;
  if (responseMode === "on_day") return `SOMENTE ${formatDateOnly(fromDate || toDate || ref)}`;
  if (responseMode === "range") return `${formatDateOnly(fromDate || mora?.from || "")} - ${formatDateOnly(toDate || mora?.to || ref)}`;
  if (fromDate && toDate) return `${formatDateOnly(fromDate)} - ${formatDateOnly(toDate)}`;
  if (toDate) return `ATE ${formatDateOnly(toDate)}`;
  if (fromDate) return `SOMENTE ${formatDateOnly(fromDate)}`;
  return `ATE ${formatDateOnly(new Date().toISOString().slice(0, 10))}`;
}

function moraCalculationInfoLabel(mora: MoraResponse | null) {
  const calculationDate = formatDateOnly(String(mora?.calculationDate || new Date().toISOString().slice(0, 10)));
  return `Regra: 2% ao dia sobre a prestacao em atraso desde o dia seguinte ao vencimento | Data de calculo: ${calculationDate}`;
}

function performanceActorRoleLabel(role: "manager" | "agent") {
  return role === "agent" ? "Agente" : "Gestor";
}

function performanceActorNameLabel(row: PerformanceMonthlyRow) {
  const name = String(row.actorName || "").trim() || "SEM NOME";
  return name.toUpperCase();
}

function formatPercentValue(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

type ReimbursementsPageProps = {
  defaultTab?: string;
  defaultOtherOperation?: OtherOperationType;
};

export default function ReimbursementsPage({
  defaultTab,
  defaultOtherOperation,
}: ReimbursementsPageProps = {}) {
  const currentUser = getUser();
  const [tab, setTab] = useState(defaultTab || "reembolsos");
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [manager, setManager] = useState("all");
  const [clientType, setClientType] = useState<"all" | "singular" | "grupo" | "empresa">("all");
  const [otherOperation, setOtherOperation] = useState<OtherOperationType>(defaultOtherOperation || "all");
  const [performanceMonth, setPerformanceMonth] = useState(() => formatYearMonthValue());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [reimbursements, setReimbursements] = useState<ReimbursementsResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [mora, setMora] = useState<MoraResponse | null>(null);
  const [performance, setPerformance] = useState<PerformanceMonthlyResponse | null>(null);
  const [reversals, setReversals] = useState<ReversalsResponse | null>(null);

  const [clients, setClients] = useState<Array<{ id: number; name: string; type: "singular" | "grupo" | "empresa" }>>([]);
  const [paymentClients, setPaymentClients] = useState<Array<{ id: number; name: string; type: "singular" | "grupo" | "empresa"; contractsCount: number; lastDisbursedOn: string | null }>>([]);
  const [managerUsers, setManagerUsers] = useState<Array<{ id: number; fullName: string; role: string }>>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentClientType, setPaymentClientType] = useState<PaymentClientType>("singular");
  const [paymentClientId, setPaymentClientId] = useState("");
  const [paymentLoanId, setPaymentLoanId] = useState("");
  const [paymentInstallmentId, setPaymentInstallmentId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"loan" | "client_auto">("loan");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState("");
  const [groupPaymentEntryMode, setGroupPaymentEntryMode] = useState<GroupPaymentEntryMode>("general");
  const [loanInstallments, setLoanInstallments] = useState<LoanInstallmentsLiteResponse["installments"]>([]);
  const [loadingLoanInstallments, setLoadingLoanInstallments] = useState(false);
  const [groupAllocations, setGroupAllocations] = useState<Array<GroupAllocationOption & { selected: boolean; amount: string }>>([]);
  const [savingPayment, setSavingPayment] = useState(false);
  const [otherEventType, setOtherEventType] = useState<OtherEventType>("abatimento");
  const [otherClientType, setOtherClientType] = useState<PaymentClientType>("singular");
  const [otherClientId, setOtherClientId] = useState("");
  const [otherLoanId, setOtherLoanId] = useState("");
  const [otherContracts, setOtherContracts] = useState<ContractOption[]>([]);
  const [otherDestinationClientType, setOtherDestinationClientType] = useState<PaymentClientType>("singular");
  const [otherDestinationClientId, setOtherDestinationClientId] = useState("");
  const [otherDestinationLoanId, setOtherDestinationLoanId] = useState("");
  const [otherDestinationContracts, setOtherDestinationContracts] = useState<ContractOption[]>([]);
  const [otherAmount, setOtherAmount] = useState("");
  const [otherDate, setOtherDate] = useState(new Date().toISOString().slice(0, 10));
  const [otherNote, setOtherNote] = useState("");
  const [otherLoanSnapshot, setOtherLoanSnapshot] = useState({
    loading: false,
    moraTotal: 0,
    overdueTotal: 0,
    creditTotal: 0,
  });
  const [otherEstornoMode, setOtherEstornoMode] = useState<OtherEstornoMode>("estorno_only");
  const [savingOtherOperation, setSavingOtherOperation] = useState(false);
  const [closingPerformanceMonth, setClosingPerformanceMonth] = useState(false);
  const [reopeningPerformanceMonth, setReopeningPerformanceMonth] = useState(false);
  const [receiptClientId, setReceiptClientId] = useState("");
  const [receiptPrintMode, setReceiptPrintMode] = useState<"payment" | "credit">("payment");
  const [receiptLoanId, setReceiptLoanId] = useState("");
  const [receiptPaymentId, setReceiptPaymentId] = useState("");

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      const hasDateRange = Boolean(fromDate || toDate);
      const reimbursementParams = new URLSearchParams({ manager });
      const forecastParams = new URLSearchParams();
      const moraParams = new URLSearchParams({ manager });
      const performanceParams = new URLSearchParams({ month: performanceMonth, manager });
      const reversalsParams = new URLSearchParams({ manager });
      reimbursementParams.set("clientType", clientType);
      forecastParams.set("clientType", clientType);
      moraParams.set("clientType", clientType);
      reversalsParams.set("clientType", clientType);
      if (fromDate) {
        reimbursementParams.set("from", fromDate);
        forecastParams.set("from", fromDate);
        moraParams.set("from", fromDate);
        reversalsParams.set("from", fromDate);
      }
      if (toDate) {
        reimbursementParams.set("to", toDate);
        forecastParams.set("to", toDate);
        moraParams.set("to", toDate);
        reversalsParams.set("to", toDate);
      }
      if (!hasDateRange) {
        reimbursementParams.set("periodDays", String(periodDays));
      }
      const [r, f, m, perf, rev] = await Promise.all([
        apiFetch<ReimbursementsResponse>(`/loans/payments/reimbursements?${reimbursementParams.toString()}`),
        apiFetch<ForecastResponse>(`/loans/payments/forecast?${forecastParams.toString()}`),
        apiFetch<MoraResponse>(`/loans/payments/mora?${moraParams.toString()}`),
        apiFetch<PerformanceMonthlyResponse>(`/loans/collections/performance-monthly?${performanceParams.toString()}`),
        apiFetch<ReversalsResponse>(`/loans/payments/reversals?${reversalsParams.toString()}`),
      ]);
      setReimbursements(r);
      setForecast(f);
      setMora(m);
      setPerformance(perf);
      setReversals(rev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados de pagamentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [periodDays, manager, fromDate, toDate, clientType, performanceMonth]);

  useEffect(() => {
    apiFetch<ClientsOptionsResponse>("/clients/options")
      .then((data) => setClients(data.clients || []))
      .catch(() => setClients([]));
  }, []);

  // Clientes elegiveis para novo pagamento: apenas os que foram desembolsados
  useEffect(() => {
    apiFetch<ClientsOptionsResponse & { clients: Array<{ id: number; name: string; type: "singular" | "grupo" | "empresa"; contractsCount?: number; lastDisbursedOn?: string | null }> }>("/loans/payments/disbursed-clients")
      .then((data) => setPaymentClients((data.clients || []).map((cl) => ({ ...cl, contractsCount: Number(cl.contractsCount || 0), lastDisbursedOn: cl.lastDisbursedOn || null }))))
      .catch(() => setPaymentClients([]));
  }, []);

  useEffect(() => {
    apiFetch<ManagersOptionsResponse>("/users?role=portfolio")
      .then((data) => {
        const portfolios = (data.users || [])
          .filter((u) => ["manager", "agent"].includes(String(u.role || "").toLowerCase()))
          .map((u) => ({ id: Number(u.id), fullName: u.fullName, role: String(u.role || "").toLowerCase() }))
          .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || ""), "pt"));
        setManagerUsers(portfolios);
      })
      .catch(() => setManagerUsers([]));
  }, []);

  useEffect(() => {
    if (!paymentClientId) {
      setContracts([]);
      setPaymentLoanId("");
      setLoanInstallments([]);
      setPaymentInstallmentId("");
      return;
    }
    apiFetch<{ contracts: ContractOption[] }>(`/loans/payments/client-contracts?clientId=${paymentClientId}`)
      .then((data) => {
        const list = data.contracts || [];
        setContracts(list);
        setPaymentLoanId((current) => {
          if (current && list.some((ct) => String(ct.id) === current && ct.isPayable)) return current;
          const firstPayable = list.find((ct) => ct.isPayable);
          return firstPayable ? String(firstPayable.id) : "";
        });
      })
      .catch(() => {
        setContracts([]);
        setPaymentLoanId("");
        setLoanInstallments([]);
        setPaymentInstallmentId("");
      });
  }, [paymentClientId]);

  useEffect(() => {
    if (otherOperation !== "all") {
      setOtherEventType(otherOperation);
    }
  }, [otherOperation]);

  useEffect(() => {
    if (!otherClientId) {
      setOtherContracts([]);
      setOtherLoanId("");
      return;
    }
    const effectiveEventType: OtherEventType = otherOperation === "all" ? otherEventType : otherOperation;
    apiFetch<{ contracts: ContractOption[] }>(`/loans/payments/client-contracts?clientId=${otherClientId}`)
      .then((data) => {
        const list = data.contracts || [];
        setOtherContracts(list);
        setOtherLoanId((current) => {
          if (current && list.some((ct) => String(ct.id) === current && isOtherSourceContractSelectable(ct, effectiveEventType))) return current;
          const firstEligible = list.find((ct) => isOtherSourceContractSelectable(ct, effectiveEventType));
          return firstEligible ? String(firstEligible.id) : "";
        });
      })
      .catch(() => {
        setOtherContracts([]);
        setOtherLoanId("");
      });
  }, [otherClientId, otherOperation, otherEventType]);

  useEffect(() => {
    if (!otherDestinationClientId) {
      setOtherDestinationContracts([]);
      setOtherDestinationLoanId("");
      return;
    }
    apiFetch<{ contracts: ContractOption[] }>(`/loans/payments/client-contracts?clientId=${otherDestinationClientId}`)
      .then((data) => {
        const list = data.contracts || [];
        setOtherDestinationContracts(list);
        setOtherDestinationLoanId((current) => {
          if (current && list.some((ct) => String(ct.id) === current && ct.isPayable)) return current;
          return "";
        });
      })
      .catch(() => {
        setOtherDestinationContracts([]);
        setOtherDestinationLoanId("");
      });
  }, [otherDestinationClientId]);

  const managerOptions = useMemo(() => {
    const set = new Set<string>(["all"]);
    (managerUsers || []).forEach((u) => {
      if (u.fullName) set.add(u.fullName);
    });
    return Array.from(set);
  }, [managerUsers]);

  useEffect(() => {
    if (manager === "all") return;
    if (!managerOptions.includes(manager)) setManager("all");
  }, [manager, managerOptions]);

  const forecastBaseItems = useMemo(() => {
    const items = [...(forecast?.items || [])];
    const hasReferenceRange = Boolean(fromDate || toDate);
    const todayIso = new Date().toISOString().slice(0, 10);
    const filtered = hasReferenceRange
      ? items
      : items.filter((item) => String(item.dueDate || "") >= todayIso);
    return filtered.sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return a.clientName.localeCompare(b.clientName, "pt");
    });
  }, [forecast?.items, fromDate, toDate]);

  const forecastVisibleItems = useMemo(() => {
    return forecastBaseItems.filter((item) => {
      if (manager !== "all" && String(item.managerName || "Sem Gestor") !== manager) return false;
      return true;
    });
  }, [forecastBaseItems, manager]);

  const forecastVisibleSummary = useMemo(
    () =>
      forecastVisibleItems.reduce(
        (acc, item) => {
          acc.totalCount += 1;
          acc.totalValue += forecastVigenteAmount(item);
          return acc;
        },
        { totalCount: 0, totalValue: 0 },
      ),
    [forecastVisibleItems],
  );

  const reimbursementDetailedRows = useMemo(
    () => [...(reimbursements?.detailedRows || [])],
    [reimbursements?.detailedRows],
  );
  const reimbursementDetailedSummary = useMemo(
    () => reimbursements?.detailedSummary || {
      totalRows: 0,
      daysLate: 0,
      mora: 0,
      costs: 0,
      interest: 0,
      principal: 0,
      total: 0,
    },
    [reimbursements?.detailedSummary],
  );
  const reimbursementReportDateLabel = useMemo(
    () => reimbursementReferenceLabel(fromDate, toDate, periodDays),
    [fromDate, toDate, periodDays],
  );
  const receiptClientOptions = useMemo(() => {
    const grouped = new Map<number, { clientId: number; clientName: string; paymentsCount: number; lastPaymentDate: string }>();
    for (const item of reimbursements?.reimbursements || []) {
      const clientId = Number(item.clientId || 0);
      if (!clientId) continue;
      const paymentDate = String(item.paymentDate || "");
      const current = grouped.get(clientId);
      if (!current) {
        grouped.set(clientId, {
          clientId,
          clientName: String(item.clientName || "").trim() || `Cliente ${clientId}`,
          paymentsCount: 1,
          lastPaymentDate: paymentDate,
        });
        continue;
      }
      current.paymentsCount += 1;
      if (paymentDate && (!current.lastPaymentDate || paymentDate > current.lastPaymentDate)) {
        current.lastPaymentDate = paymentDate;
      }
    }
    return Array.from(grouped.values()).sort((a, b) => a.clientName.localeCompare(b.clientName, "pt"));
  }, [reimbursements?.reimbursements]);
  const receiptCreditOptions = useMemo(() => {
    const targetClientId = Number(receiptClientId || 0);
    if (!targetClientId) return [];
    const grouped = new Map<
      number,
      {
        loanId: number;
        contractNo: string;
        managerName: string;
        clientName: string;
        rowsCount: number;
        totalPaid: number;
        lastPaymentDate: string;
      }
    >();
    for (const row of reimbursementDetailedRows) {
      if (Number(row.clientId || 0) !== targetClientId) continue;
      const loanId = Number(row.loanId || 0);
      if (!loanId) continue;
      const current = grouped.get(loanId);
      const paymentDate = String(row.paymentDate || "");
      if (!current) {
        grouped.set(loanId, {
          loanId,
          contractNo: String(row.contractNo || `#${loanId}`),
          managerName: String(row.managerName || "Sem Gestor"),
          clientName: String(row.clientName || "").trim(),
          rowsCount: 1,
          totalPaid: Number(row.totalAmount || 0),
          lastPaymentDate: paymentDate,
        });
        continue;
      }
      current.rowsCount += 1;
      current.totalPaid += Number(row.totalAmount || 0);
      if (paymentDate && (!current.lastPaymentDate || paymentDate > current.lastPaymentDate)) {
        current.lastPaymentDate = paymentDate;
      }
    }
    return Array.from(grouped.values()).sort((a, b) => {
      const dateCompare = String(b.lastPaymentDate || "").localeCompare(String(a.lastPaymentDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return a.contractNo.localeCompare(b.contractNo, "pt");
    });
  }, [receiptClientId, reimbursementDetailedRows]);
  const receiptRepaymentLoanMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const row of reimbursementDetailedRows) {
      const repaymentId = Number(row.repaymentId || 0);
      const loanId = Number(row.loanId || 0);
      if (!repaymentId || !loanId) continue;
      const current = map.get(repaymentId) || new Set<number>();
      current.add(loanId);
      map.set(repaymentId, current);
    }
    return map;
  }, [reimbursementDetailedRows]);
  const receiptPaymentOptions = useMemo(() => {
    const targetClientId = Number(receiptClientId || 0);
    if (!targetClientId) return [];
    const targetLoanId = Number(receiptLoanId || 0);
    return [...(reimbursements?.reimbursements || [])]
      .filter((item) => {
        if (Number(item.clientId || 0) !== targetClientId) return false;
        if (!targetLoanId) return true;
        if (Number(item.loanId || 0) === targetLoanId) return true;
        const relatedLoans = receiptRepaymentLoanMap.get(Number(item.id || 0));
        return Boolean(relatedLoans?.has(targetLoanId));
      })
      .sort((a, b) => {
        const dateCompare = String(b.paymentDate || "").localeCompare(String(a.paymentDate || ""));
        if (dateCompare !== 0) return dateCompare;
        return Number(b.id || 0) - Number(a.id || 0);
      });
  }, [receiptClientId, receiptLoanId, reimbursements?.reimbursements, receiptRepaymentLoanMap]);
  const selectedReceiptCredit = useMemo(
    () => receiptCreditOptions.find((item) => String(item.loanId) === receiptLoanId) || null,
    [receiptCreditOptions, receiptLoanId],
  );
  const selectedReceiptPayment = useMemo(
    () => receiptPaymentOptions.find((item) => String(item.id) === receiptPaymentId) || null,
    [receiptPaymentId, receiptPaymentOptions],
  );

  useEffect(() => {
    if (!receiptClientId) {
      setReceiptLoanId("");
      setReceiptPaymentId("");
      return;
    }
    if (!receiptClientOptions.some((item) => String(item.clientId) === receiptClientId)) {
      setReceiptClientId("");
      setReceiptLoanId("");
      setReceiptPaymentId("");
    }
  }, [receiptClientId, receiptClientOptions]);

  useEffect(() => {
    if (!receiptLoanId) return;
    if (!receiptCreditOptions.some((item) => String(item.loanId) === receiptLoanId)) {
      setReceiptLoanId("");
    }
  }, [receiptLoanId, receiptCreditOptions]);

  useEffect(() => {
    if (!receiptPaymentId) return;
    if (!receiptPaymentOptions.some((item) => String(item.id) === receiptPaymentId)) {
      setReceiptPaymentId("");
    }
  }, [receiptPaymentId, receiptPaymentOptions]);

  const performanceRows = useMemo(() => performance?.rows || [], [performance?.rows]);
  const performanceTotals = performance?.totals || null;
  const performanceMaxMonth = useMemo(() => formatYearMonthValue(), []);
  const performanceReferenceRangeLabel = useMemo(() => {
    if (!performance) return "-";
    return `${formatDateOnly(performance.monthStart)} - ${formatDateOnly(performance.referenceDate)}`;
  }, [performance?.monthStart, performance?.referenceDate]);
  const performanceTitleLabel = useMemo(() => {
    const referenceDate = performance?.referenceDate || new Date().toISOString().slice(0, 10);
    const statusLabel = performance?.status === "closed" ? "DIA FECHADO" : "EM ABERTO";
    return `DESEMPENHO * ${statusLabel} - ${formatDateOnly(referenceDate)}`;
  }, [performance?.referenceDate, performance?.status]);
  const performanceHealth = useMemo(() => {
    const totals = performanceTotals;
    const risk = Number(totals?.moraRiskPercent || 0);
    const vigente = Number(totals?.vigenteCapital || 0);
    const moraCapital = Number(totals?.moraTotalCapital || 0);
    const reimbursementMonth = Number(totals?.reimbursementPrincipal || 0) + Number(totals?.reimbursementInterest || 0);

    if (vigente <= 0.009) {
      return {
        label: "Sem carteira vigente",
        toneClass: "bg-slate-100 text-slate-800 border-slate-200",
        note: "Nao ha capital vigente suficiente para avaliar risco.",
        risk,
        vigente,
        moraCapital,
        reimbursementMonth,
      };
    }
    if (risk <= 5) {
      return {
        label: "Saudavel",
        toneClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
        note: "Risco de mora baixo e carteira sob controlo.",
        risk,
        vigente,
        moraCapital,
        reimbursementMonth,
      };
    }
    if (risk <= 12) {
      return {
        label: "Atenção",
        toneClass: "bg-amber-100 text-amber-800 border-amber-200",
        note: "Exige acompanhamento de cobranca e monitoria dos gestores.",
        risk,
        vigente,
        moraCapital,
        reimbursementMonth,
      };
    }
    return {
      label: "Crítica",
      toneClass: "bg-rose-100 text-rose-800 border-rose-200",
      note: "Carteira em risco elevado. Priorizar recuperacao e revisao de concessao.",
      risk,
      vigente,
      moraCapital,
      reimbursementMonth,
    };
  }, [performanceTotals]);

  const otherVisibleItems = useMemo(() => {
    const items = [...(reversals?.items || [])];
    const filtered = items.filter((item) => {
      if (otherOperation === "all") return true;
      return String(item.eventType || "").toLowerCase() === otherOperation;
    });
    return filtered.sort((a, b) => {
      const dateCompare = String(b.eventDate || b.createdAt || "").localeCompare(String(a.eventDate || a.createdAt || ""));
      if (dateCompare !== 0) return dateCompare;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [reversals?.items, otherOperation]);

  const otherVisibleSummary = useMemo(
    () =>
      otherVisibleItems.reduce(
        (acc, item) => {
          acc.count += 1;
          acc.total += Number(item.amount || 0);
          return acc;
        },
        { count: 0, total: 0 },
      ),
    [otherVisibleItems],
  );

  const moraPortfolioGroups = useMemo(() => {
    if (Array.isArray(mora?.portfolioGroups) && mora.portfolioGroups.length > 0) {
      return mora.portfolioGroups;
    }
    // Fallback para payload antigo (por parcela), agregando por contrato e carteira.
    const groupedByPortfolio = new Map<
      string,
      {
        managerName: string;
        rows: Array<{
          loanId: number;
          contractNo: string;
          product?: string;
          clientId: number;
          clientName: string;
          clientPhone?: string;
          clientOccupation?: string;
          clientNeighborhood?: string;
          managerName: string;
          disbursedOn?: string | null;
          disbursedAmount: number;
          overdueInstallments: number;
          daysLateTotal: number;
          daysLateVigente: number;
          moraAmount: number;
          capitalRiskAmount: number;
          principalOverdueAmount: number;
          interestOverdueAmount: number;
          totalOverdueAmount: number;
        }>;
      }
    >();
    const creditMap = new Map<string, any>();
    (mora?.items || []).forEach((item) => {
      const key = `${item.loanId}`;
      if (!creditMap.has(key)) {
        creditMap.set(key, {
          loanId: item.loanId,
          contractNo: item.contractNo,
          product: "-",
          clientId: 0,
          clientName: item.clientName,
          clientPhone: "",
          clientOccupation: "",
          clientNeighborhood: "",
          managerName: item.managerName || "Sem Gestor",
          disbursedOn: null,
          disbursedAmount: 0,
          overdueInstallments: 0,
          daysLateTotal: 0,
          daysLateVigente: 0,
          moraAmount: 0,
          capitalRiskAmount: 0,
          principalOverdueAmount: 0,
          interestOverdueAmount: 0,
          totalOverdueAmount: 0,
        });
      }
      const row = creditMap.get(key);
      const vigente = moraVigenteAmount(item);
      row.overdueInstallments += 1;
      row.daysLateTotal += Number(item.daysLate || 0);
      row.daysLateVigente = Math.max(Number(row.daysLateVigente || 0), Number(item.daysLate || 0));
      row.capitalRiskAmount += vigente;
      row.totalOverdueAmount += vigente + Number(item.mora || 0);
      row.moraAmount += Number(item.mora || 0);
    });
    Array.from(creditMap.values()).forEach((row) => {
      const key = String(row.managerName || "Sem Gestor");
      if (!groupedByPortfolio.has(key)) groupedByPortfolio.set(key, { managerName: key, rows: [] });
      groupedByPortfolio.get(key)?.rows.push(row);
    });
    return Array.from(groupedByPortfolio.values()).map((group) => {
      const clientIds = new Set(group.rows.map((row) => Number(row.clientId || 0)).filter((id) => Number.isInteger(id) && id > 0));
      return {
        managerName: group.managerName,
        clientCount: clientIds.size,
        creditCount: group.rows.length,
        disbursedAmount: Number(group.rows.reduce((sum, row) => sum + Number(row.disbursedAmount || 0), 0)),
        capitalRiskAmount: Number(group.rows.reduce((sum, row) => sum + Number(row.capitalRiskAmount || 0), 0)),
        overdueInstallments: Number(group.rows.reduce((sum, row) => sum + Number(row.overdueInstallments || 0), 0)),
        daysLateTotal: Number(group.rows.reduce((sum, row) => sum + Number(row.daysLateTotal || 0), 0)),
        daysLateVigenteTotal: Number(group.rows.reduce((sum, row) => sum + Number(row.daysLateVigente || 0), 0)),
        moraAmount: Number(group.rows.reduce((sum, row) => sum + Number(row.moraAmount || 0), 0)),
        principalOverdueAmount: Number(group.rows.reduce((sum, row) => sum + Number(row.principalOverdueAmount || 0), 0)),
        interestOverdueAmount: Number(group.rows.reduce((sum, row) => sum + Number(row.interestOverdueAmount || 0), 0)),
        totalOverdueAmount: Number(group.rows.reduce((sum, row) => sum + Number(row.totalOverdueAmount || 0), 0)),
        rows: group.rows,
      };
    });
  }, [mora]);

  const moraSummary = useMemo(() => {
    if (mora?.summary) return mora.summary;
    const allRows = moraPortfolioGroups.flatMap((group) => group.rows || []);
    const clientIds = new Set(allRows.map((row) => Number(row.clientId || 0)).filter((id) => Number.isInteger(id) && id > 0));
    return {
      clientCount: clientIds.size,
      creditCount: allRows.length,
      disbursedAmount: allRows.reduce((sum, row) => sum + Number(row.disbursedAmount || 0), 0),
      capitalRiskAmount: allRows.reduce((sum, row) => sum + Number(row.capitalRiskAmount || 0), 0),
      overdueInstallments: allRows.reduce((sum, row) => sum + Number(row.overdueInstallments || 0), 0),
      daysLateTotal: allRows.reduce((sum, row) => sum + Number(row.daysLateTotal || 0), 0),
      daysLateVigenteTotal: allRows.reduce((sum, row) => sum + Number(row.daysLateVigente || 0), 0),
      moraAmount: allRows.reduce((sum, row) => sum + Number(row.moraAmount || 0), 0),
      principalOverdueAmount: allRows.reduce((sum, row) => sum + Number(row.principalOverdueAmount || 0), 0),
      interestOverdueAmount: allRows.reduce((sum, row) => sum + Number(row.interestOverdueAmount || 0), 0),
      totalOverdueAmount: allRows.reduce((sum, row) => sum + Number(row.totalOverdueAmount || 0), 0),
    };
  }, [mora?.summary, moraPortfolioGroups]);

  const moraHeaderRangeLabel = useMemo(
    () => moraReferenceHeaderLabel(mora, fromDate, toDate),
    [mora, fromDate, toDate],
  );
  const moraCalculationInfo = useMemo(() => moraCalculationInfoLabel(mora), [mora]);

  const selectedContract = useMemo(
    () => contracts.find((ct) => String(ct.id) === paymentLoanId) || null,
    [contracts, paymentLoanId],
  );
  const filteredClients = useMemo(() => {
    if (clientType === "all") return clients;
    return clients.filter((client) => client.type === clientType);
  }, [clients, clientType]);
  const paymentClientOptions = useMemo(
    () => paymentClients.filter((client) => client.type === paymentClientType),
    [paymentClients, paymentClientType],
  );
  const otherClientOptions = useMemo(
    () => clients.filter((client) => client.type === otherClientType),
    [clients, otherClientType],
  );
  const otherDestinationClientOptions = useMemo(
    () => clients.filter((client) => client.type === otherDestinationClientType),
    [clients, otherDestinationClientType],
  );
  const selectedPaymentClient = useMemo(
    () => clients.find((client) => String(client.id) === paymentClientId) || null,
    [clients, paymentClientId],
  );
  const selectedOtherClient = useMemo(
    () => clients.find((client) => String(client.id) === otherClientId) || null,
    [clients, otherClientId],
  );
  const selectedOtherDestinationClient = useMemo(
    () => clients.find((client) => String(client.id) === otherDestinationClientId) || null,
    [clients, otherDestinationClientId],
  );
  const selectedOtherContract = useMemo(
    () => otherContracts.find((ct) => String(ct.id) === otherLoanId) || null,
    [otherContracts, otherLoanId],
  );
  const selectedOtherDestinationContract = useMemo(
    () => otherDestinationContracts.find((ct) => String(ct.id) === otherDestinationLoanId) || null,
    [otherDestinationContracts, otherDestinationLoanId],
  );
  const activeOtherEventType: OtherEventType = otherOperation === "all" ? otherEventType : otherOperation;
  const isOtherEstorno = activeOtherEventType === "estorno";
  const selectedPaymentClientType = selectedPaymentClient?.type || paymentClientType;
  const isGroupContract = paymentMode === "loan" && selectedContract?.applicantType === "grupo";
  const isGroupContractIndividual = isGroupContract && groupPaymentEntryMode === "individual";
  const isGroupContractGeneral = isGroupContract && groupPaymentEntryMode === "general";
  const shouldChooseInstallment = paymentMode === "loan" && !!selectedContract && !isGroupContractIndividual;
  const payableInstallments = useMemo(
    () => (loanInstallments || []).filter((item) => item.status !== "paid"),
    [loanInstallments],
  );
  const selectedInstallment = useMemo(
    () => payableInstallments.find((item) => String(item.id) === paymentInstallmentId) || null,
    [payableInstallments, paymentInstallmentId],
  );

  useEffect(() => {
    if (!paymentClientId) return;
    if (!paymentClientOptions.some((item) => String(item.id) === paymentClientId)) {
      setPaymentClientId("");
    }
  }, [paymentClientId, paymentClientOptions]);

  useEffect(() => {
    if (!otherClientId) return;
    if (!otherClientOptions.some((item) => String(item.id) === otherClientId)) {
      setOtherClientId("");
      setOtherLoanId("");
    }
  }, [otherClientId, otherClientOptions]);

  useEffect(() => {
    if (!otherDestinationClientId) return;
    if (!otherDestinationClientOptions.some((item) => String(item.id) === otherDestinationClientId)) {
      setOtherDestinationClientId("");
      setOtherDestinationLoanId("");
    }
  }, [otherDestinationClientId, otherDestinationClientOptions]);

  useEffect(() => {
    if (!otherLoanId) return;
    if (!otherContracts.some((ct) => String(ct.id) === otherLoanId && isOtherSourceContractSelectable(ct, activeOtherEventType))) {
      setOtherLoanId("");
    }
  }, [otherLoanId, otherContracts, activeOtherEventType]);

  useEffect(() => {
    if (!otherDestinationLoanId) return;
    if (!otherDestinationContracts.some((ct) => String(ct.id) === otherDestinationLoanId && ct.isPayable)) {
      setOtherDestinationLoanId("");
    }
  }, [otherDestinationLoanId, otherDestinationContracts]);

  useEffect(() => {
    if (!isOtherEstorno) {
      setOtherEstornoMode("estorno_only");
      setOtherDestinationClientId("");
      setOtherDestinationLoanId("");
      return;
    }
    if (otherEstornoMode === "estorno_only") {
      setOtherDestinationClientId("");
      setOtherDestinationLoanId("");
    }
  }, [isOtherEstorno, otherEstornoMode]);

  useEffect(() => {
    if (!selectedOtherContract?.id) {
      setOtherLoanSnapshot({ loading: false, moraTotal: 0, overdueTotal: 0, creditTotal: 0 });
      return;
    }
    let cancelled = false;
    setOtherLoanSnapshot({ loading: true, moraTotal: 0, overdueTotal: 0, creditTotal: 0 });
    apiFetch<LoanInstallmentsLiteResponse>(`/loans/${selectedOtherContract.id}/installments`)
      .then((data) => {
        if (cancelled) return;
        const list = data.installments || [];
        const totals = list.reduce(
          (acc, item) => {
            if (item.status === "paid") return acc;
            const baseOutstanding = Number(item.baseRemainingAmount ?? item.paymentAmount ?? 0);
            const totalOutstanding = Number(item.totalOutstandingAmount ?? baseOutstanding);
            const moraOutstanding = Number(item.moraOutstandingAmount ?? Math.max(0, totalOutstanding - baseOutstanding));
            acc.moraTotal += Math.max(0, moraOutstanding);
            acc.creditTotal += Math.max(0, totalOutstanding);
            if (item.status === "late") {
              acc.overdueTotal += Math.max(0, totalOutstanding);
            }
            return acc;
          },
          { moraTotal: 0, overdueTotal: 0, creditTotal: 0 },
        );
        setOtherLoanSnapshot({
          loading: false,
          moraTotal: round2(totals.moraTotal),
          overdueTotal: round2(totals.overdueTotal),
          creditTotal: round2(totals.creditTotal),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setOtherLoanSnapshot({ loading: false, moraTotal: 0, overdueTotal: 0, creditTotal: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOtherContract?.id]);

  useEffect(() => {
    if (!selectedOtherContract?.id) {
      if (activeOtherEventType !== "estorno") setOtherAmount("");
      return;
    }
    if (activeOtherEventType === "perdao_mora") {
      setOtherAmount(formatCurrencyInput(otherLoanSnapshot.moraTotal, { emptyIfZero: true }));
      return;
    }
    if (activeOtherEventType === "capitalizacao") {
      setOtherAmount(formatCurrencyInput(otherLoanSnapshot.overdueTotal, { emptyIfZero: true }));
      return;
    }
    if (activeOtherEventType === "abatimento") {
      setOtherAmount(formatCurrencyInput(otherLoanSnapshot.creditTotal, { emptyIfZero: true }));
    }
  }, [activeOtherEventType, selectedOtherContract?.id, otherLoanSnapshot.moraTotal, otherLoanSnapshot.overdueTotal, otherLoanSnapshot.creditTotal]);

  useEffect(() => {
    if (clientType === "all") return;
    setOtherClientType(clientType);
    setOtherDestinationClientType(clientType);
  }, [clientType]);

  useEffect(() => {
    if (paymentMode !== "loan" || !selectedContract?.id || !selectedContract.isPayable) {
      setLoanInstallments([]);
      setPaymentInstallmentId("");
      return;
    }
    let cancelled = false;
    setLoadingLoanInstallments(true);
    apiFetch<LoanInstallmentsLiteResponse>(`/loans/${selectedContract.id}/installments`)
      .then((data) => {
        if (cancelled) return;
        const list = (data.installments || []).map((item) => ({
          id: Number(item.id),
          installmentNo: Number(item.installmentNo),
          dueDate: item.dueDate,
          paymentAmount: Number(item.paymentAmount || 0),
          principalAmount: Number(item.principalAmount || 0),
          interestAmount: Number(item.interestAmount || 0),
          status: item.status,
          paidAt: item.paidAt || null,
        }));
        setLoanInstallments(list);
        setPaymentInstallmentId((current) => {
          if (current && list.some((item) => String(item.id) === current && item.status !== "paid")) return current;
          const firstOpen = list.find((item) => item.status !== "paid");
          return firstOpen ? String(firstOpen.id) : "";
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoanInstallments([]);
        setPaymentInstallmentId("");
      })
      .finally(() => {
        if (!cancelled) setLoadingLoanInstallments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentMode, selectedContract?.id, selectedContract?.isPayable]);

  useEffect(() => {
    if (!isGroupContract || !selectedContract?.id) {
      setGroupAllocations([]);
      return;
    }
    apiFetch<{ members: GroupAllocationOption[] }>(`/loans/payments/group-allocations?loanId=${selectedContract.id}`)
      .then((data) => {
        const members = data.members || [];
        setGroupAllocations(
          members.map((member) => ({
            ...member,
            selected: false,
            amount: member.remainingAmount > 0 ? formatCurrencyInput(member.remainingAmount, { emptyIfZero: true }) : "",
          })),
        );
      })
      .catch(() => setGroupAllocations([]));
  }, [isGroupContract, selectedContract?.id]);

  const selectedGroupPayments = useMemo(
    () =>
      isGroupContractIndividual
        ? groupAllocations
            .filter((member) => member.selected && parseCurrencyInput(member.amount) > 0)
            .map((member) => ({
              allocationId: member.id,
              amount: parseCurrencyInput(member.amount),
            }))
        : [],
    [groupAllocations, isGroupContractIndividual],
  );

  const typedAmount = parseCurrencyInput(paymentAmount);
  const effectivePaymentAmount = selectedGroupPayments.length > 0
    ? selectedGroupPayments.reduce((sum, item) => sum + item.amount, 0)
    : typedAmount;

  const groupGeneralPreview = useMemo(() => {
    if (!isGroupContractGeneral) {
      return {
        rows: [] as Array<GroupAllocationOption & { autoCharge: number }>,
        totalMembersPending: 0,
        totalAutoCharge: 0,
        groupRemainderBase: 0,
        excessOverInstallmentBase: 0,
      };
    }
    const totalMembersPending = round2(groupAllocations.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0));
    let pool = round2(Math.max(0, effectivePaymentAmount || 0));
    const rows = [...groupAllocations]
      .sort((a, b) => {
        if (b.remainingAmount !== a.remainingAmount) return b.remainingAmount - a.remainingAmount;
        return a.memberName.localeCompare(b.memberName, "pt");
      })
      .map((member) => {
        const remainingAmount = round2(Number(member.remainingAmount || 0));
        const autoCharge = round2(Math.max(0, Math.min(remainingAmount, pool)));
        pool = round2(Math.max(0, pool - autoCharge));
        return { ...member, autoCharge };
      });
    const installmentBase = round2(Number(selectedInstallment?.paymentAmount || 0));
    const paidTowardsInstallmentBase = round2(Math.max(0, effectivePaymentAmount || 0));
    return {
      rows,
      totalMembersPending,
      totalAutoCharge: round2(rows.reduce((sum, item) => sum + item.autoCharge, 0)),
      groupRemainderBase: installmentBase > 0 ? round2(Math.max(0, installmentBase - paidTowardsInstallmentBase)) : 0,
      excessOverInstallmentBase: installmentBase > 0 ? round2(Math.max(0, paidTowardsInstallmentBase - installmentBase)) : 0,
    };
  }, [effectivePaymentAmount, groupAllocations, isGroupContractGeneral, selectedInstallment?.paymentAmount]);

  const openNewPaymentModal = () => {
    const nextType = clientType === "all" ? "singular" : clientType;
    setTab("reembolsos");
    setError("");
    setSuccess("");
    setPaymentMode("loan");
    setGroupPaymentEntryMode("general");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentNote("");
    setPaymentAmount("");
    setPaymentInstallmentId("");
    setGroupAllocations((prev) => prev.map((member) => ({ ...member, selected: false, amount: member.amount || "" })));
    setPaymentClientType(nextType as PaymentClientType);
    if (!clients.some((c) => String(c.id) === paymentClientId && c.type === nextType)) {
      setPaymentClientId("");
      setPaymentLoanId("");
    }
    setPaymentModalOpen(true);
  };

  const handleApplyPayment = async () => {
    const clientId = Number(paymentClientId);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      setError("Selecione o cliente para registrar pagamento.");
      return;
    }
    if (paymentMode === "loan" && (!Number.isInteger(Number(paymentLoanId)) || Number(paymentLoanId) <= 0)) {
      setError("Selecione um contrato valido para pagamento por contrato.");
      return;
    }
    if (paymentMode === "loan") {
      if (!selectedContract) {
        setError("Selecione um contrato valido para pagamento por contrato.");
        return;
      }
      if (!selectedContract.isPayable || selectedContract.isLiquidated) {
        setError("Contrato ja liquidado ou indisponivel para pagamento.");
        return;
      }
    }
    if (shouldChooseInstallment && !selectedInstallment) {
      setError("Selecione a prestacao/parcela que sera paga.");
      return;
    }
    if (!Number.isFinite(effectivePaymentAmount) || effectivePaymentAmount <= 0) {
      setError("Informe um valor valido de pagamento.");
      return;
    }
    if (isGroupContractIndividual && selectedGroupPayments.length === 0) {
      setError("Selecione pelo menos um membro do grupo para registrar o pagamento.");
      return;
    }
    try {
      setSavingPayment(true);
      setError("");
      setSuccess("");
      const result = await apiFetch<{ message: string; receiptNo?: string; amountApplied: number; moraApplied: number; principalApplied: number; interestApplied?: number }>("/loans/payments/apply", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          loanId: paymentMode === "loan" ? Number(paymentLoanId) : null,
          targetInstallmentId: shouldChooseInstallment ? Number(paymentInstallmentId) : null,
          amount: effectivePaymentAmount,
          paymentDate,
          note: paymentNote,
          groupPayments: isGroupContractIndividual ? selectedGroupPayments : [],
        }),
      });
      setSuccess(
        `${result.message} ${result.receiptNo ? `Recibo: ${result.receiptNo}. ` : ""}Capital: ${formatCurrencyMT(result.principalApplied)} | Juros: ${formatCurrencyMT(result.interestApplied || 0)} | Mora: ${formatCurrencyMT(result.moraApplied)}.`,
      );
      setPaymentAmount("");
      setPaymentNote("");
      setPaymentInstallmentId("");
      setGroupAllocations((prev) => prev.map((member) => ({ ...member, selected: false })));
      setPaymentModalOpen(false);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aplicar pagamento.");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleApplyOtherOperation = async () => {
    const clientId = Number(otherClientId);
    const loanId = Number(otherLoanId);
    const amount = parseCurrencyInput(otherAmount);
    const isTransferMode = isOtherEstorno && otherEstornoMode === "estorno_and_pay";
    const destinationClientId = Number(otherDestinationClientId);
    const destinationLoanId = Number(otherDestinationLoanId);

    if (!Number.isInteger(clientId) || clientId <= 0) {
      setError("Selecione o cliente de origem para registrar o movimento.");
      return;
    }
    if (!Number.isInteger(loanId) || loanId <= 0 || !selectedOtherContract) {
      setError("Selecione um contrato valido para o cliente de origem.");
      return;
    }
    if (isOtherEstorno) {
      if (!selectedOtherContract.isReversible) {
        setError("Este contrato nao possui pagamentos reversiveis para estorno.");
        return;
      }
    } else if (!selectedOtherContract.isPayable) {
      setError("Selecione um contrato em aberto para esta operacao.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(otherDate || "").trim())) {
      setError("Informe uma data valida no formato YYYY-MM-DD.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Informe um valor valido para o movimento.");
      return;
    }
    if (isTransferMode) {
      if (!Number.isInteger(destinationClientId) || destinationClientId <= 0) {
        setError("Selecione o cliente de destino para transferir o estorno.");
        return;
      }
      if (otherDestinationLoanId && (!Number.isInteger(destinationLoanId) || destinationLoanId <= 0 || !selectedOtherDestinationContract?.isPayable)) {
        setError("O contrato de destino selecionado nao esta disponivel para pagamento.");
        return;
      }
    }

    const transferDescription = isTransferMode
      ? `Transferencia imediata para ${selectedOtherDestinationClient?.name || "cliente destino"}${selectedOtherDestinationContract ? ` (${selectedOtherDestinationContract.contractNo})` : " (automatico por cliente)"}.`
      : "";
    const finalNote = [String(otherNote || "").trim(), transferDescription].filter(Boolean).join(" | ");

    try {
      setSavingOtherOperation(true);
      setError("");
      setSuccess("");

      const eventResponse = await apiFetch<{
        message: string;
        id: number;
        workflowStatus?: string;
        transfer?: { repaymentId: number; receiptNo?: string | null; amountApplied: number };
      }>(`/loans/${loanId}/financial-events`, {
        method: "POST",
        body: JSON.stringify({
          eventType: activeOtherEventType,
          amount,
          note: finalNote || null,
          eventDate: otherDate,
          payload: {
            eventDate: otherDate,
            sourceClientId: clientId,
            sourceClientType: selectedOtherClient?.type || otherClientType,
            estornoMode: isOtherEstorno ? otherEstornoMode : null,
            destinationClientId: isTransferMode ? destinationClientId : null,
            destinationClientType: isTransferMode ? (selectedOtherDestinationClient?.type || otherDestinationClientType) : null,
            destinationLoanId: isTransferMode && Number.isInteger(destinationLoanId) && destinationLoanId > 0 ? destinationLoanId : null,
          },
        }),
      });

      let successMessage = eventResponse.message || "Movimento financeiro registado com sucesso.";
      if (eventResponse.transfer?.receiptNo) {
        successMessage = `${successMessage} Recibo destino: ${eventResponse.transfer.receiptNo}.`;
      }

      setSuccess(successMessage);
      setOtherAmount("");
      setOtherNote("");
      if (isTransferMode) {
        setOtherDestinationLoanId("");
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registar movimento em Outros.");
    } finally {
      setSavingOtherOperation(false);
    }
  };

  const handleExportCsv = () => {
    if (tab === "reembolsos") {
      const rows = reimbursementDetailedRows.map((item) => ({
        cliente: item.clientName,
        gestor: item.managerName,
        numero: reimbursementInstallmentLabel(item),
        vencimento: formatDateOnly(item.dueDate),
        pagamento: formatDateOnly(item.paymentDate),
        dias_atraso: Number(item.daysLate || 0),
        mora: Number(item.moraAmount || 0).toFixed(2),
        custos: Number(item.costAmount || 0).toFixed(2),
        juro: Number(item.interestAmount || 0).toFixed(2),
        capital: Number(item.principalAmount || 0).toFixed(2),
        total: Number(item.totalAmount || 0).toFixed(2),
        conta_destino: reimbursementDestinationLabel(item),
        numero_recibo: item.receiptNo || "",
      }));
      downloadTextFile(`Reembolsos-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8;");
      return;
    }
    if (tab === "previstos") {
      const rows = forecastVisibleItems.map((item) => ({
        vencimento: formatDateOnly(item.dueDate),
        cliente: item.clientName,
        profissao: forecastProfessionLabel(item),
        contato: forecastContactLabel(item),
        gestor_linha: forecastPortfolioLabel(item),
        prestacao_no: forecastInstallmentNumberLabel(item),
        prestacao: formatCurrency(forecastVigenteAmount(item)),
      }));
      downloadTextFile(`Previstos-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8;");
      return;
    }
    if (tab === "desempenho") {
      const rows = performanceRows.map((row) => ({
        carteira: row.actorName,
        tipo: performanceActorRoleLabel(row.actorRole),
        desembolso_mes_montante: Number(row.disbursementAmount || 0).toFixed(2),
        novos_clientes: Number(row.newClients || 0),
        reembolsos_qtd: Number(row.reimbursementCount || 0),
        vigente_qtd: Number(row.vigenteCount || 0),
        vigente_capital: Number(row.vigenteCapital || 0).toFixed(2),
        reembolso_juros: Number(row.reimbursementInterest || 0).toFixed(2),
        reembolso_capital: Number(row.reimbursementPrincipal || 0).toFixed(2),
        mora_hoje_qtd: Number(row.moraTodayCount || 0),
        mora_hoje_capital: Number(row.moraTodayCapital || 0).toFixed(2),
        mora_total_qtd: Number(row.moraTotalCount || 0),
        mora_total_capital: Number(row.moraTotalCapital || 0).toFixed(2),
        mora_total_risco_pct: formatPercentValue(Number(row.moraRiskPercent || 0)),
        mora_maior_7_capital: Number(row.moraOver7Capital || 0).toFixed(2),
        mora_maior_7_qtd: Number(row.moraOver7Count || 0),
        mora_maior_15_capital: Number(row.moraOver15Capital || 0).toFixed(2),
        mora_maior_15_qtd: Number(row.moraOver15Count || 0),
        mora_maior_30_capital: Number(row.moraOver30Capital || 0).toFixed(2),
        mora_maior_30_qtd: Number(row.moraOver30Count || 0),
      }));
      downloadTextFile(`Desempenho-${performanceMonth}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8;");
      return;
    }
    if (tab === "outros") {
      const rows = otherVisibleItems.map((item) => ({
        data: item.eventDate || item.createdAt,
        tipo: item.eventTypeLabel || otherOperationLabel(item.eventType || ""),
        contrato: item.contractNo,
        cliente: item.clientName,
        gestor: item.managerName,
        valor_mt: item.amount.toFixed(2),
        estado: item.workflowStatus || "-",
        operador: item.createdByName,
        cliente_destino: item.transferTargetClientName || "",
        contrato_destino: item.transferTargetContractNo || "",
        nota: item.note || "",
      }));
      const label = otherOperationLabel(otherOperation).replace(/\s+/g, "-");
      downloadTextFile(`Outros-${label}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8;");
      return;
    }
    const rows = moraPortfolioGroups.flatMap((group) =>
      (group.rows || []).map((row) => ({
        carteira: group.managerName,
        cliente: row.clientName,
        profissao: row.clientOccupation || "",
        bairro: row.clientNeighborhood || "",
        contrato: row.contractNo,
        produto: row.product || "",
        desembolso_data: row.disbursedOn ? formatDateOnly(row.disbursedOn) : "",
        desembolso_montante: Number(row.disbursedAmount || 0).toFixed(2),
        capital_risco: Number(row.capitalRiskAmount || 0).toFixed(2),
        prest_atraso: Number(row.overdueInstallments || 0),
        dias_atraso_total: Number(row.daysLateTotal || 0),
        dias_atraso_vigente: Number(row.daysLateVigente || 0),
        mora_montante: Number(row.moraAmount || 0).toFixed(2),
        capital_atraso: Number(row.principalOverdueAmount || 0).toFixed(2),
        juro_atraso: Number(row.interestOverdueAmount || 0).toFixed(2),
        total_atraso: Number(row.totalOverdueAmount || 0).toFixed(2),
      })),
    );
    downloadTextFile(`Mora-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv;charset=utf-8;");
  };

  const handleExportPdf = () => {
    const now = new Date().toLocaleDateString("pt-PT");
    if (tab === "reembolsos") {
      const printDate = new Date();
      const generatedBy = (currentUser?.fullName || "Sistema").toUpperCase();
      const rows = reimbursementDetailedRows
        .map((item) => `
          <tr>
            <td>${escapeHtml(String(item.clientName || "").toUpperCase())}</td>
            <td>${escapeHtml(String(item.managerName || "Sem Gestor").toUpperCase())}</td>
            <td class="c-center">${escapeHtml(reimbursementInstallmentLabel(item))}</td>
            <td class="c-center">${escapeHtml(formatDateOnly(item.dueDate))}</td>
            <td class="c-center">${escapeHtml(formatDateOnly(item.paymentDate))}</td>
            <td class="c-center">${Number(item.daysLate || 0)}</td>
            <td class="c-right">${escapeHtml(formatCurrency(Number(item.moraAmount || 0)))}</td>
            <td class="c-right">${escapeHtml(formatCurrency(Number(item.costAmount || 0)))}</td>
            <td class="c-right">${escapeHtml(formatCurrency(Number(item.interestAmount || 0)))}</td>
            <td class="c-right">${escapeHtml(formatCurrency(Number(item.principalAmount || 0)))}</td>
            <td class="c-right">${escapeHtml(formatCurrency(Number(item.totalAmount || 0)))}</td>
            <td>${escapeHtml(reimbursementDestinationLabel(item))}</td>
            <td class="c-right">${escapeHtml(String(item.receiptNo || "-"))}</td>
          </tr>
        `)
        .join("");
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Reembolso Realizado</title>
            <style>
              @page { size: A4 landscape; margin: 6mm; }
              body { margin: 0; font-family: Arial, sans-serif; background: #d9d9d9; color: #111; }
              .wrap { padding: 4px; }
              .title-bar { background: #5e5e5e; color: #fff; text-align: center; font-size: 14px; padding: 7px 10px; }
              .meta { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:10px; padding:8px 2px 10px; }
              table { width:100%; border-collapse:collapse; table-layout: fixed; background:#fff; }
              th, td { border:1px solid #222; padding:3px 4px; font-size:8px; line-height:1.15; }
              th { background:#6a6a6a; color:#fff; text-align:left; font-weight:600; }
              .c-center { text-align:center; }
              .c-right { text-align:right; }
              .w-client { width: 24%; }
              .w-gestor { width: 10%; }
              .w-num { width: 4.5%; }
              .w-date { width: 5.5%; }
              .w-day { width: 5%; }
              .w-money { width: 6%; }
              .w-dest { width: 20%; }
              .w-rec { width: 6.5%; }
              .total-row td { color:#d10000; font-weight:700; }
            </style>
          </head>
          <body>
            <div class="wrap">
              <div class="title-bar">REEMBOLSO REALIZADO * Detalhado</div>
              <div class="meta">
                <div>${escapeHtml(reimbursementReportDateLabel)}</div>
                <div>${escapeHtml(`${formatTimeOnlyPT(printDate)} ${formatDateOnly(printDate.toISOString().slice(0, 10))} ${generatedBy}`)}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th class="w-client">Cliente</th>
                    <th class="w-gestor">Gestor</th>
                    <th class="w-num c-center">Nº</th>
                    <th class="w-date c-center">Vencimento</th>
                    <th class="w-date c-center">Pagamento</th>
                    <th class="w-day c-center">DiasAtraso</th>
                    <th class="w-money c-right">Mora</th>
                    <th class="w-money c-right">Custos</th>
                    <th class="w-money c-right">Juro</th>
                    <th class="w-money c-right">Capital</th>
                    <th class="w-money c-right">Total</th>
                    <th class="w-dest">Conta Destino</th>
                    <th class="w-rec c-right">Nº Recibo</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || "<tr><td colspan='13' class='c-center'>Sem dados.</td></tr>"}
                  <tr class="total-row">
                    <td colspan="5">Prestacoes: ${Number(reimbursementDetailedSummary.totalRows || 0)}</td>
                    <td class="c-center">${Number(reimbursementDetailedSummary.daysLate || 0)}</td>
                    <td class="c-right">${escapeHtml(formatCurrency(Number(reimbursementDetailedSummary.mora || 0)))}</td>
                    <td class="c-right">${escapeHtml(formatCurrency(Number(reimbursementDetailedSummary.costs || 0)))}</td>
                    <td class="c-right">${escapeHtml(formatCurrency(Number(reimbursementDetailedSummary.interest || 0)))}</td>
                    <td class="c-right">${escapeHtml(formatCurrency(Number(reimbursementDetailedSummary.principal || 0)))}</td>
                    <td class="c-right">${escapeHtml(formatCurrency(Number(reimbursementDetailedSummary.total || 0)))}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `;
      openCorporatePrintWindow({
        title: "Reembolso-Realizado",
        bodyHtml: html,
        landscape: true,
      });
      return;
    }
    if (tab === "previstos") {
      const printDate = new Date();
      const referenceLabel = forecastReferenceLabel(fromDate, toDate);
      const carteiraLabel = manager === "all" ? "TODAS AS CARTEIRAS" : manager;
      const generatedBy = (currentUser?.fullName || "Sistema").toUpperCase();
      const totalCount = Number(forecastVisibleSummary.totalCount || 0);
      const totalValue = Number(forecastVisibleSummary.totalValue || 0);
      const rows = forecastVisibleItems
        .map((item) => `
          <tr>
            <td>${escapeHtml(formatDateOnly(item.dueDate))}</td>
            <td>${escapeHtml(String(item.clientName || "").toUpperCase())}</td>
            <td>${escapeHtml(String(forecastProfessionLabel(item)).toUpperCase())}</td>
            <td>${escapeHtml(forecastContactLabel(item))}</td>
            <td>${escapeHtml(String(forecastPortfolioLabel(item)).toUpperCase())}</td>
            <td class="c-center">${escapeHtml(forecastInstallmentNumberLabel(item))}</td>
            <td class="c-right">${escapeHtml(formatCurrency(forecastVigenteAmount(item)))}</td>
          </tr>
        `)
        .join("");
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Reemb-Previstos</title>
            <style>
              @page { size: A4 portrait; margin: 8mm; }
              body { margin: 0; font-family: Arial, sans-serif; background: #d9d9d9; color: #111; }
              .wrap { padding: 4px 4px 10px; }
              .title-bar { background: #5e5e5e; color: #fff; text-align: center; font-size: 15px; padding: 7px 10px; letter-spacing: 0.2px; }
              .meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 10px; padding: 6px 2px 8px; }
              .meta-left, .meta-right { white-space: nowrap; }
              .section { margin-top: 10px; border-left: 1px solid #222; border-right: 1px solid #222; padding-top: 2px; }
              .section-title { text-align: center; font-size: 12px; font-weight: 700; text-decoration: underline; margin: 0 0 4px; }
              table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; }
              th, td { border: 1px solid #222; padding: 4px 5px; font-size: 9px; line-height: 1.15; }
              th { background: #6a6a6a; color: #fff; text-align: left; font-weight: 600; }
              .c-center { text-align: center; }
              .c-right { text-align: right; }
              .w-date { width: 8%; }
              .w-client { width: 29%; }
              .w-prof { width: 15%; }
              .w-contact { width: 6%; }
              .w-line { width: 23%; }
              .w-instn { width: 9%; }
              .w-amt { width: 10%; }
              .total-row td { background: #f6f6f6; }
              .total-label { color: #d10000; font-weight: 700; text-align: center; }
              .total-num, .total-val { color: #d10000; font-weight: 700; }
              .total-num { text-align: center; }
              .total-val { text-align: right; }
            </style>
          </head>
          <body>
            <div class="wrap">
              <div class="title-bar">REEMBOLSO PREVISTO * Detalhado</div>
              <div class="meta">
                <div class="meta-left">${escapeHtml(`${carteiraLabel} ${referenceLabel}`)}</div>
                <div class="meta-right">${escapeHtml(`${formatTimeOnlyPT(printDate)} ${formatDateOnly(printDate.toISOString().slice(0, 10))} ${generatedBy}`)}</div>
              </div>
              <div class="section">
                <div class="section-title">GERAL</div>
                <table>
                  <thead>
                    <tr>
                      <th class="w-date">Vencimento</th>
                      <th class="w-client">Cliente</th>
                      <th class="w-prof">Profissao</th>
                      <th class="w-contact">Contato</th>
                      <th class="w-line">Gestor - Linha</th>
                      <th class="w-instn c-center">Prestacao No</th>
                      <th class="w-amt c-right">Prestacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows || "<tr><td colspan='7' class='c-center'>Sem dados.</td></tr>"}
                    <tr class="total-row">
                      <td colspan="5" class="total-label">Total: ${totalCount}</td>
                      <td class="total-num">${totalCount}</td>
                      <td class="total-val">${escapeHtml(formatCurrency(totalValue))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </body>
        </html>
      `;
      openCorporatePrintWindow({
        title: "Reemb-Previstos",
        bodyHtml: html,
        landscape: false,
      });
      return;
    }
    if (tab === "desempenho") {
      const printDate = new Date();
      const carteiraLabel = manager === "all" ? "CARTEIRA GERAL" : manager;
      const generatedBy = (currentUser?.fullName || "Sistema").toUpperCase();
      const total = performanceTotals;
      const rows = performanceRows
        .map((row) => `
          <tr>
            <td class="txt">${escapeHtml(performanceActorNameLabel(row))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.disbursementAmount || 0)))}</td>
            <td class="numc">${Number(row.newClients || 0)}</td>
            <td class="numc">${Number(row.reimbursementCount || 0)}</td>
            <td class="numc">${Number(row.vigenteCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.vigenteCapital || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.reimbursementInterest || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.reimbursementPrincipal || 0)))}</td>
            <td class="numc">${Number(row.moraTodayCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.moraTodayCapital || 0)))}</td>
            <td class="numc">${Number(row.moraTotalCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.moraTotalCapital || 0)))}</td>
            <td class="numc">${escapeHtml(formatPercentValue(Number(row.moraRiskPercent || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.moraOver7Capital || 0)))}</td>
            <td class="numc">${Number(row.moraOver7Count || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.moraOver15Capital || 0)))}</td>
            <td class="numc">${Number(row.moraOver15Count || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(row.moraOver30Capital || 0)))}</td>
            <td class="numc">${Number(row.moraOver30Count || 0)}</td>
          </tr>
        `)
        .join("");
      const totalRows = total
        ? `
          <tr class="total-red">
            <td class="label">TOTAL</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.disbursementAmount || 0)))}</td>
            <td class="numc">${Number(total.newClients || 0)}</td>
            <td class="numc">${Number(total.reimbursementCount || 0)}</td>
            <td class="numc">${Number(total.vigenteCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.vigenteCapital || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.reimbursementInterest || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.reimbursementPrincipal || 0)))}</td>
            <td class="numc">${Number(total.moraTodayCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraTodayCapital || 0)))}</td>
            <td class="numc">${Number(total.moraTotalCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraTotalCapital || 0)))}</td>
            <td class="numc">${escapeHtml(formatPercentValue(Number(total.moraRiskPercent || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraOver7Capital || 0)))}</td>
            <td class="numc">${Number(total.moraOver7Count || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraOver15Capital || 0)))}</td>
            <td class="numc">${Number(total.moraOver15Count || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraOver30Capital || 0)))}</td>
            <td class="numc">${Number(total.moraOver30Count || 0)}</td>
          </tr>
          <tr class="total-blue">
            <td class="label">GLOBAL</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.disbursementAmount || 0)))}</td>
            <td class="numc">${Number(total.newClients || 0)}</td>
            <td class="numc">${Number(total.reimbursementCount || 0)}</td>
            <td class="numc">${Number(total.vigenteCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.vigenteCapital || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.reimbursementInterest || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.reimbursementPrincipal || 0)))}</td>
            <td class="numc">${Number(total.moraTodayCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraTodayCapital || 0)))}</td>
            <td class="numc">${Number(total.moraTotalCount || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraTotalCapital || 0)))}</td>
            <td class="numc">${escapeHtml(formatPercentValue(Number(total.moraRiskPercent || 0)))}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraOver7Capital || 0)))}</td>
            <td class="numc">${Number(total.moraOver7Count || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraOver15Capital || 0)))}</td>
            <td class="numc">${Number(total.moraOver15Count || 0)}</td>
            <td class="num">${escapeHtml(formatCurrency(Number(total.moraOver30Capital || 0)))}</td>
            <td class="numc">${Number(total.moraOver30Count || 0)}</td>
          </tr>
        `
        : "";
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Desempenho</title>
            <style>
              @page { size: A4 landscape; margin: 6mm; }
              body { margin: 0; font-family: Arial, sans-serif; background: #d9d9d9; color: #111; }
              .wrap { padding: 4px; }
              .title-bar { background: #5e5e5e; color: #fff; text-align: center; font-size: 14px; padding: 7px 10px; }
              .meta { display:flex; justify-content:space-between; gap:8px; font-size:10px; padding:7px 2px 10px; }
              .block { border-left:1px solid #222; border-right:1px solid #222; padding-top:2px; }
              table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; }
              th, td { border:1px solid #222; padding:3px 4px; font-size:8px; line-height:1.15; }
              th { background:#6a6a6a; color:#fff; font-weight:600; text-align:center; }
              th.group { background:#fff; color:#111; font-size:10px; text-decoration: underline; }
              td.txt { font-weight:600; }
              td.num { text-align:right; }
              td.numc { text-align:center; }
              .label { text-align:center; font-weight:700; }
              .total-red td { color:#d10000; font-weight:700; }
              .total-blue td { color:#003bff; font-weight:700; }
            </style>
          </head>
          <body>
            <div class="wrap">
              <div class="title-bar">${escapeHtml(performanceTitleLabel)}</div>
              <div class="meta">
                <div>${escapeHtml(`${carteiraLabel} ${performanceReferenceRangeLabel}`)}</div>
                <div>${escapeHtml(`${formatTimeOnlyPT(printDate)} ${formatDateOnly(printDate.toISOString().slice(0, 10))} ${generatedBy}`)}</div>
              </div>
              <div class="block">
                <table>
                  <thead>
                    <tr>
                      <th rowspan="2" style="width:15%;">${escapeHtml(carteiraLabel)}</th>
                      <th class="group" colspan="3">DESEMBOLSO NO MES</th>
                      <th class="group" colspan="2">VIGENTE</th>
                      <th class="group" colspan="2">REEMBOLSO</th>
                      <th class="group" colspan="2">CARTEIRA EM MORA HOJE</th>
                      <th class="group" colspan="3">CARTEIRA EM MORA TOTAL</th>
                      <th class="group" colspan="6">CARTEIRA EM MORA EM DIAS</th>
                    </tr>
                    <tr>
                      <th>Montante</th><th>#Nov</th><th>#Rep</th>
                      <th>#</th><th>Capital</th>
                      <th>Juro</th><th>Capital</th>
                      <th>#</th><th>Capital</th>
                      <th>#</th><th>Capital (Risco)</th><th>%</th>
                      <th>&gt; 7 Dias</th><th>#</th>
                      <th>&gt; 15 Dias</th><th>#</th>
                      <th>&gt; 30 Dias</th><th>#</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows || "<tr><td colspan='19' class='numc'>Sem dados para o mes selecionado.</td></tr>"}
                    ${totalRows}
                  </tbody>
                </table>
              </div>
            </div>
          </body>
        </html>
      `;
      openCorporatePrintWindow({
        title: "Desempenho",
        bodyHtml: html,
        landscape: true,
      });
      return;
    }
    if (tab === "outros") {
      const rows = otherVisibleItems
        .map((item) => `<tr><td>${formatDateOnly(item.eventDate || item.createdAt)}</td><td>${item.eventTypeLabel || otherOperationLabel(item.eventType || "")}</td><td>${item.contractNo}</td><td>${item.clientName}</td><td>${item.managerName}</td><td>${formatCurrencyMT(item.amount)}</td><td>${item.workflowStatus || "-"}</td><td>${item.createdByName}</td><td>${item.note || "-"}</td></tr>`)
        .join("");
      const operationLabel = otherOperationLabel(otherOperation);
      openCorporatePrintWindow({
        title: `Outros-${operationLabel.replace(/\s+/g, "-")}`,
        bodyHtml: `<div class="title">RELATORIO DE OUTROS - ${operationLabel.toUpperCase()}</div><div class="muted">Gerado: ${now}</div><div class="muted">${otherOperationDescription(otherOperation)}</div><div class="muted">Registros: ${otherVisibleSummary.count} | Total: ${formatCurrencyMT(otherVisibleSummary.total)}</div><table><thead><tr><th>Data</th><th>Tipo</th><th>Contrato</th><th>Cliente</th><th>Gestor</th><th>${otherOperationAmountLabel(otherOperation)}</th><th>Estado</th><th>Operador</th><th>Nota</th></tr></thead><tbody>${rows || "<tr><td colspan='9'>Sem movimentos no periodo.</td></tr>"}</tbody></table>`,
        landscape: true,
      });
      return;
    }
    const printDate = new Date();
    const generatedBy = (currentUser?.fullName || "Sistema").toUpperCase();
    const groupsHtml = moraPortfolioGroups
      .map((group) => {
        const rows = (group.rows || [])
          .map((row) => `
            <tr>
              <td class="c-client">${escapeHtml(String(moraClientLineLabel(row)).toUpperCase())}</td>
              <td class="c-center">${escapeHtml(formatDateOnly(row.disbursedOn || ""))}</td>
              <td class="c-right">${escapeHtml(formatCurrency(Number(row.disbursedAmount || 0)))}</td>
              <td class="c-right">${escapeHtml(formatCurrency(Number(row.capitalRiskAmount || 0)))}</td>
              <td class="c-center">${Number(row.overdueInstallments || 0)}</td>
              <td class="c-center">${Number(row.daysLateTotal || 0)}</td>
              <td class="c-center">${Number(row.daysLateVigente || 0)}</td>
              <td class="c-right">${escapeHtml(formatCurrency(Number(row.moraAmount || 0)))}</td>
              <td class="c-right">${escapeHtml(formatCurrency(Number(row.principalOverdueAmount || 0)))}</td>
              <td class="c-right">${escapeHtml(formatCurrency(Number(row.interestOverdueAmount || 0)))}</td>
              <td class="c-right">${escapeHtml(formatCurrency(Number(row.totalOverdueAmount || 0)))}</td>
            </tr>
          `)
          .join("");
        return `
          <div class="portfolio-block">
            <div class="portfolio-label">CARTEIRA - ${escapeHtml(String(group.managerName || "Sem Gestor").toUpperCase())}</div>
            <table>
              <thead>
                <tr>
                  <th class="left w-client"></th>
                  <th colspan="2">Desembolso</th>
                  <th colspan="1">Capital</th>
                  <th colspan="1">Prest</th>
                  <th colspan="2">Dias Atraso</th>
                  <th colspan="1">Mora</th>
                  <th colspan="1">Capital</th>
                  <th colspan="1">Juro</th>
                  <th colspan="1">Total</th>
                </tr>
                <tr>
                  <th class="left w-client">Cliente</th>
                  <th class="w-date">Data</th>
                  <th class="w-val">Montante</th>
                  <th class="w-val">Risco</th>
                  <th class="w-sm">Atraso</th>
                  <th class="w-sm">Total</th>
                  <th class="w-sm">Vigente</th>
                  <th class="w-val">Montante</th>
                  <th class="w-val">Atraso</th>
                  <th class="w-val">Atraso</th>
                  <th class="w-val">Atraso</th>
                </tr>
              </thead>
              <tbody>
                ${rows || "<tr><td colspan='11' class='c-center'>Sem dados nesta carteira.</td></tr>"}
                <tr class="group-total">
                  <td class="c-center">Clientes: ${Number(group.clientCount || 0)} - Creditos: ${Number(group.creditCount || 0)}</td>
                  <td></td>
                  <td class="c-right">${escapeHtml(formatCurrency(Number(group.disbursedAmount || 0)))}</td>
                  <td class="c-right">${escapeHtml(formatCurrency(Number(group.capitalRiskAmount || 0)))}</td>
                  <td class="c-center">${Number(group.overdueInstallments || 0)}</td>
                  <td class="c-center">${Number(group.daysLateTotal || 0)}</td>
                  <td class="c-center">${Number(group.daysLateVigenteTotal || 0)}</td>
                  <td class="c-right">${escapeHtml(formatCurrency(Number(group.moraAmount || 0)))}</td>
                  <td class="c-right">${escapeHtml(formatCurrency(Number(group.principalOverdueAmount || 0)))}</td>
                  <td class="c-right">${escapeHtml(formatCurrency(Number(group.interestOverdueAmount || 0)))}</td>
                  <td class="c-right">${escapeHtml(formatCurrency(Number(group.totalOverdueAmount || 0)))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      })
      .join("");
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Carteira em Mora</title>
          <style>
            @page { size: A4 landscape; margin: 6mm; }
            body { margin: 0; font-family: Arial, sans-serif; background: #d9d9d9; color: #111; }
            .wrap { padding: 4px; }
            .title-bar { background: #5e5e5e; color: #fff; text-align: center; font-size: 14px; padding: 7px 10px; }
            .meta { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:10px; padding:8px 2px 12px; }
            .rule-bar { margin: 0 0 10px; padding: 6px 8px; border:1px solid #222; background:#fff5f5; color:#8a1111; font-size:9px; font-weight:700; }
            .portfolio-block { margin-bottom: 12px; }
            .portfolio-label { color: #d10000; font-size: 10px; padding: 2px 4px; border:1px solid #222; border-bottom:0; background:#fff; }
            table { width:100%; border-collapse:collapse; table-layout: fixed; background:#fff; }
            th, td { border:1px solid #222; padding:3px 4px; font-size:8px; line-height:1.15; }
            th { background:#6a6a6a; color:#fff; font-weight:600; text-align:center; }
            th.left { text-align:left; }
            .c-client { text-align:left; }
            .c-center { text-align:center; }
            .c-right { text-align:right; }
            .w-client { width: 53%; }
            .w-date { width: 7%; }
            .w-sm { width: 4%; }
            .w-val { width: 7%; }
            .group-total td { color:#d10000; font-weight:700; }
            .global-box { margin-top: 6px; border:1px solid #222; background:#fff; }
            .global-box table { border:0; }
            .global-box td, .global-box th { font-size:9px; }
            .global-box .label { color:#d10000; font-weight:700; text-align:center; }
            .global-box .num { color:#d10000; font-weight:700; text-align:right; }
            .global-box .numc { color:#d10000; font-weight:700; text-align:center; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="title-bar">CARTEIRA EM MORA</div>
            <div class="meta">
              <div>${escapeHtml(`${manager === "all" ? "TODAS AS CARTEIRAS" : manager} ${moraHeaderRangeLabel}`)}</div>
              <div>${escapeHtml(`${formatTimeOnlyPT(printDate)} ${formatDateOnly(printDate.toISOString().slice(0, 10))} ${generatedBy}`)}</div>
            </div>
            <div class="rule-bar">${escapeHtml(moraCalculationInfo)}</div>
            ${groupsHtml || "<div class='portfolio-label'>SEM DADOS</div><table><tbody><tr><td class='c-center'>Sem creditos em mora no filtro.</td></tr></tbody></table>"}
            <div class="global-box">
              <table>
                <tbody>
                  <tr>
                    <td class="label" style="width:53%;">Clientes: ${Number(moraSummary.clientCount || 0)}</td>
                    <th style="width:7%;">Desembolso</th>
                    <th style="width:7%;">Capital Em Risco</th>
                    <th style="width:4%;">Prest. Atraso</th>
                    <th style="width:4%;">D.Total</th>
                    <th style="width:4%;">D.Vigente</th>
                    <th style="width:7%;">Mora</th>
                    <th style="width:7%;">Capital Atraso</th>
                    <th style="width:7%;">Juro Atraso</th>
                    <th style="width:7%;">Total Atraso</th>
                  </tr>
                  <tr>
                    <td class="label">Creditos: ${Number(moraSummary.creditCount || 0)}</td>
                    <td class="num">${escapeHtml(formatCurrency(Number(moraSummary.disbursedAmount || 0)))}</td>
                    <td class="num">${escapeHtml(formatCurrency(Number(moraSummary.capitalRiskAmount || 0)))}</td>
                    <td class="numc">${Number(moraSummary.overdueInstallments || 0)}</td>
                    <td class="numc">${Number(moraSummary.daysLateTotal || 0)}</td>
                    <td class="numc">${Number(moraSummary.daysLateVigenteTotal || 0)}</td>
                    <td class="num">${escapeHtml(formatCurrency(Number(moraSummary.moraAmount || 0)))}</td>
                    <td class="num">${escapeHtml(formatCurrency(Number(moraSummary.principalOverdueAmount || 0)))}</td>
                    <td class="num">${escapeHtml(formatCurrency(Number(moraSummary.interestOverdueAmount || 0)))}</td>
                    <td class="num">${escapeHtml(formatCurrency(Number(moraSummary.totalOverdueAmount || 0)))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
    openCorporatePrintWindow({
      title: "Carteira-Em-Mora",
      bodyHtml: html,
      landscape: true,
    });
  };

  const handlePrintReceipt = async (reimbursementId: number) => {
    try {
      setError("");
      const data = await apiFetch<ReimbursementReceiptResponse>(`/loans/payments/reimbursements/${reimbursementId}`);
      const repayment = data.repayment;
      const company = data.company;
      const client: NonNullable<ReimbursementReceiptResponse["client"]> = data.client ?? {
        id: repayment.clientId,
        name: repayment.clientName,
        phone: repayment.clientPhone,
        phoneAlt: "",
        nuit: "",
        documentType: "",
        documentNumber: "",
        email: "",
        occupation: "",
        addressLine: "",
        houseNumber: "",
        neighborhood: "",
        district: "",
        city: "",
        province: "",
      };
      const generatedAtDate = new Date();
      const generatedAt = `${formatTimeOnlyPT(generatedAtDate)} ${formatDateOnly(generatedAtDate.toISOString().slice(0, 10))}`;
      const settlement = data.settlement || { isTotalDebtSettlement: false, remainingDebt: 0 };
      const contextRemainingDebtRaw = repayment.loanId && settlement.selectedLoanRemainingDebt !== null && settlement.selectedLoanRemainingDebt !== undefined
        ? Number(settlement.selectedLoanRemainingDebt || 0)
        : Number(settlement.remainingDebt || 0);
      const contextRemainingDebt = Math.max(0, contextRemainingDebtRaw);
      const totalPaidApplied = Number(settlement.totalPaidAmount ?? repayment.amountApplied ?? 0);
      const totalDebt = Number(settlement.totalDebtBeforePayment ?? (contextRemainingDebt + totalPaidApplied));
      const statusLabel = contextRemainingDebt <= 0.009 ? "PAGO" : "COM REMANESCENTE";

      const lines: ReceiptInvoiceLine[] = (data.allocations || []).map((item) => ({
        description: `${item.contractNo || repayment.contractNo || "-"} - Prestacao ${item.installmentNo}`,
        note: `Venc: ${formatDateOnly(item.dueDate)} | Dias atraso: ${Number(item.daysOverdue || 0)} | Capital: ${formatCurrency(Number(item.principalAmount || 0))} | Juro: ${formatCurrency(Number(item.interestAmount || 0))} | Mora: ${formatCurrency(Number(item.moraAmount || 0))}`,
        price: Number(item.installmentAmount || item.totalApplied || 0),
        qty: 1,
        total: Number(item.totalApplied || 0),
      }));
      if (!lines.length) {
        lines.push({
          description: `Pagamento ${repayment.contractNo ? `do contrato ${repayment.contractNo}` : "sem contrato especifico"}`,
          note: `Data: ${formatDateOnly(repayment.paymentDate)} | Operador: ${repayment.createdByName || "Sistema"}`,
          price: Number(repayment.amountApplied || 0),
          qty: 1,
          total: Number(repayment.amountApplied || 0),
        });
      }

      const clientAddress = compactLabel([
        client.addressLine,
        client.houseNumber ? `Casa ${client.houseNumber}` : "",
        client.neighborhood,
        client.district,
        client.city,
        client.province,
      ]);
      const html = renderReceiptInvoiceDocument({
        title: "RECIBO DE PAGAMENTO",
        docNo: repayment.receiptNo || `#${repayment.id}`,
        issueDate: formatDateOnly(repayment.paymentDate),
        generatedAt,
        operatorName: repayment.createdByName || "Sistema",
        company: {
          name: company.name,
          legalName: company.legalName,
          nuit: company.nuit,
          phone: company.phone,
          email: company.email,
          address: company.address,
        },
        client: {
          name: client.name || repayment.clientName,
          nuit: client.nuit || "",
          phone: client.phone || repayment.clientPhone || "",
          phoneAlt: client.phoneAlt || "",
          email: client.email || "",
          documentType: client.documentType || "",
          documentNumber: client.documentNumber || "",
          occupation: client.occupation || "",
          address: clientAddress,
        },
        lines,
        totalDebt,
        totalPaid: totalPaidApplied,
        remainingDebt: contextRemainingDebt,
        paymentReceived: Number(repayment.amountReceived || 0),
        paymentApplied: totalPaidApplied,
        statusLabel,
        scopeLabel: repayment.contractNo ? `Contrato ${repayment.contractNo}` : "Escopo Cliente",
        duplicateOnA4: true,
      });
      const ok = openCorporatePrintWindow({
        title: `Recibo-${(repayment.receiptNo || repayment.id).toString().replace(/\s/g, "-")}`,
        bodyHtml: html,
        landscape: false,
        browserControls: true,
      });
      if (!ok) setError("Nao foi possivel abrir o recibo para impressao.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar recibo.");
    }
  };

  const handlePrintCreditReceipt = async () => {
    try {
      setError("");
      const clientId = Number(receiptClientId || 0);
      const loanId = Number(receiptLoanId || 0);
      if (!clientId) {
        setError("Selecione o cliente para imprimir o recibo do credito.");
        return;
      }
      if (!loanId) {
        setError("Selecione o credito/contrato para imprimir o recibo completo.");
        return;
      }
      const rows = reimbursementDetailedRows
        .filter((row) => Number(row.clientId || 0) === clientId && Number(row.loanId || 0) === loanId)
        .slice()
        .sort((a, b) => {
          const paymentDateCompare = String(a.paymentDate || "").localeCompare(String(b.paymentDate || ""));
          if (paymentDateCompare !== 0) return paymentDateCompare;
          const installmentCompare = Number(a.installmentNo || 0) - Number(b.installmentNo || 0);
          if (installmentCompare !== 0) return installmentCompare;
          return Number(a.allocationId || 0) - Number(b.allocationId || 0);
        });
      if (!rows.length) {
        setError("Sem pagamentos/alocacoes no filtro para este credito.");
        return;
      }
      const first = rows[0];
      const totals = rows.reduce(
        (acc, row) => {
          acc.total += Number(row.totalAmount || 0);
          return acc;
        },
        { total: 0 },
      );

      const [installmentsPayload, refReceiptPayload] = await Promise.all([
        apiFetch<LoanInstallmentsReceiptResponse>(`/loans/${loanId}/installments`),
        (async () => {
          const referencePayment = receiptPaymentOptions.find((item) => Number(item.loanId || 0) === loanId) || null;
          if (!referencePayment) return null;
          try {
            return await apiFetch<ReimbursementReceiptResponse>(`/loans/payments/reimbursements/${referencePayment.id}`);
          } catch {
            return null;
          }
        })(),
      ]);

      const summary = installmentsPayload?.summary || { paidAmount: 0, pendingAmount: 0 };
      const totalPaid = Number(summary.paidAmount || 0);
      const remainingDebt = Math.max(0, Number(summary.pendingAmount || 0));
      const totalDebt = totalPaid + remainingDebt;
      const statusLabel = remainingDebt <= 0.009 ? "PAGO" : "COM REMANESCENTE";

      const referenceClient = refReceiptPayload?.client || null;
      const referenceCompany = refReceiptPayload?.company || null;
      const generatedAtDate = new Date();
      const generatedAt = `${formatTimeOnlyPT(generatedAtDate)} ${formatDateOnly(generatedAtDate.toISOString().slice(0, 10))}`;
      const lines: ReceiptInvoiceLine[] = rows.map((row) => ({
        description: `${row.contractNo || installmentsPayload?.contractNo || `#${loanId}`} - Prestacao ${reimbursementInstallmentLabel(row)}`,
        note: `Venc: ${formatDateOnly(row.dueDate)} | Pag.: ${formatDateOnly(row.paymentDate)} | Recibo ${row.receiptNo || "-"} | Capital: ${formatCurrency(Number(row.principalAmount || 0))} | Juro: ${formatCurrency(Number(row.interestAmount || 0))} | Mora: ${formatCurrency(Number(row.moraAmount || 0))}`,
        price: Number(row.totalAmount || 0),
        qty: 1,
        total: Number(row.totalAmount || 0),
      }));
      const clientAddress = compactLabel([
        referenceClient?.addressLine,
        referenceClient?.houseNumber ? `Casa ${referenceClient.houseNumber}` : "",
        referenceClient?.neighborhood || first.clientNeighborhood || "",
        referenceClient?.district || "",
        referenceClient?.city || "",
        referenceClient?.province || "",
      ]);
      const html = renderReceiptInvoiceDocument({
        title: "RECIBO DE CREDITO / CONTRATO",
        docNo: installmentsPayload?.contractNo || first.contractNo || `#${loanId}`,
        issueDate: formatDateOnly(new Date().toISOString().slice(0, 10)),
        generatedAt,
        operatorName: currentUser?.fullName || "Sistema",
        company: {
          name: referenceCompany?.name || currentUser?.companyName || "",
          legalName: referenceCompany?.legalName || "",
          nuit: referenceCompany?.nuit || "",
          phone: referenceCompany?.phone || "",
          email: referenceCompany?.email || "",
          address: referenceCompany?.address || "",
        },
        client: {
          name: referenceClient?.name || first.clientName || "",
          nuit: referenceClient?.nuit || "",
          phone: referenceClient?.phone || first.clientPhone || "",
          phoneAlt: referenceClient?.phoneAlt || "",
          email: referenceClient?.email || "",
          documentType: referenceClient?.documentType || "",
          documentNumber: referenceClient?.documentNumber || "",
          occupation: referenceClient?.occupation || first.clientOccupation || "",
          address: clientAddress,
        },
        lines,
        totalDebt,
        totalPaid,
        remainingDebt,
        paymentReceived: totals.total,
        paymentApplied: totals.total,
        statusLabel,
        scopeLabel: `Contrato ${installmentsPayload?.contractNo || first.contractNo || loanId}`,
      });
      const ok = openCorporatePrintWindow({
        title: `Recibo-Credito-${(first.contractNo || loanId).toString().replace(/\s/g, "-")}`,
        bodyHtml: html,
        landscape: false,
        browserControls: true,
      });
      if (!ok) setError("Nao foi possivel abrir o recibo do credito.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar recibo do credito.");
    }
  };

  const handleClosePerformanceMonth = async () => {
    if (currentUser?.role !== "admin") return;
    const ok = window.confirm(`Deseja fechar o mês ${monthLabelPt(performanceMonth)} no desempenho?`);
    if (!ok) return;
    try {
      setClosingPerformanceMonth(true);
      setError("");
      setSuccess("");
      const result = await apiFetch<{ message: string; month: string; nextMonth?: string }>("/loans/collections/performance-monthly/close", {
        method: "POST",
        body: JSON.stringify({ month: performanceMonth }),
      });
      setSuccess(result.message);
      setPerformanceMonth(result.nextMonth || nextYearMonth(performanceMonth));
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao fechar mes de desempenho.");
    } finally {
      setClosingPerformanceMonth(false);
    }
  };

  const handleReopenPerformanceMonth = async () => {
    if (currentUser?.role !== "admin") return;
    const ok = window.confirm(`Deseja reabrir o mês ${monthLabelPt(performanceMonth)}?`);
    if (!ok) return;
    try {
      setReopeningPerformanceMonth(true);
      setError("");
      setSuccess("");
      const result = await apiFetch<{ message: string }>("/loans/collections/performance-monthly/reopen", {
        method: "POST",
        body: JSON.stringify({ month: performanceMonth }),
      });
      setSuccess(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao reabrir mes de desempenho.");
    } finally {
      setReopeningPerformanceMonth(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pagamentos e Reembolsos</h1>
          <p className="text-slate-600 mt-1">Operacao completa: Reembolsos, Previstos, Desempenho, Mora e Outros</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportPdf} className="gap-2"><FileText className="w-4 h-4" />PDF</Button>
          <Button variant="outline" onClick={handleExportCsv} className="gap-2"><Download className="w-4 h-4" />Excel (CSV)</Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
      {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">{success}</p>}

      <div className="p-4 rounded-lg border border-slate-200 bg-white grid grid-cols-1 md:grid-cols-8 gap-3">
        <div className="space-y-1">
          <Label>Periodo</Label>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value) as 7 | 14 | 30 | 60 | 90)}>
            <option value={7}>7 dias</option><option value={14}>14 dias</option><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Carteira / Gestor</Label>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={manager} onChange={(e) => setManager(e.target.value)}>
            {managerOptions.map((name) => <option key={name} value={name}>{name === "all" ? "Todas as carteiras" : name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={clientType} onChange={(e) => setClientType(e.target.value as "all" | "singular" | "grupo" | "empresa")}>
            <option value="all">Todos</option>
            <option value="singular">Singular</option>
            <option value="grupo">Grupo</option>
            <option value="empresa">Empresa</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Data de</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Data ate</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="md:col-span-3 flex items-end">
          <Button variant="outline" onClick={loadAll} className="gap-2"><RefreshCw className="w-4 h-4" />Atualizar</Button>
        </div>
      </div>

      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="w-[96vw] max-w-[calc(100vw-2rem)] sm:max-w-5xl md:max-w-6xl lg:max-w-7xl max-h-[92vh] overflow-hidden p-0">
          <div className="max-h-[92vh] overflow-y-auto p-6 pr-4">
          <DialogHeader>
            <DialogTitle>Novo pagamento / Reembolso</DialogTitle>
            <DialogDescription>
              Fluxo especializado por tipo de cliente. Contratos e prestacoes pagas permanecem bloqueados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Tipo de cliente</Label>
                  <select
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full"
                    value={paymentClientType}
                    onChange={(e) => setPaymentClientType(e.target.value as PaymentClientType)}
                  >
                    <option value="singular">Pessoal</option>
                    <option value="grupo">Grupo</option>
                    <option value="empresa">Empresa</option>
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>{paymentClientType === "singular" ? "Pessoa" : paymentClientType === "grupo" ? "Grupo" : "Empresa"}</Label>
                  <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={paymentClientId} onChange={(e) => setPaymentClientId(e.target.value)}>
                    <option value="">Selecione</option>
                    {paymentClientOptions.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.contractsCount} contrato(s){c.lastDisbursedOn ? ` | Último desembolso: ${String(c.lastDisbursedOn).slice(0, 10)}` : ""}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Modo de lancamento</Label>
                  <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as "loan" | "client_auto")}>
                    <option value="loan">Por contrato</option>
                    <option value="client_auto">Automatico por cliente</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Data pagamento</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Valor recebido</Label>
                  <Input
                    value={paymentAmount}
                    inputMode="decimal"
                    onChange={(e) => setPaymentAmount(normalizeCurrencyInputText(e.target.value))}
                    onBlur={(e) => setPaymentAmount(commitCurrencyInputText(e.target.value))}
                    placeholder="Ex: 3,250.00"
                    disabled={isGroupContractIndividual}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Observacao</Label>
                <Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Observacao opcional do pagamento" />
              </div>
            </div>

            {paymentMode === "loan" && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Contrato e prestacao</p>
                    <p className="text-xs text-slate-600">Selecione um contrato em aberto. Prestacoes pagas ficam desativadas.</p>
                  </div>
                  {selectedPaymentClient && (
                    <Badge variant="outline" className="text-xs">
                      {clientTypeLabel(selectedPaymentClientType)}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Contrato</Label>
                  <select
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full"
                    value={paymentLoanId}
                    onChange={(e) => setPaymentLoanId(e.target.value)}
                    disabled={!paymentClientId}
                  >
                    <option value="">Selecione contrato</option>
                    {contracts.map((ct) => (
                      <option key={ct.id} value={ct.id} disabled={!ct.isPayable}>
                        {ct.contractNo} | Saldo {formatCurrencyMT(ct.balance)} | Capital {formatCurrencyMT(ct.principal)}
                        {ct.isLiquidated ? " | LIQUIDADO" : ct.disbursementStatus !== "disbursed" ? " | BLOQUEADO" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedContract && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge className="bg-slate-100 text-slate-800 border-slate-200">{selectedContract.contractNo}</Badge>
                      <Badge variant="outline">Saldo {formatCurrencyMT(selectedContract.balance)}</Badge>
                      <Badge variant="outline">Produto {selectedContract.product || "-"}</Badge>
                    </div>
                  )}
                  {selectedContract && !selectedContract.isPayable && (
                    <p className="text-xs text-amber-700">Contrato bloqueado para pagamento. Selecione um contrato em aberto.</p>
                  )}
                </div>

                {isGroupContract && (
                  <div className="rounded-md border border-blue-100 bg-blue-50 p-3 space-y-2">
                    <p className="text-sm font-semibold text-blue-900">Pagamento de grupo</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={groupPaymentEntryMode === "general" ? "default" : "outline"}
                        onClick={() => setGroupPaymentEntryMode("general")}
                      >
                        Pagamento geral
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={groupPaymentEntryMode === "individual" ? "default" : "outline"}
                        onClick={() => setGroupPaymentEntryMode("individual")}
                      >
                        Por pessoa
                      </Button>
                    </div>
                    <p className="text-xs text-blue-800">
                      {groupPaymentEntryMode === "general"
                        ? "No modo geral o pagamento e registrado no contrato. A tela mostra apenas uma pre-visualizacao de cobranca por membros."
                        : "No modo por pessoa o valor e vinculado aos membros selecionados do grupo."}
                    </p>
                  </div>
                )}

                {shouldChooseInstallment && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Prestacao / Parcela (vigente)</Label>
                      <select
                        className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full"
                        value={paymentInstallmentId}
                        onChange={(e) => setPaymentInstallmentId(e.target.value)}
                        disabled={!selectedContract || !selectedContract.isPayable || loadingLoanInstallments}
                      >
                        <option value="">{loadingLoanInstallments ? "A carregar parcelas..." : "Selecione a prestacao"}</option>
                        {loanInstallments.map((item) => (
                          <option key={item.id} value={item.id} disabled={item.status === "paid"}>
                            Parcela #{item.installmentNo} | {item.dueDate} | {formatCurrencyMT(item.paymentAmount)} | {installmentStatusLabel(item.status)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-600">Resumo do vigente selecionado</p>
                      {selectedInstallment ? (
                        <div className="mt-2 space-y-1 text-sm text-slate-800">
                          <p><strong>Parcela:</strong> #{selectedInstallment.installmentNo} ({installmentStatusLabel(selectedInstallment.status)})</p>
                          <p><strong>Vencimento:</strong> {selectedInstallment.dueDate}</p>
                          <p><strong>Vigente (base):</strong> {formatCurrencyMT(selectedInstallment.paymentAmount)}</p>
                          <p><strong>Capital + Juros:</strong> {formatCurrencyMT(selectedInstallment.principalAmount + selectedInstallment.interestAmount)}</p>
                          <p className="text-xs text-amber-700">Mora (se existir) e calculada no registro. O total geral pode ser superior ao valor base.</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Selecione uma prestacao para visualizar os detalhes.</p>
                      )}
                    </div>
                  </div>
                )}

                {isGroupContractIndividual && (
                  <div className="rounded-md border border-slate-200 p-3 bg-slate-50 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Pagamentos por pessoa (grupo)</p>
                        <p className="text-xs text-slate-600">Selecione membros e informe os valores individuais.</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setGroupAllocations((prev) =>
                              prev.map((member) => ({
                                ...member,
                                selected: member.status !== "paid" && member.remainingAmount > 0,
                                amount: member.remainingAmount > 0 ? formatCurrencyInput(member.remainingAmount, { emptyIfZero: true }) : "",
                              })),
                            )
                          }
                        >
                          Selecionar pendentes
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setGroupAllocations((prev) => prev.map((member) => ({ ...member, selected: false })))
                          }
                        >
                          Limpar
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border bg-white p-2">
                        <p className="text-slate-500">Membros</p>
                        <p className="font-semibold text-slate-900">{groupAllocations.length}</p>
                      </div>
                      <div className="rounded-md border bg-white p-2">
                        <p className="text-slate-500">Selecionados</p>
                        <p className="font-semibold text-slate-900">{selectedGroupPayments.length}</p>
                      </div>
                      <div className="rounded-md border bg-white p-2">
                        <p className="text-slate-500">Total por pessoa</p>
                        <p className="font-semibold text-slate-900">{formatCurrencyMT(effectivePaymentAmount || 0)}</p>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-auto space-y-2">
                      {groupAllocations.map((member, idx) => (
                        <div key={member.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-md border border-slate-200 bg-white p-2">
                          <label className="md:col-span-5 flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={member.selected}
                              disabled={member.status === "paid" || member.remainingAmount <= 0}
                              onChange={(e) =>
                                setGroupAllocations((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx], selected: e.target.checked };
                                  return next;
                                })
                              }
                            />
                            {member.memberName}
                          </label>
                          <div className="md:col-span-3 text-xs text-slate-600">
                            Saldo: {formatCurrencyMT(member.remainingAmount)}
                            {member.status === "paid" ? " | Pago" : ""}
                          </div>
                          <div className="md:col-span-4">
                            <Input
                              value={member.amount}
                              disabled={!member.selected || member.status === "paid"}
                              inputMode="decimal"
                              onChange={(e) =>
                                setGroupAllocations((prev) => {
                                  const next = [...prev];
                                  next[idx] = {
                                    ...next[idx],
                                    amount: normalizeCurrencyInputText(e.target.value),
                                  };
                                  return next;
                                })
                              }
                              onBlur={(e) =>
                                setGroupAllocations((prev) => {
                                  const next = [...prev];
                                  next[idx] = {
                                    ...next[idx],
                                    amount: commitCurrencyInputText(e.target.value),
                                  };
                                  return next;
                                })
                              }
                              placeholder="Valor do membro"
                            />
                          </div>
                        </div>
                      ))}
                      {groupAllocations.length === 0 && <p className="text-xs text-slate-500">Sem membros alocados para este contrato.</p>}
                    </div>
                  </div>
                )}

                {isGroupContractGeneral && (
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">Cobranca geral do grupo</p>
                        <p className="text-xs text-emerald-800">Pre-visualizacao automatica: cobra primeiro membros com maior saldo, do maior para o menor.</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200">Sem divida individual nesta tela</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                      <div className="rounded-md border bg-white p-2">
                        <p className="text-slate-500">Valor recebido</p>
                        <p className="font-semibold text-slate-900">{formatCurrencyMT(effectivePaymentAmount || 0)}</p>
                      </div>
                      <div className="rounded-md border bg-white p-2">
                        <p className="text-slate-500">Auto-cobranca membros</p>
                        <p className="font-semibold text-slate-900">{formatCurrencyMT(groupGeneralPreview.totalAutoCharge)}</p>
                      </div>
                      <div className="rounded-md border bg-white p-2">
                        <p className="text-slate-500">Remanescente grupo (base)</p>
                        <p className="font-semibold text-amber-700">{formatCurrencyMT(groupGeneralPreview.groupRemainderBase)}</p>
                      </div>
                      <div className="rounded-md border bg-white p-2">
                        <p className="text-slate-500">Saldo membros (total)</p>
                        <p className="font-semibold text-slate-900">{formatCurrencyMT(groupGeneralPreview.totalMembersPending)}</p>
                      </div>
                    </div>
                    {selectedInstallment && (
                      <p className="text-xs text-amber-800">
                        Vigente base da parcela #{selectedInstallment.installmentNo}: {formatCurrencyMT(selectedInstallment.paymentAmount)}. A mora e calculada no momento do registro e deve ser considerada no total geral.
                      </p>
                    )}
                    {groupGeneralPreview.excessOverInstallmentBase > 0 && (
                      <p className="text-xs text-slate-700">
                        Excesso sobre a prestacao base: {formatCurrencyMT(groupGeneralPreview.excessOverInstallmentBase)} (sera tratado pela logica atual do contrato / remanescente).
                      </p>
                    )}
                    <div className="max-h-56 overflow-auto rounded-md border border-emerald-200 bg-white">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-emerald-50">
                            <TableHead>Membro</TableHead>
                            <TableHead>Saldo</TableHead>
                            <TableHead>Auto-cobranca</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupGeneralPreview.rows.map((member) => (
                            <TableRow key={`group-preview-${member.id}`}>
                              <TableCell>{member.memberName}</TableCell>
                              <TableCell>{formatCurrencyMT(member.remainingAmount)}</TableCell>
                              <TableCell className="font-semibold">{formatCurrencyMT(member.autoCharge)}</TableCell>
                              <TableCell>{member.status === "paid" ? "Pago" : member.status === "partial" ? "Parcial" : "Aberto"}</TableCell>
                            </TableRow>
                          ))}
                          {groupGeneralPreview.rows.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-xs text-slate-500 py-4">Sem membros alocados para este grupo.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {paymentMode === "client_auto" && (
              <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                <p className="text-sm font-semibold text-blue-900">Pagamento automatico por cliente</p>
                <p className="text-xs text-blue-800">
                  A logica atual distribui automaticamente pelos contratos/parcelas pendentes do cliente. Use "Por contrato" para escolher contrato e prestacao especifica.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Tipo</p>
                  <p className="font-semibold text-slate-900">{clientTypeLabel(selectedPaymentClientType)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="font-semibold text-slate-900">{selectedPaymentClient?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Contrato</p>
                  <p className="font-semibold text-slate-900">{selectedContract?.contractNo || (paymentMode === "client_auto" ? "Automatico" : "-")}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Valor efetivo</p>
                  <p className="font-semibold text-slate-900">{formatCurrencyMT(effectivePaymentAmount || 0)}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleApplyPayment} disabled={savingPayment}>{savingPayment ? "A aplicar..." : "Aplicar pagamento"}</Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="reembolsos">Reembolsos</TabsTrigger>
          <TabsTrigger value="previstos">Previstos</TabsTrigger>
          <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
          <TabsTrigger value="mora">Mora</TabsTrigger>
          <TabsTrigger value="outros">Outros</TabsTrigger>
        </TabsList>

        <TabsContent value="reembolsos" className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Reembolso realizado (detalhado)</p>
              <p className="text-xs text-slate-600">Modelo mensal (1 mes por padrao), filtrado por carteira/gestor, com linhas por prestacao liquidada.</p>
            </div>
            <Button onClick={openNewPaymentModal}>Novo pagamento</Button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Recibos de pagamento</p>
                <p className="text-xs text-slate-600">Somente 3 filtros: Cliente, Tipo (Pagamento/Recibo ou Credito/Contrato) e Selecao.</p>
              </div>
              {receiptPrintMode === "payment" && selectedReceiptPayment && (
                <div className="text-xs text-slate-600 md:text-right">
                  <div className="font-medium text-slate-800">
                    Recibo {selectedReceiptPayment.receiptNo || selectedReceiptPayment.id}
                  </div>
                  <div>
                    {formatDateOnly(selectedReceiptPayment.paymentDate)} | {formatCurrency(Number(selectedReceiptPayment.amountReceived || 0))}
                  </div>
                </div>
              )}
              {receiptPrintMode === "credit" && selectedReceiptCredit && (
                <div className="text-xs text-slate-600 md:text-right">
                  <div className="font-medium text-slate-800">{selectedReceiptCredit.contractNo}</div>
                  <div>{selectedReceiptCredit.rowsCount} linhas | {formatCurrency(Number(selectedReceiptCredit.totalPaid || 0))}</div>
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-12 gap-3">
              <div className="space-y-1 xl:col-span-4">
                <Label>Cliente</Label>
                <select
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full"
                  value={receiptClientId}
                  onChange={(e) => {
                    setReceiptClientId(e.target.value);
                    setReceiptLoanId("");
                    setReceiptPaymentId("");
                  }}
                >
                  <option value="">Selecionar cliente...</option>
                  {receiptClientOptions.map((item) => (
                    <option key={`receipt-client-${item.clientId}`} value={item.clientId}>
                      {item.clientName} ({item.paymentsCount})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 xl:col-span-3">
                <Label>Tipo</Label>
                <select
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full"
                  value={receiptPrintMode}
                  onChange={(e) => {
                    const mode = e.target.value as "payment" | "credit";
                    setReceiptPrintMode(mode);
                    if (mode === "payment") setReceiptLoanId("");
                    if (mode === "credit") setReceiptPaymentId("");
                  }}
                >
                  <option value="payment">Pagamento / Recibo</option>
                  <option value="credit">Credito / Contrato</option>
                </select>
              </div>
              <div className="space-y-1 xl:col-span-3">
                <Label>Selecao</Label>
                {receiptPrintMode === "payment" ? (
                  <select
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full"
                    value={receiptPaymentId}
                    onChange={(e) => setReceiptPaymentId(e.target.value)}
                    disabled={!receiptClientId}
                  >
                    <option value="">{receiptClientId ? "Selecionar pagamento/recibo..." : "Escolha primeiro o cliente"}</option>
                    {receiptPaymentOptions.map((item) => (
                      <option key={`receipt-payment-${item.id}`} value={item.id}>
                        {(item.receiptNo || `#${item.id}`)} | {formatDateOnly(item.paymentDate)} | {formatCurrency(Number(item.amountReceived || 0))}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full"
                    value={receiptLoanId}
                    onChange={(e) => setReceiptLoanId(e.target.value)}
                    disabled={!receiptClientId}
                  >
                    <option value="">{receiptClientId ? "Selecionar credito/contrato..." : "Escolha primeiro o cliente"}</option>
                    {receiptCreditOptions.map((item) => (
                      <option key={`receipt-credit-${item.loanId}`} value={item.loanId}>
                        {item.contractNo} | {item.managerName} | {formatCurrency(Number(item.totalPaid || 0))}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="xl:col-span-2 flex items-end">
                <Button
                  type="button"
                  className="w-full gap-2"
                  disabled={receiptPrintMode === "payment" ? !selectedReceiptPayment : !selectedReceiptCredit}
                  onClick={() => {
                    if (receiptPrintMode === "payment") {
                      if (!selectedReceiptPayment) return;
                      void handlePrintReceipt(selectedReceiptPayment.id);
                      return;
                    }
                    void handlePrintCreditReceipt();
                  }}
                >
                  <FileText className="w-4 h-4" />
                  Imprimir / Salvar
                </Button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-600">
              {receiptPrintMode === "credit"
                ? "Recibo do credito usa o contrato selecionado no filtro atual."
                : "Recibo por pagamento usa o pagamento/recibo selecionado."}
            </p>
          </div>
          <div className="rounded-lg border border-slate-300 overflow-hidden bg-[#d9d9d9]">
            <div className="bg-[#5e5e5e] text-white text-center text-base py-2 tracking-wide">
              REEMBOLSO REALIZADO * Detalhado
            </div>
            <div className="px-3 py-2 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="font-medium">{reimbursementReportDateLabel}</div>
              <div className="text-slate-700">
                {formatTimeOnlyPT(new Date())} {formatDateOnly(new Date().toISOString().slice(0, 10))} {(currentUser?.fullName || "Sistema").toUpperCase()}
              </div>
            </div>
            <div className="px-3 pb-3">
              <div className="overflow-x-auto rounded border border-slate-700 bg-white">
                <table className="w-full border-collapse text-[10px] min-w-[1500px]">
                  <thead>
                    <tr className="bg-[#6a6a6a] text-white">
                      <th className="border border-slate-700 px-2 py-1 text-left">Cliente</th>
                      <th className="border border-slate-700 px-2 py-1 text-left">Gestor</th>
                      <th className="border border-slate-700 px-2 py-1 text-center">Nº</th>
                      <th className="border border-slate-700 px-2 py-1 text-center">Vencimento</th>
                      <th className="border border-slate-700 px-2 py-1 text-center">Pagamento</th>
                      <th className="border border-slate-700 px-2 py-1 text-center">DiasAtraso</th>
                      <th className="border border-slate-700 px-2 py-1 text-right">Mora</th>
                      <th className="border border-slate-700 px-2 py-1 text-right">Custos</th>
                      <th className="border border-slate-700 px-2 py-1 text-right">Juro</th>
                      <th className="border border-slate-700 px-2 py-1 text-right">Capital</th>
                      <th className="border border-slate-700 px-2 py-1 text-right">Total</th>
                      <th className="border border-slate-700 px-2 py-1 text-left">Conta Destino</th>
                      <th className="border border-slate-700 px-2 py-1 text-right">Nº Recibo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reimbursementDetailedRows.map((item) => (
                      <tr key={`reemb-det-${item.allocationId}`} className="bg-white">
                        <td className="border border-slate-700 px-2 py-1 uppercase">{item.clientName}</td>
                        <td className="border border-slate-700 px-2 py-1 uppercase">{item.managerName || "Sem Gestor"}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{reimbursementInstallmentLabel(item)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{formatDateOnly(item.dueDate)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{formatDateOnly(item.paymentDate)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(item.daysLate || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right text-rose-700">{formatCurrency(Number(item.moraAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(item.costAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(item.interestAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(item.principalAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right font-semibold">{formatCurrency(Number(item.totalAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1">{reimbursementDestinationLabel(item)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{item.receiptNo || "-"}</td>
                      </tr>
                    ))}
                    {reimbursementDetailedRows.length === 0 && (
                      <tr>
                        <td colSpan={13} className="border border-slate-700 px-2 py-6 text-center text-slate-500">
                          {loading ? "A carregar..." : "Sem reembolsos no periodo."}
                        </td>
                      </tr>
                    )}
                    {reimbursementDetailedRows.length > 0 && (
                      <tr className="bg-[#f7f7f7] text-red-700 font-semibold">
                        <td colSpan={5} className="border border-slate-700 px-2 py-1">
                          Prestacoes: {Number(reimbursementDetailedSummary.totalRows || 0)}
                        </td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(reimbursementDetailedSummary.daysLate || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(reimbursementDetailedSummary.mora || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(reimbursementDetailedSummary.costs || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(reimbursementDetailedSummary.interest || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(reimbursementDetailedSummary.principal || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(reimbursementDetailedSummary.total || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1" />
                        <td className="border border-slate-700 px-2 py-1" />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="previstos" className="space-y-4">
          <div className="rounded-lg border border-slate-300 overflow-hidden bg-[#d9d9d9]">
            <div className="bg-[#5e5e5e] text-white text-center text-lg py-2 tracking-wide">
              REEMBOLSO PREVISTO * Detalhado
            </div>
            <div className="px-3 py-2 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="font-medium">
                {(manager === "all" ? "TODAS AS CARTEIRAS" : manager)} {forecastReferenceLabel(fromDate, toDate)}
              </div>
              <div className="text-slate-700">
                Impressao: {formatDateTimePT(new Date())}
              </div>
            </div>
            <div className="px-3 pb-3">
              <div className="text-center text-sm font-semibold underline mb-2">GERAL</div>
              <div className="overflow-x-auto rounded border border-slate-700 bg-white">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#6a6a6a] text-white">
                      <th className="border border-slate-700 px-2 py-1 text-left">Vencimento</th>
                      <th className="border border-slate-700 px-2 py-1 text-left">Cliente</th>
                      <th className="border border-slate-700 px-2 py-1 text-left">Profissao</th>
                      <th className="border border-slate-700 px-2 py-1 text-left">Contato</th>
                      <th className="border border-slate-700 px-2 py-1 text-left">Gestor - Linha</th>
                      <th className="border border-slate-700 px-2 py-1 text-center">Prestacao No</th>
                      <th className="border border-slate-700 px-2 py-1 text-right">Prestacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastVisibleItems.map((item) => (
                      <tr key={`prev-${item.installmentId}`} className="bg-white">
                        <td className="border border-slate-700 px-2 py-1">{formatDateOnly(item.dueDate)}</td>
                        <td className="border border-slate-700 px-2 py-1 uppercase">{item.clientName}</td>
                        <td className="border border-slate-700 px-2 py-1 uppercase">{forecastProfessionLabel(item)}</td>
                        <td className="border border-slate-700 px-2 py-1">{forecastContactLabel(item)}</td>
                        <td className="border border-slate-700 px-2 py-1 uppercase">{forecastPortfolioLabel(item)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{forecastInstallmentNumberLabel(item)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(forecastVigenteAmount(item))}</td>
                      </tr>
                    ))}
                    {forecastVisibleItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="border border-slate-700 px-2 py-6 text-center text-slate-500">
                          {loading ? "A carregar..." : "Sem previstos no filtro."}
                        </td>
                      </tr>
                    )}
                    {forecastVisibleItems.length > 0 && (
                      <tr className="bg-[#f3f3f3]">
                        <td colSpan={5} className="border border-slate-700 px-2 py-1 text-center font-semibold text-red-700">
                          Total: {forecastVisibleSummary.totalCount}
                        </td>
                        <td className="border border-slate-700 px-2 py-1 text-center font-semibold text-red-700">{forecastVisibleSummary.totalCount}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right font-semibold text-red-700">{formatCurrency(forecastVisibleSummary.totalValue)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-700 mt-2">
                Previsto nao inclui mora. Lista creditos a pagar da data de referencia em diante (ou no intervalo informado).
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="desempenho" className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full">
                <div className="space-y-1">
                  <Label>Mes de referencia</Label>
                  <Input
                    type="month"
                    value={performanceMonth}
                    max={performanceMaxMonth}
                    onChange={(e) => {
                      const nextValue = clampYearMonthToMax(e.target.value || formatYearMonthValue(), performanceMaxMonth);
                      setPerformanceMonth(nextValue);
                    }}
                  />
                  <p className="text-[11px] text-slate-500">Disponivel ate {monthLabelPt(performanceMaxMonth)}. Meses futuros ficam bloqueados.</p>
                </div>
                <div className="space-y-1">
                  <Label>Periodo do desempenho</Label>
                  <div className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm flex items-center">
                    {performanceReferenceRangeLabel}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Estado do mes</Label>
                  <div className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm flex items-center gap-2">
                    <Badge className={performance?.status === "closed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                      {performance?.status === "closed" ? "Fechado" : "Aberto"}
                    </Badge>
                    <Badge variant="outline">
                      {performance?.source === "closed" ? "Dados fechados" : "Dados em aberto"}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Fecho</Label>
                  <div className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs flex items-center">
                    {performance?.closure
                      ? `${formatDateOnly(performance.closure.closedAt)} - ${performance.closure.closedByName || "Sistema"}`
                      : "Mes ainda aberto"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {currentUser?.role === "admin" && (
                  <Button
                    variant="outline"
                    onClick={handleReopenPerformanceMonth}
                    disabled={reopeningPerformanceMonth || !performance?.closure}
                  >
                    {reopeningPerformanceMonth ? "A reabrir..." : "Reabrir mes"}
                  </Button>
                )}
                {currentUser?.role === "admin" && (
                  <Button
                    onClick={handleClosePerformanceMonth}
                    disabled={closingPerformanceMonth || performance?.status === "closed"}
                  >
                    {closingPerformanceMonth ? "A fechar..." : "Fechar mes"}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Ao fechar o mes, o sistema guarda o snapshot do desempenho e avanca para o proximo mes aberto. O contador de clientes novos e calculado para gestores e agentes (carteiras).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-600">Saude da carteira</p>
                <Badge className={performanceHealth.toneClass}>{performanceHealth.label}</Badge>
              </div>
              <p className="text-xs text-slate-500 mt-2">{performanceHealth.note}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-slate-600">Risco de mora (carteira)</p>
              <p className="text-xl font-bold">{formatPercentValue(Number(performanceHealth.risk || 0))}</p>
              <p className="text-[11px] text-slate-500 mt-1">Capital em mora / capital vigente</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-slate-600">Capital vigente</p>
              <p className="text-xl font-bold">{formatCurrencyMT(Number(performanceHealth.vigente || 0))}</p>
              <p className="text-[11px] text-slate-500 mt-1">Base principal para avaliar saude da carteira</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs text-slate-600">Reembolso do mes (cap+juro)</p>
              <p className="text-xl font-bold">{formatCurrencyMT(Number(performanceHealth.reimbursementMonth || 0))}</p>
              <p className="text-[11px] text-slate-500 mt-1">Capacidade de recuperacao no periodo</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-300 overflow-hidden bg-[#d9d9d9]">
            <div className="bg-[#5e5e5e] text-white text-center text-base py-2 tracking-wide">
              {performanceTitleLabel}
            </div>
            <div className="px-3 py-2 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="font-medium">
                {(manager === "all" ? "CARTEIRA GERAL" : manager)} {performanceReferenceRangeLabel}
              </div>
              <div className="text-slate-700">
                {formatTimeOnlyPT(new Date())} {formatDateOnly(new Date().toISOString().slice(0, 10))} {(currentUser?.fullName || "Sistema").toUpperCase()}
              </div>
            </div>
            <div className="px-3 pb-3">
              <div className="overflow-x-auto rounded border border-slate-700 bg-white">
                <table className="w-full border-collapse text-[10px] min-w-[1380px]">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white text-left">
                        {manager === "all" ? "CARTEIRA GERAL" : "CARTEIRA"}
                      </th>
                      <th colSpan={3} className="border border-slate-700 px-2 py-1 bg-white text-slate-900 underline">DESEMBOLSO NO MES</th>
                      <th colSpan={2} className="border border-slate-700 px-2 py-1 bg-white text-slate-900 underline">VIGENTE</th>
                      <th colSpan={2} className="border border-slate-700 px-2 py-1 bg-white text-slate-900 underline">REEMBOLSO</th>
                      <th colSpan={2} className="border border-slate-700 px-2 py-1 bg-white text-slate-900 underline">CARTEIRA EM MORA HOJE</th>
                      <th colSpan={3} className="border border-slate-700 px-2 py-1 bg-white text-slate-900 underline">CARTEIRA EM MORA TOTAL</th>
                      <th colSpan={6} className="border border-slate-700 px-2 py-1 bg-white text-slate-900 underline">CARTEIRA EM MORA EM DIAS</th>
                    </tr>
                    <tr className="bg-[#6a6a6a] text-white">
                      <th className="border border-slate-700 px-2 py-1">Montante</th>
                      <th className="border border-slate-700 px-2 py-1">#Nov</th>
                      <th className="border border-slate-700 px-2 py-1">#Rep</th>
                      <th className="border border-slate-700 px-2 py-1">#</th>
                      <th className="border border-slate-700 px-2 py-1">Capital</th>
                      <th className="border border-slate-700 px-2 py-1">Juro</th>
                      <th className="border border-slate-700 px-2 py-1">Capital</th>
                      <th className="border border-slate-700 px-2 py-1">#</th>
                      <th className="border border-slate-700 px-2 py-1">Capital</th>
                      <th className="border border-slate-700 px-2 py-1">#</th>
                      <th className="border border-slate-700 px-2 py-1">Capital (Risco)</th>
                      <th className="border border-slate-700 px-2 py-1">%</th>
                      <th className="border border-slate-700 px-2 py-1">&gt; 7 Dias</th>
                      <th className="border border-slate-700 px-2 py-1">#</th>
                      <th className="border border-slate-700 px-2 py-1">&gt; 15 Dias</th>
                      <th className="border border-slate-700 px-2 py-1">#</th>
                      <th className="border border-slate-700 px-2 py-1">&gt; 30 Dias</th>
                      <th className="border border-slate-700 px-2 py-1">#</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceRows.map((row) => (
                      <tr key={`${row.actorId ?? row.actorName}-${row.actorRole}`} className="bg-white">
                        <td className="border border-slate-700 px-2 py-1 font-semibold uppercase">
                          {performanceActorNameLabel(row)}
                          <span className="ml-1 text-[9px] font-normal normal-case text-slate-600">({performanceActorRoleLabel(row.actorRole)})</span>
                        </td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.disbursementAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.newClients || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.reimbursementCount || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.vigenteCount || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.vigenteCapital || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.reimbursementInterest || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.reimbursementPrincipal || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.moraTodayCount || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.moraTodayCapital || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.moraTotalCount || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.moraTotalCapital || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{formatPercentValue(Number(row.moraRiskPercent || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.moraOver7Capital || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.moraOver7Count || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.moraOver15Capital || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.moraOver15Count || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.moraOver30Capital || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.moraOver30Count || 0)}</td>
                      </tr>
                    ))}
                    {performanceRows.length === 0 && (
                      <tr>
                        <td colSpan={19} className="border border-slate-700 px-2 py-6 text-center text-slate-500">
                          {loading ? "A carregar..." : "Sem desempenho para o mes/filtro selecionado."}
                        </td>
                      </tr>
                    )}
                    {performanceTotals && (
                      <>
                        <tr className="bg-[#f7f7f7] text-red-700 font-semibold">
                          <td className="border border-slate-700 px-2 py-1 text-center">TOTAL</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.disbursementAmount || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.newClients || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.reimbursementCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.vigenteCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.vigenteCapital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.reimbursementInterest || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.reimbursementPrincipal || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraTodayCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraTodayCapital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraTotalCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraTotalCapital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{formatPercentValue(Number(performanceTotals.moraRiskPercent || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraOver7Capital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraOver7Count || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraOver15Capital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraOver15Count || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraOver30Capital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraOver30Count || 0)}</td>
                        </tr>
                        <tr className="bg-white text-blue-700 font-semibold">
                          <td className="border border-slate-700 px-2 py-1 text-center">GLOBAL</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.disbursementAmount || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.newClients || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.reimbursementCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.vigenteCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.vigenteCapital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.reimbursementInterest || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.reimbursementPrincipal || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraTodayCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraTodayCapital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraTotalCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraTotalCapital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{formatPercentValue(Number(performanceTotals.moraRiskPercent || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraOver7Capital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraOver7Count || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraOver15Capital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraOver15Count || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(performanceTotals.moraOver30Capital || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(performanceTotals.moraOver30Count || 0)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="mora" className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-md border bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Clientes em mora</p>
                <p className="text-xl font-bold">{Number(moraSummary.clientCount || 0)}</p>
              </div>
              <div className="rounded-md border bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Creditos em mora</p>
                <p className="text-xl font-bold">{Number(moraSummary.creditCount || 0)}</p>
              </div>
              <div className="rounded-md border bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Capital em risco</p>
                <p className="text-xl font-bold">{formatCurrencyMT(Number(moraSummary.capitalRiskAmount || 0))}</p>
              </div>
              <div className="rounded-md border bg-slate-50 p-3">
                <p className="text-xs text-slate-600">Total em atraso</p>
                <p className="text-xl font-bold text-rose-700">{formatCurrencyMT(Number(moraSummary.totalOverdueAmount || 0))}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-3">
              Filtro de data na Mora: por padrao mostra todos os creditos em mora ate hoje. Use apenas <strong>Data ate</strong> para listar ate uma data. Use a mesma data em <strong>Data de</strong> e <strong>Data ate</strong> para listar somente esse dia (por data de vencimento). A mora comeca no <strong>dia seguinte ao vencimento</strong> da prestacao. O calculo e <strong>2% ao dia</strong> sobre a prestacao em atraso, multiplicado pelos dias efetivos em mora. O relatorio/PDF desta aba sai em <strong>A4 horizontal</strong> por padrao.
            </p>
          </div>

          <div className="rounded-lg border border-slate-300 overflow-hidden bg-[#d9d9d9]">
            <div className="bg-[#5e5e5e] text-white text-center text-base py-2 tracking-wide">
              CARTEIRA EM MORA
            </div>
            <div className="px-3 py-2 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="font-medium">
                {(manager === "all" ? "TODAS AS CARTEIRAS" : manager)} {moraHeaderRangeLabel}
              </div>
              <div className="text-slate-700">
                {formatTimeOnlyPT(new Date())} {formatDateOnly(new Date().toISOString().slice(0, 10))} {(currentUser?.fullName || "Sistema").toUpperCase()}
              </div>
            </div>
            <div className="px-3 pb-2">
              <div className="border border-slate-700 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800">
                {moraCalculationInfo}
              </div>
            </div>
            <div className="px-3 pb-3 space-y-3">
              {moraPortfolioGroups.map((group) => (
                <div key={`mora-group-${group.managerName}`} className="border border-slate-700 bg-white">
                  <div className="px-2 py-1 text-[11px] text-red-700 border-b border-slate-700">
                    CARTEIRA - {String(group.managerName || "Sem Gestor").toUpperCase()}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[10px] min-w-[1200px]">
                      <thead>
                        <tr>
                          <th className="border border-slate-700 px-2 py-1 text-left bg-white text-slate-900" />
                          <th colSpan={2} className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Desembolso</th>
                          <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Capital</th>
                          <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Prest</th>
                          <th colSpan={2} className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Dias Atraso</th>
                          <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Mora</th>
                          <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Capital</th>
                          <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Juro</th>
                          <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Total</th>
                        </tr>
                        <tr className="bg-[#6a6a6a] text-white">
                          <th className="border border-slate-700 px-2 py-1 text-left">Cliente</th>
                          <th className="border border-slate-700 px-2 py-1">Data</th>
                          <th className="border border-slate-700 px-2 py-1">Montante</th>
                          <th className="border border-slate-700 px-2 py-1">Risco</th>
                          <th className="border border-slate-700 px-2 py-1">Atraso</th>
                          <th className="border border-slate-700 px-2 py-1">Total</th>
                          <th className="border border-slate-700 px-2 py-1">Vigente</th>
                          <th className="border border-slate-700 px-2 py-1">Montante</th>
                          <th className="border border-slate-700 px-2 py-1">Atraso</th>
                          <th className="border border-slate-700 px-2 py-1">Atraso</th>
                          <th className="border border-slate-700 px-2 py-1">Atraso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(group.rows || []).map((row) => (
                          <tr key={`mora-credit-${row.loanId}`}>
                            <td className="border border-slate-700 px-2 py-1 align-top">
                              <div className="uppercase">{moraClientLineLabel(row)}</div>
                            </td>
                            <td className="border border-slate-700 px-2 py-1 text-center">{formatDateOnly(row.disbursedOn || "")}</td>
                            <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.disbursedAmount || 0))}</td>
                            <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.capitalRiskAmount || 0))}</td>
                            <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.overdueInstallments || 0)}</td>
                            <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.daysLateTotal || 0)}</td>
                            <td className="border border-slate-700 px-2 py-1 text-center">{Number(row.daysLateVigente || 0)}</td>
                            <td className="border border-slate-700 px-2 py-1 text-right text-rose-700">{formatCurrency(Number(row.moraAmount || 0))}</td>
                            <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.principalOverdueAmount || 0))}</td>
                            <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(row.interestOverdueAmount || 0))}</td>
                            <td className="border border-slate-700 px-2 py-1 text-right font-semibold">{formatCurrency(Number(row.totalOverdueAmount || 0))}</td>
                          </tr>
                        ))}
                        {(group.rows || []).length === 0 && (
                          <tr>
                            <td colSpan={11} className="border border-slate-700 px-2 py-6 text-center text-slate-500">
                              Sem creditos em mora nesta carteira.
                            </td>
                          </tr>
                        )}
                        <tr className="bg-[#f8f8f8] text-red-700 font-semibold">
                          <td className="border border-slate-700 px-2 py-1 text-center">Clientes: {Number(group.clientCount || 0)} - Creditos: {Number(group.creditCount || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1" />
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(group.disbursedAmount || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(group.capitalRiskAmount || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(group.overdueInstallments || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(group.daysLateTotal || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-center">{Number(group.daysLateVigenteTotal || 0)}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(group.moraAmount || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(group.principalOverdueAmount || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(group.interestOverdueAmount || 0))}</td>
                          <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(group.totalOverdueAmount || 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {moraPortfolioGroups.length === 0 && (
                <div className="rounded border border-slate-700 bg-white px-3 py-8 text-center text-sm text-slate-500">
                  {loading ? "A carregar..." : "Sem creditos em mora no filtro."}
                </div>
              )}

              <div className="border border-slate-700 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[10px] min-w-[1200px]">
                    <tbody>
                      <tr>
                        <td className="border border-slate-700 px-2 py-1 text-center text-red-700 font-semibold" style={{ width: "53%" }}>
                          Clientes: {Number(moraSummary.clientCount || 0)}
                        </td>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Desembolso</th>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Capital Em Risco</th>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Prest. Atraso</th>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">D.Total</th>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">D.Vigente</th>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Mora</th>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Capital Atraso</th>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Juro Atraso</th>
                        <th className="border border-slate-700 px-2 py-1 bg-[#6a6a6a] text-white">Total Atraso</th>
                      </tr>
                      <tr className="text-red-700 font-semibold">
                        <td className="border border-slate-700 px-2 py-1 text-center">Creditos: {Number(moraSummary.creditCount || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(moraSummary.disbursedAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(moraSummary.capitalRiskAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(moraSummary.overdueInstallments || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(moraSummary.daysLateTotal || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-center">{Number(moraSummary.daysLateVigenteTotal || 0)}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(moraSummary.moraAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(moraSummary.principalOverdueAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(moraSummary.interestOverdueAmount || 0))}</td>
                        <td className="border border-slate-700 px-2 py-1 text-right">{formatCurrency(Number(moraSummary.totalOverdueAmount || 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="outros" className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Outros movimentos financeiros</p>
              <p className="text-xs text-slate-600">{otherOperationDescription(otherOperation)}</p>
            </div>
            <Tabs value={otherOperation} onValueChange={(value) => setOtherOperation(value as OtherOperationType)}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">Tudo</TabsTrigger>
                <TabsTrigger value="perdao_mora">Perdao de Mora</TabsTrigger>
                <TabsTrigger value="capitalizacao">Capitalizacao</TabsTrigger>
                <TabsTrigger value="estorno">Estornos</TabsTrigger>
                <TabsTrigger value="abatimento">Abates</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border bg-slate-50 px-3 py-2">
                <p className="text-slate-500">Filtro ativo</p>
                <p className="font-semibold text-slate-900">{otherOperationLabel(otherOperation)}</p>
              </div>
              <div className="rounded-md border bg-slate-50 px-3 py-2">
                <p className="text-slate-500">Registros</p>
                <p className="font-semibold text-slate-900">{otherVisibleSummary.count}</p>
              </div>
              <div className="rounded-md border bg-slate-50 px-3 py-2">
                <p className="text-slate-500">{otherOperationTotalLabel(otherOperation)}</p>
                <p className="font-semibold text-slate-900">{formatCurrencyMT(otherVisibleSummary.total)}</p>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label>Tipo do movimento</Label>
                  {otherOperation === "all" ? (
                    <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={otherEventType} onChange={(e) => setOtherEventType(e.target.value as OtherEventType)}>
                      <option value="perdao_mora">Perdao de Mora</option>
                      <option value="capitalizacao">Capitalizacao</option>
                      <option value="estorno">Estorno</option>
                      <option value="abatimento">Abatimento</option>
                    </select>
                  ) : (
                    <Input value={otherOperationLabel(activeOtherEventType)} readOnly />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Data de pagamento</Label>
                  <Input type="date" value={otherDate} onChange={(e) => setOtherDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{otherOperationInputAmountLabel(activeOtherEventType)}</Label>
                  <Input
                    value={otherAmount}
                    inputMode="decimal"
                    onChange={(e) => setOtherAmount(normalizeCurrencyInputText(e.target.value))}
                    onBlur={(e) => setOtherAmount(commitCurrencyInputText(e.target.value))}
                    placeholder="Ex: 2,500.00"
                  />
                  {selectedOtherContract && activeOtherEventType === "perdao_mora" && (
                    <p className="text-[11px] text-slate-600">
                      {otherLoanSnapshot.loading
                        ? "A calcular mora total..."
                        : `Mora total do credito: ${formatCurrencyMT(otherLoanSnapshot.moraTotal)}`}
                    </p>
                  )}
                  {selectedOtherContract && (activeOtherEventType === "capitalizacao" || activeOtherEventType === "abatimento") && (
                    <p className="text-[11px] text-slate-600">
                      {activeOtherEventType === "capitalizacao"
                        ? (otherLoanSnapshot.loading
                          ? "A calcular total em mora..."
                          : `Total em mora (capital + juros + mora): ${formatCurrencyMT(otherLoanSnapshot.overdueTotal)}`)
                        : (otherLoanSnapshot.loading
                          ? "A calcular total do credito..."
                          : `Total do credito (capital + juros + mora): ${formatCurrencyMT(otherLoanSnapshot.creditTotal)}`)}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Fluxo</Label>
                  <Input value={isOtherEstorno ? "Estorno" : "Ajuste Financeiro"} readOnly />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Tipo cliente origem</Label>
                  <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={otherClientType} onChange={(e) => setOtherClientType(e.target.value as PaymentClientType)}>
                    <option value="singular">Pessoal</option>
                    <option value="grupo">Grupo</option>
                    <option value="empresa">Empresa</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{otherClientType === "singular" ? "Cliente origem" : otherClientType === "grupo" ? "Grupo origem" : "Empresa origem"}</Label>
                  <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={otherClientId} onChange={(e) => setOtherClientId(e.target.value)}>
                    <option value="">Selecione</option>
                    {otherClientOptions.map((client) => (
                      <option key={`other-source-${client.id}`} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Contrato origem</Label>
                  <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={otherLoanId} onChange={(e) => setOtherLoanId(e.target.value)} disabled={!otherClientId}>
                    <option value="">{otherClientId ? "Selecione contrato" : "Selecione o cliente origem"}</option>
                    {otherContracts.map((ct) => (
                      <option key={`other-source-contract-${ct.id}`} value={ct.id} disabled={!isOtherSourceContractSelectable(ct, activeOtherEventType)}>
                        {ct.contractNo} | Saldo {formatCurrencyMT(ct.balance)}
                        {isOtherEstorno && ct.isReversible ? ` | Estornavel ${formatCurrencyMT(Number(ct.reversibleAmount || 0))}` : ""}
                        {isOtherSourceContractSelectable(ct, activeOtherEventType)
                          ? (isOtherEstorno && ct.isReversible && !ct.isPayable ? " | ESTORNAVEL" : "")
                          : ct.isLiquidated
                            ? " | LIQUIDADO"
                            : ct.disbursementStatus !== "disbursed"
                              ? " | BLOQUEADO"
                              : " | BLOQUEADO"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isOtherEstorno && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Modo do estorno</Label>
                      <select className="h-10 rounded-md border border-amber-300 px-3 text-sm w-full" value={otherEstornoMode} onChange={(e) => setOtherEstornoMode(e.target.value as OtherEstornoMode)}>
                        <option value="estorno_only">Somente estornar (pagar depois)</option>
                        <option value="estorno_and_pay">Estornar e pagar outro cliente agora</option>
                      </select>
                    </div>
                    <div className="text-xs text-amber-800 rounded-md border border-amber-200 bg-white px-3 py-2">
                      {otherEstornoMode === "estorno_only"
                        ? "O valor sera apenas estornado no contrato de origem. Pode ser utilizado depois em outro pagamento."
                        : "O valor estornado sera aplicado imediatamente em pagamento para outro cliente (ou automatico por cliente destino)."}
                    </div>
                  </div>

                  {otherEstornoMode === "estorno_and_pay" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Tipo cliente destino</Label>
                        <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={otherDestinationClientType} onChange={(e) => setOtherDestinationClientType(e.target.value as PaymentClientType)}>
                          <option value="singular">Pessoal</option>
                          <option value="grupo">Grupo</option>
                          <option value="empresa">Empresa</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>{otherDestinationClientType === "singular" ? "Cliente destino" : otherDestinationClientType === "grupo" ? "Grupo destino" : "Empresa destino"}</Label>
                        <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={otherDestinationClientId} onChange={(e) => setOtherDestinationClientId(e.target.value)}>
                          <option value="">Selecione</option>
                          {otherDestinationClientOptions.map((client) => (
                            <option key={`other-destination-${client.id}`} value={client.id}>{client.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Contrato destino (opcional)</Label>
                        <select className="h-10 rounded-md border border-slate-300 px-3 text-sm w-full" value={otherDestinationLoanId} onChange={(e) => setOtherDestinationLoanId(e.target.value)} disabled={!otherDestinationClientId}>
                          <option value="">{otherDestinationClientId ? "Automatico por cliente" : "Selecione o cliente destino"}</option>
                          {otherDestinationContracts.map((ct) => (
                            <option key={`other-destination-contract-${ct.id}`} value={ct.id} disabled={!ct.isPayable}>
                              {ct.contractNo} | Saldo {formatCurrencyMT(ct.balance)}
                              {ct.isPayable ? "" : ct.isLiquidated ? " | LIQUIDADO" : ct.disbursementStatus !== "disbursed" ? " | BLOQUEADO" : " | BLOQUEADO"}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Label>Observacao</Label>
                <Input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} placeholder="Observacao opcional do movimento" />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleApplyOtherOperation} disabled={savingOtherOperation}>
                  {savingOtherOperation ? "A aplicar..." : otherOperationSubmitLabel(activeOtherEventType)}
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cliente Destino</TableHead>
                  <TableHead>Contrato Destino</TableHead>
                  <TableHead>Gestor</TableHead>
                  <TableHead>{otherOperationAmountLabel(otherOperation)}</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>{otherOperation === "all" ? "Observacao" : `Observacao (${otherOperationLabel(otherOperation)})`}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherVisibleItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDateOnly(item.eventDate || item.createdAt)}</TableCell>
                    <TableCell>{item.eventTypeLabel || otherOperationLabel(item.eventType || "")}</TableCell>
                    <TableCell>{item.contractNo}</TableCell>
                    <TableCell>{item.clientName}</TableCell>
                    <TableCell>{item.transferTargetClientName || "-"}</TableCell>
                    <TableCell>{item.transferTargetContractNo || "-"}</TableCell>
                    <TableCell>{item.managerName}</TableCell>
                    <TableCell className="font-semibold text-amber-700">{formatCurrencyMT(item.amount)}</TableCell>
                    <TableCell>{item.workflowStatus || "-"}</TableCell>
                    <TableCell>{item.createdByName}</TableCell>
                    <TableCell>{item.note || "-"}</TableCell>
                  </TableRow>
                ))}
                {otherVisibleItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-slate-500 py-6">
                      {loading ? "A carregar..." : `Sem movimentos de ${otherOperationLabel(otherOperation).toLowerCase()} no filtro.`}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


