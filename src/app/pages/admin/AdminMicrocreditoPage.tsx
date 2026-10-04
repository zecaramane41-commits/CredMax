import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  Filter,
  Printer,
  RefreshCw,
  Search,
  XCircle,
  Calendar,
  Receipt,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
  TrendingUp,
  Shield,
  Ban,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/api";
import { getUser, setActiveCompanyId } from "../../lib/auth";
import { useNavigate } from "react-router";

// ─── Types ───────────────────────────────────────────────────────────────────

type CompanyWithSubscription = {
  id: number;
  name: string;
  nuit: string;
  subscriptionStatus: "active" | "grace" | "expired" | "inactive";
  subscriptionExpiresAt: string | null;
  subscriptionGraceDays: number;
  lastPaymentAt: string | null;
  totalPaid: number;
  isActive: boolean;
  usersCount: number;
  clientsCount: number;
  loansCount: number;
  daysRemaining: number;
  daysInGrace: number;
};

type Payment = {
  id: number;
  companyId: number;
  companyName: string;
  companyNuit: string;
  paymentType: string;
  amount: number;
  amountFormatted: string;
  paymentDate: string;
  validFrom: string;
  validUntil: string;
  daysPurchased: number;
  paymentMethod: string;
  referenceNo: string;
  notes: string;
  status: string;
  receiptNo: string;
  receiptIssuedAt: string;
  receiptIssuedByName: string;
  createdByName: string;
  createdAt: string;
};

type PaymentStats = {
  payments: {
    total: number;
    totalAmount: number;
    totalAmountFormatted: string;
    companiesWithPayments: number;
    active: number;
    expired: number;
  };
  companies: {
    total: number;
    active: number;
    grace: number;
    expired: number;
    inactive: number;
  };
  expiringSoon: Array<{
    id: number;
    name: string;
    expiresAt: string;
    graceDays: number;
    totalPaid: number;
  }>;
};

type Statement = {
  company: {
    id: number;
    name: string;
    legalName: string;
    nuit: string;
    address: string;
    email: string;
    phone: string;
  } | null;
  dateFrom: string | null;
  dateTo: string | null;
  payments: Payment[];
  summary: {
    totalPayments: number;
    totalPaid: number;
    totalDays: number;
    totalPaidFormatted: string;
  };
  generatedAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const raw = String(dateStr).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function formatPtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-MZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number): string {
  return `${Number(value || 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
}

function subscriptionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: "Ativa",
    grace: "Carencia",
    expired: "Expirada",
    inactive: "Inativa",
  };
  return map[status] || status;
}

function subscriptionStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 border-emerald-300",
    grace: "bg-amber-100 text-amber-800 border-amber-300",
    expired: "bg-red-100 text-red-800 border-red-300",
    inactive: "bg-slate-100 text-slate-600 border-slate-300",
  };
  return map[status] || "bg-slate-100 text-slate-600";
}

function subscriptionStatusIcon(status: string) {
  switch (status) {
    case "active":
      return <CheckCircle className="w-4 h-4 text-emerald-600" />;
    case "grace":
      return <Clock className="w-4 h-4 text-amber-600" />;
    case "expired":
      return <XCircle className="w-4 h-4 text-red-600" />;
    default:
      return <Ban className="w-4 h-4 text-slate-500" />;
  }
}

const PAYMENT_TYPE_OPTIONS = [
  { value: "daily", label: "Diario", days: 1 },
  { value: "weekly", label: "Semanal", days: 7 },
  { value: "monthly", label: "Mensal", days: 30 },
  { value: "quarterly", label: "Trimestral", days: 90 },
  { value: "annual", label: "Anual", days: 365 },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Dinheiro" },
  { value: "transfer", label: "Transferencia" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "emola", label: "e-Mola" },
  { value: "other", label: "Outro" },
];

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminMicrocreditoPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);

  // State
  const [companies, setCompanies] = useState<CompanyWithSubscription[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Payment dialog
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithSubscription | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    paymentType: "monthly",
    amount: "",
    daysPurchased: "30",
    paymentMethod: "cash",
    referenceNo: "",
    notes: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // Payment history dialog
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyCompany, setHistoryCompany] = useState<CompanyWithSubscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Statement dialog
  const [showStatementDialog, setShowStatementDialog] = useState(false);
  const [statementData, setStatementData] = useState<Statement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementDateFrom, setStatementDateFrom] = useState("");
  const [statementDateTo, setStatementDateTo] = useState("");
  const [statementCompanyId, setStatementCompanyId] = useState<number | null>(null);

  // Grant days dialog
  const [showGrantDaysDialog, setShowGrantDaysDialog] = useState(false);
  const [grantDaysCompany, setGrantDaysCompany] = useState<CompanyWithSubscription | null>(null);
  const [grantDaysValue, setGrantDaysValue] = useState("30");
  const [grantDaysNotes, setGrantDaysNotes] = useState("");
  const [savingGrantDays, setSavingGrantDays] = useState(false);
  const [grantDaysError, setGrantDaysError] = useState("");

  // Expanded company row
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<{ companies: CompanyWithSubscription[] }>("/admin/payments/companies");
      setCompanies(data.companies || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar empresas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch<PaymentStats>("/admin/payments/stats");
      setStats(data);
    } catch {
      // Stats are optional
    }
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) {
      navigate("/", { replace: true });
      return;
    }
    void loadCompanies();
    void loadStats();
  }, [isCentralAdmin, loadCompanies, loadStats, navigate]);

  // ─── Computed ────────────────────────────────────────────────────────────

  const filteredCompanies = useMemo(() => {
    let result = companies;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.nuit && c.nuit.includes(term)),
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => c.subscriptionStatus === statusFilter);
    }
    return result;
  }, [companies, searchTerm, statusFilter]);

  // ─── Payment Form Logic ──────────────────────────────────────────────────

  useEffect(() => {
    const pt = PAYMENT_TYPE_OPTIONS.find((o) => o.value === paymentForm.paymentType);
    if (pt) {
      setPaymentForm((s) => ({ ...s, daysPurchased: String(pt.days) }));
    }
  }, [paymentForm.paymentType]);

  const openPaymentDialog = (company: CompanyWithSubscription) => {
    setSelectedCompany(company);
    setPaymentForm({
      paymentType: "monthly",
      amount: "",
      daysPurchased: "30",
      paymentMethod: "cash",
      referenceNo: "",
      notes: "",
    });
    setPaymentError("");
    setShowPaymentDialog(true);
  };

  /** Quick renew: opens payment dialog pre-filled with monthly / 30 days / renewal note */
  const openRenewDialog = (company: CompanyWithSubscription) => {
    setSelectedCompany(company);
    setPaymentForm({
      paymentType: "monthly",
      amount: "",
      daysPurchased: "30",
      paymentMethod: "cash",
      referenceNo: "",
      notes: "Renovacao rapida de assinatura",
    });
    setPaymentError("");
    setShowPaymentDialog(true);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      setSavingPayment(true);
      setPaymentError("");
      setMessage("");
      await apiFetch(`/admin/payments/companies/${selectedCompany.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          paymentType: paymentForm.paymentType,
          amount: Number(paymentForm.amount),
          daysPurchased: Number(paymentForm.daysPurchased),
          paymentMethod: paymentForm.paymentMethod,
          referenceNo: paymentForm.referenceNo,
          notes: paymentForm.notes,
        }),
      });
      setMessage(`Pagamento registado com sucesso para ${selectedCompany.name}.`);
      setShowPaymentDialog(false);
      await loadCompanies();
      await loadStats();
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Falha ao registar pagamento.");
    } finally {
      setSavingPayment(false);
    }
  };

  // ─── Grant Days ──────────────────────────────────────────────────────────

  const openGrantDaysDialog = (company: CompanyWithSubscription) => {
    setGrantDaysCompany(company);
    setGrantDaysValue("30");
    setGrantDaysNotes("");
    setGrantDaysError("");
    setShowGrantDaysDialog(true);
  };

  const submitGrantDays = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantDaysCompany) return;
    try {
      setSavingGrantDays(true);
      setGrantDaysError("");
      setMessage("");
      const result = await apiFetch<{ message: string; validUntil: string; daysGranted: number }>(
        `/admin/payments/companies/${grantDaysCompany.id}/grant-days`,
        {
          method: "POST",
          body: JSON.stringify({ days: Number(grantDaysValue), notes: grantDaysNotes }),
        },
      );
      setMessage(result.message || `${grantDaysValue} dia(s) concedidos a ${grantDaysCompany.name}.`);
      setShowGrantDaysDialog(false);
      await loadCompanies();
      await loadStats();
    } catch (e) {
      setGrantDaysError(e instanceof Error ? e.message : "Falha ao conceder dias.");
    } finally {
      setSavingGrantDays(false);
    }
  };

  // ─── Payment History ─────────────────────────────────────────────────────

  const openHistoryDialog = async (company: CompanyWithSubscription) => {
    setHistoryCompany(company);
    setPayments([]);
    setShowHistoryDialog(true);
    try {
      setHistoryLoading(true);
      const data = await apiFetch<{ payments: Payment[] }>(`/admin/payments/companies/${company.id}/payments`);
      setPayments(data.payments || []);
    } catch {
      // handled
    } finally {
      setHistoryLoading(false);
    }
  };

  // ─── Statement ───────────────────────────────────────────────────────────

  const openStatementDialog = (companyId: number) => {
    setStatementCompanyId(companyId);
    setStatementData(null);
    setStatementDateFrom("");
    setStatementDateTo("");
    setShowStatementDialog(true);
  };

  const generateStatement = async () => {
    if (!statementCompanyId) return;
    try {
      setStatementLoading(true);
      const params = new URLSearchParams();
      if (statementDateFrom) params.set("dateFrom", statementDateFrom);
      if (statementDateTo) params.set("dateTo", statementDateTo);
      const qs = params.toString();
      const data = await apiFetch<Statement>(`/admin/payments/companies/${statementCompanyId}/statement${qs ? `?${qs}` : ""}`);
      setStatementData(data);
    } catch {
      // handled
    } finally {
      setStatementLoading(false);
    }
  };

  // ─── Print Receipt ───────────────────────────────────────────────────────

  const printReceipt = (payment: Payment) => {
    const receiptHtml = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Recibo ${payment.receiptNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 20px; }
    .receipt { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0f766e, #14b8a6); color: white; padding: 30px; text-align: center; }
    .header h1 { font-size: 22px; margin-bottom: 5px; }
    .header p { font-size: 12px; opacity: 0.9; }
    .body { padding: 30px; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed #e2e8f0; }
    .row:last-child { border-bottom: none; }
    .label { color: #64748b; font-size: 13px; }
    .value { font-weight: 600; color: #1e293b; font-size: 14px; }
    .amount { font-size: 24px; color: #0f766e; font-weight: 700; }
    .footer { background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 11px; color: #94a3b8; }
    .stamp { margin-top: 20px; padding: 15px; border: 2px solid #0f766e; border-radius: 8px; text-align: center; display: inline-block; }
    .stamp p { color: #0f766e; font-weight: 700; font-size: 14px; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1>RECIBO DE PAGAMENTO</h1>
      <p>SiGeM - Sistema de Gestao de Microcredito</p>
    </div>
    <div class="body">
      <div class="row"><span class="label">No. Recibo</span><span class="value">${payment.receiptNo}</span></div>
      <div class="row"><span class="label">Data de Emissao</span><span class="value">${formatPtDateTime(payment.receiptIssuedAt || payment.createdAt)}</span></div>
      <div class="row"><span class="label">Empresa</span><span class="value">${payment.companyName}</span></div>
      <div class="row"><span class="label">NUIT</span><span class="value">${payment.companyNuit || "-"}</span></div>
      <div class="row"><span class="label">Tipo de Pagamento</span><span class="value">${PAYMENT_TYPE_OPTIONS.find((o) => o.value === payment.paymentType)?.label || payment.paymentType}</span></div>
      <div class="row"><span class="label">Metodo de Pagamento</span><span class="value">${PAYMENT_METHOD_OPTIONS.find((o) => o.value === payment.paymentMethod)?.label || payment.paymentMethod}</span></div>
      <div class="row"><span class="label">Valido de</span><span class="value">${formatPtDate(payment.validFrom)}</span></div>
      <div class="row"><span class="label">Valido ate</span><span class="value">${formatPtDate(payment.validUntil)}</span></div>
      <div class="row"><span class="label">Dias Contratados</span><span class="value">${payment.daysPurchased} dia(s)</span></div>
      <div class="row"><span class="label">Valor Pago</span><span class="value amount">${payment.amountFormatted}</span></div>
      ${payment.notes ? `<div class="row"><span class="label">Notas</span><span class="value">${payment.notes}</span></div>` : ""}
      ${payment.referenceNo ? `<div class="row"><span class="label">Referencia</span><span class="value">${payment.referenceNo}</span></div>` : ""}
    </div>
    <div class="footer">
      <div class="stamp"><p>PAGO</p></div>
      <p style="margin-top: 15px;">Documento gerado automaticamente pelo sistema SiGeM.</p>
      <p>Emitido por: ${payment.createdByName || "Administrador Central"}</p>
    </div>
  </div>
</body>
</html>`;
    const w = window.open("", "_blank", "width=700,height=900");
    if (w) {
      w.document.write(receiptHtml);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  // ─── Print Statement ─────────────────────────────────────────────────────

  const printStatement = () => {
    if (!statementData) return;
    const company = statementData.company;
    const rows = statementData.payments
      .map(
        (p) => `
        <tr>
          <td>${formatPtDate(p.paymentDate)}</td>
          <td>${p.receiptNo}</td>
          <td>${PAYMENT_TYPE_OPTIONS.find((o) => o.value === p.paymentType)?.label || p.paymentType}</td>
          <td>${PAYMENT_METHOD_OPTIONS.find((o) => o.value === p.paymentMethod)?.label || p.paymentMethod}</td>
          <td>${formatPtDate(p.validFrom)} - ${formatPtDate(p.validUntil)}</td>
          <td>${p.daysPurchased}</td>
          <td style="text-align:right;font-weight:600;color:#0f766e;">${p.amountFormatted}</td>
        </tr>`,
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Extrato - ${company?.name || ""}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; padding: 20px; }
    .doc { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0f766e, #14b8a6); color: white; padding: 30px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 20px; }
    .header .meta { text-align: right; font-size: 12px; opacity: 0.9; }
    .info { padding: 20px 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-bottom: 1px solid #e2e8f0; }
    .info .item { font-size: 13px; }
    .info .item .lbl { color: #64748b; }
    .info .item .val { font-weight: 600; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { background: #f8fafc; padding: 12px 10px; text-align: left; color: #475569; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
    tbody td { padding: 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tbody tr:hover { background: #f8fafc; }
    .summary { padding: 20px 30px; background: #f8fafc; display: flex; gap: 30px; border-top: 2px solid #e2e8f0; }
    .summary .item { text-align: center; }
    .summary .item .lbl { font-size: 12px; color: #64748b; }
    .summary .item .val { font-size: 20px; font-weight: 700; color: #0f766e; }
    .footer { padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 11px; color: #94a3b8; }
    @media print { body { background: white; padding: 0; } .doc { box-shadow: none; border-radius: 0; } }
  </style>
</head>
<body>
  <div class="doc">
    <div class="header">
      <div>
        <h1>EXTRATO DE PAGAMENTOS</h1>
        <p style="font-size:13px;opacity:0.9;">SiGeM - Sistema de Gestao de Microcredito</p>
      </div>
      <div class="meta">
        <p>Gerado em: ${formatPtDateTime(statementData.generatedAt)}</p>
        ${statementData.dateFrom ? `<p>Periodo: ${formatPtDate(statementData.dateFrom)} - ${formatPtDate(statementData.dateTo)}</p>` : "<p>Periodo: Todos</p>"}
      </div>
    </div>
    ${company ? `
    <div class="info">
      <div class="item"><span class="lbl">Empresa:</span> <span class="val">${company.name}</span></div>
      <div class="item"><span class="lbl">NUIT:</span> <span class="val">${company.nuit || "-"}</span></div>
      <div class="item"><span class="lbl">Endereco:</span> <span class="val">${company.address || "-"}</span></div>
      <div class="item"><span class="lbl">Contacto:</span> <span class="val">${company.phone || "-"} ${company.email ? `/ ${company.email}` : ""}</span></div>
    </div>` : ""}
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Recibo</th>
          <th>Tipo</th>
          <th>Metodo</th>
          <th>Periodo</th>
          <th>Dias</th>
          <th style="text-align:right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${rows || "<tr><td colspan='7' style='text-align:center;color:#94a3b8;'>Nenhum pagamento encontrado.</td></tr>"}
      </tbody>
    </table>
    <div class="summary">
      <div class="item"><div class="lbl">Total Pagamentos</div><div class="val">${statementData.summary.totalPayments}</div></div>
      <div class="item"><div class="lbl">Total Dias</div><div class="val">${statementData.summary.totalDays}</div></div>
      <div class="item"><div class="lbl">Total Pago</div><div class="val">${statementData.summary.totalPaidFormatted}</div></div>
    </div>
    <div class="footer">
      <p>Documento gerado automaticamente pelo sistema SiGeM. Extrato de pagamentos da empresa.</p>
    </div>
  </div>
</body>
</html>`;
    const w = window.open("", "_blank", "width=1000,height=800");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            Assinaturas
          </h1>
          <p className="text-slate-600 mt-1">Controle de pagamentos e acesso das empresas ao sistema.</p>
        </div>
        <Button
          onClick={() => { void loadCompanies(); void loadStats(); }}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </Button>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {message}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            icon={<Building2 className="w-6 h-6 text-teal-600" />}
            label="Total Empresas"
            value={stats.companies.total}
            color="bg-teal-50"
          />
          <StatCard
            icon={<CheckCircle className="w-6 h-6 text-emerald-600" />}
            label="Assinaturas Activas"
            value={stats.companies.active}
            sub={stats.companies.grace > 0 ? `${stats.companies.grace} em carencia` : undefined}
            color="bg-emerald-50"
          />
          <StatCard
            icon={<AlertTriangle className="w-6 h-6 text-amber-600" />}
            label="Em Carencia"
            value={stats.companies.grace}
            color="bg-amber-50"
          />
          <StatCard
            icon={<XCircle className="w-6 h-6 text-red-600" />}
            label="Expiradas/Inactivas"
            value={stats.companies.expired + stats.companies.inactive}
            color="bg-red-50"
          />
          <StatCard
            icon={<DollarSign className="w-6 h-6 text-blue-600" />}
            label="Total Recebido"
            value={stats.payments.totalAmountFormatted}
            sub={`${stats.payments.total} pagamentos`}
            color="bg-blue-50"
          />
        </div>
      )}

      {/* Expiring Soon Alert */}
      {stats?.expiringSoon && stats.expiringSoon.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" />
            Assinaturas a expirar em breve (7 dias)
          </h3>
          <div className="space-y-2">
            {stats.expiringSoon.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-white rounded-lg border border-amber-200 px-4 py-2">
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-amber-700">Expira: {formatPtDate(c.expiresAt)}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const comp = companies.find((x) => x.id === c.id);
                    if (comp) openPaymentDialog(comp);
                  }}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                >
                  <CreditCard className="w-3 h-3 mr-1" />
                  Pagar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Pesquisar por nome ou NUIT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="grace">Em Carencia</option>
            <option value="expired">Expiradas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>
      </div>

      {/* Companies Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-gradient-to-r from-slate-50 to-slate-100">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Empresa</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado Assinatura</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Validade</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Dias Restantes</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Pago</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Accoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                  A carregar empresas...
                </td>
              </tr>
            ) : filteredCompanies.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                  Nenhuma empresa encontrada.
                </td>
              </tr>
            ) : (
              filteredCompanies.map((company) => (
                <>
                  <tr
                    key={company.id}
                    className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => setExpandedRow(expandedRow === company.id ? null : company.id)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-100 to-emerald-100 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{company.name}</p>
                          <p className="text-xs text-slate-500">NUIT: {company.nuit || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${subscriptionStatusColor(company.subscriptionStatus)}`}>
                        {subscriptionStatusIcon(company.subscriptionStatus)}
                        {subscriptionStatusLabel(company.subscriptionStatus)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {company.subscriptionExpiresAt ? formatPtDate(company.subscriptionExpiresAt) : "-"}
                    </td>
                    <td className="px-5 py-4">
                      {company.subscriptionStatus === "active" ? (
                        <span className="text-sm font-semibold text-emerald-700">{company.daysRemaining} dias</span>
                      ) : company.subscriptionStatus === "grace" ? (
                        <span className="text-sm font-semibold text-amber-700">{company.daysInGrace} dias (carencia)</span>
                      ) : (
                        <span className="text-sm text-red-600">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-900">
                      {formatMoney(company.totalPaid)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          onClick={() => openRenewDialog(company)}
                          className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white"
                          title="Renovar Assinatura"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openPaymentDialog(company)}
                          className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white"
                          title="Registar Pagamento"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void openHistoryDialog(company)}
                          title="Historico de Pagamentos"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openGrantDaysDialog(company)}
                          title="Conceder Dias de Acesso"
                          className="border-violet-300 text-violet-700 hover:bg-violet-50"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openStatementDialog(company.id)}
                          title="Extrato"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        {expandedRow === company.id ? (
                          <ChevronUp className="w-4 h-4 text-slate-400 self-center" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 self-center" />
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedRow === company.id && (
                    <tr key={`${company.id}-details`} className="bg-slate-50">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500">Utilizadores</p>
                            <p className="font-semibold text-slate-900">{company.usersCount}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Clientes</p>
                            <p className="font-semibold text-slate-900">{company.clientsCount}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Credito</p>
                            <p className="font-semibold text-slate-900">{company.loansCount}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Ultimo Pagamento</p>
                            <p className="font-semibold text-slate-900">{company.lastPaymentAt ? formatPtDateTime(company.lastPaymentAt) : "-"}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Payment Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => (!open ? setShowPaymentDialog(false) : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-teal-600" />
              Registar Pagamento
            </DialogTitle>
            <DialogDescription>
              Registar pagamento de assinatura para <strong>{selectedCompany?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          {selectedCompany && (
            <div className="bg-slate-50 rounded-lg p-3 mb-4 flex items-center gap-3 border border-slate-200">
              <Building2 className="w-5 h-5 text-teal-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{selectedCompany.name}</p>
                <p className="text-xs text-slate-500">
                  Estado actual: <span className={`font-medium ${selectedCompany.subscriptionStatus === "active" ? "text-emerald-600" : selectedCompany.subscriptionStatus === "grace" ? "text-amber-600" : "text-red-600"}`}>{subscriptionStatusLabel(selectedCompany.subscriptionStatus)}</span>
                  {selectedCompany.subscriptionExpiresAt && <> | Expira: {formatPtDate(selectedCompany.subscriptionExpiresAt)}</>}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={(e) => void submitPayment(e)} className="space-y-4">
            {paymentError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{paymentError}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo de Pagamento</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={paymentForm.paymentType}
                  onChange={(e) => setPaymentForm((s) => ({ ...s, paymentType: e.target.value }))}
                >
                  {PAYMENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.days} dia{opt.days > 1 ? "s" : ""})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Dias Contratados</Label>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={paymentForm.daysPurchased}
                  onChange={(e) => setPaymentForm((s) => ({ ...s, daysPurchased: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Valor (MT) *</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((s) => ({ ...s, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Metodo de Pagamento</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={paymentForm.paymentMethod}
                  onChange={(e) => setPaymentForm((s) => ({ ...s, paymentMethod: e.target.value }))}
                >
                  {PAYMENT_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Referencia (opcional)</Label>
              <Input
                placeholder="Ex: Nr. recibo bancario"
                value={paymentForm.referenceNo}
                onChange={(e) => setPaymentForm((s) => ({ ...s, referenceNo: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Notas (opcional)</Label>
              <Input
                placeholder="Observacoes sobre o pagamento"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>

            {/* Preview */}
            {paymentForm.amount && Number(paymentForm.amount) > 0 && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-teal-800 mb-2">Resumo do Pagamento</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-teal-600">Valor:</span>{" "}
                    <span className="font-bold text-teal-900">{formatMoney(Number(paymentForm.amount))}</span>
                  </div>
                  <div>
                    <span className="text-teal-600">Dias:</span>{" "}
                    <span className="font-bold text-teal-900">{paymentForm.daysPurchased}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowPaymentDialog(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingPayment || !paymentForm.amount || Number(paymentForm.amount) <= 0}
                className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700"
              >
                {savingPayment ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Registar Pagamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Payment History Dialog ──────────────────────────────────────── */}
      <Dialog open={showHistoryDialog} onOpenChange={(open) => (!open ? setShowHistoryDialog(false) : null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-600" />
              Historico de Pagamentos
            </DialogTitle>
            <DialogDescription>
              Pagamentos de <strong>{historyCompany?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="py-8 text-center text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              A carregar historico...
            </div>
          ) : payments.length === 0 ? (
            <div className="py-8 text-center text-slate-500">Nenhum pagamento registado.</div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Receipt className="w-4 h-4 text-teal-600" />
                        <span className="text-sm font-semibold text-slate-900">{payment.receiptNo}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${payment.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {payment.status === "active" ? "Activo" : payment.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600 mt-2">
                        <div>
                          <span className="text-slate-400">Tipo:</span>{" "}
                          {PAYMENT_TYPE_OPTIONS.find((o) => o.value === payment.paymentType)?.label || payment.paymentType}
                        </div>
                        <div>
                          <span className="text-slate-400">Metodo:</span>{" "}
                          {PAYMENT_METHOD_OPTIONS.find((o) => o.value === payment.paymentMethod)?.label || payment.paymentMethod}
                        </div>
                        <div>
                          <span className="text-slate-400">Valido:</span>{" "}
                          {formatPtDate(payment.validFrom)} - {formatPtDate(payment.validUntil)}
                        </div>
                        <div>
                          <span className="text-slate-400">Dias:</span> {payment.daysPurchased}
                        </div>
                      </div>
                      {payment.notes && (
                        <p className="text-xs text-slate-500 mt-1">Nota: {payment.notes}</p>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-lg font-bold text-teal-700">{payment.amountFormatted}</p>
                      <p className="text-xs text-slate-500">{formatPtDate(payment.paymentDate)}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 text-xs"
                        onClick={() => printReceipt(payment)}
                      >
                        <Printer className="w-3 h-3 mr-1" />
                        Imprimir
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Statement Dialog ────────────────────────────────────────────── */}
      <Dialog open={showStatementDialog} onOpenChange={(open) => (!open ? setShowStatementDialog(false) : null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-600" />
              Extrato de Pagamentos
            </DialogTitle>
            <DialogDescription>Gerar extrato de pagamentos da empresa</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-1">
              <Label>Data Inicio (opcional)</Label>
              <Input
                type="date"
                value={statementDateFrom}
                onChange={(e) => setStatementDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Data Fim (opcional)</Label>
              <Input
                type="date"
                value={statementDateTo}
                onChange={(e) => setStatementDateTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={(e) => { e.preventDefault(); void generateStatement(); }}
                disabled={statementLoading}
                className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700"
              >
                {statementLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <BarChart3 className="w-4 h-4 mr-2" />}
                Gerar Extrato
              </Button>
            </div>
          </div>

          {statementData && (
            <div className="space-y-4">
              {statementData.company && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">{statementData.company.name}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
                    <div>NUIT: {statementData.company.nuit || "-"}</div>
                    <div>Endereco: {statementData.company.address || "-"}</div>
                    <div>Contacto: {statementData.company.phone || "-"}</div>
                    <div>Email: {statementData.company.email || "-"}</div>
                  </div>
                </div>
              )}

              {statementData.payments.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Data</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Recibo</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Tipo</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Periodo</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Dias</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">Valor</th>
                        <th className="text-center px-4 py-2 text-xs font-semibold text-slate-600">Accao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.payments.map((p) => (
                        <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-2">{formatPtDate(p.paymentDate)}</td>
                          <td className="px-4 py-2 font-medium">{p.receiptNo}</td>
                          <td className="px-4 py-2">
                            {PAYMENT_TYPE_OPTIONS.find((o) => o.value === p.paymentType)?.label || p.paymentType}
                          </td>
                          <td className="px-4 py-2 text-xs">{formatPtDate(p.validFrom)} - {formatPtDate(p.validUntil)}</td>
                          <td className="px-4 py-2">{p.daysPurchased}</td>
                          <td className="px-4 py-2 text-right font-bold text-teal-700">{p.amountFormatted}</td>
                          <td className="px-4 py-2 text-center">
                            <Button size="sm" variant="ghost" onClick={() => printReceipt(p)}>
                              <Printer className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-500">Nenhum pagamento encontrado para o periodo.</div>
              )}

              {/* Summary */}
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg p-5 border border-teal-200">
                <h4 className="text-sm font-semibold text-teal-800 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Resumo
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-teal-800">{statementData.summary.totalPayments}</p>
                    <p className="text-xs text-teal-600">Pagamentos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-teal-800">{statementData.summary.totalDays}</p>
                    <p className="text-xs text-teal-600">Dias Totais</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-teal-800">{statementData.summary.totalPaidFormatted}</p>
                    <p className="text-xs text-teal-600">Total Pago</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={printStatement}>
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir Extrato
                </Button>
                <Button onClick={printStatement} className="bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700">
                  <Download className="w-4 h-4 mr-2" />
                  Descarregar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Grant Days Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showGrantDaysDialog} onOpenChange={(open) => (!open ? setShowGrantDaysDialog(false) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-violet-600" />
              Conceder Dias de Acesso
            </DialogTitle>
            <DialogDescription>
              Conceder dias de acesso a <strong>{grantDaysCompany?.name}</strong> sem pagamento
            </DialogDescription>
          </DialogHeader>

          {grantDaysCompany && (
            <div className="bg-slate-50 rounded-lg p-3 mb-4 flex items-center gap-3 border border-slate-200">
              <Building2 className="w-5 h-5 text-violet-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{grantDaysCompany.name}</p>
                <p className="text-xs text-slate-500">
                  Estado actual: <span className={`font-medium ${grantDaysCompany.subscriptionStatus === "active" ? "text-emerald-600" : grantDaysCompany.subscriptionStatus === "grace" ? "text-amber-600" : "text-red-600"}`}>{subscriptionStatusLabel(grantDaysCompany.subscriptionStatus)}</span>
                  {grantDaysCompany.subscriptionExpiresAt && <> | Expira: {formatPtDate(grantDaysCompany.subscriptionExpiresAt)}</>}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={(e) => void submitGrantDays(e)} className="space-y-4">
            {grantDaysError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{grantDaysError}</div>
            )}

            <div className="space-y-1">
              <Label>Dias a Conceder *</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={grantDaysValue}
                onChange={(e) => setGrantDaysValue(e.target.value)}
                required
              />
              <p className="text-xs text-slate-500">De 1 a 3650 dias. Se a assinatura estiver activa, os dias sao somados ao vencimento actual.</p>
            </div>

            <div className="space-y-1">
              <Label>Notas (opcional)</Label>
              <Input
                placeholder="Motivo da concessao de dias"
                value={grantDaysNotes}
                onChange={(e) => setGrantDaysNotes(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowGrantDaysDialog(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingGrantDays || !grantDaysValue || Number(grantDaysValue) <= 0}
                className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              >
                {savingGrantDays ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Calendar className="w-4 h-4 mr-2" />
                )}
                Conceder Dias
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
