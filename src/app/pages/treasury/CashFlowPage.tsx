import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Download, Paperclip, PlusCircle, Printer, RefreshCcw, ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { getActiveCompanyId, getToken, getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { downloadTextFile, toCsv } from "../../lib/download";
import { formatCurrencyInput, formatCurrencyMT, parseCurrencyInput } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";

type OverviewResponse = {
  summary: {
    cashIn: number;
    cashOut: number;
    netCash: number;
    interestReceived: number;
  };
  expenseCategories: Array<{ value: string; label: string }>;
  outflowSources?: Array<{ value: string; label: string }>;
  expenseByOutflowSource?: Array<{
    outflowSource: string;
    outflowSourceLabel: string;
    count: number;
    total: number;
  }>;
  managerLinkedCategories: string[];
  approvalsSummary?: {
    pendingAdminCount: number;
    pendingAdminAmount: number;
  };
};

type CostCenter = {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
};

type ExpenseRow = {
  id: number;
  expenseDate: string;
  category: string;
  categoryLabel: string;
  amount: number;
  description: string;
  note: string;
  payeeType: "manager" | "entity";
  managerUserId: number | null;
  managerName: string;
  entityName: string;
  payeeName: string;
  outflowSource?: string;
  outflowSourceLabel?: string;
  workflowStatus?: "pending_admin" | "executed" | "rejected";
  rejectionReason?: string;
  costCenterId?: number | null;
  costCenterName?: string;
  attachmentsCount?: number;
  createdByName: string;
};

type ExpensesResponse = {
  totals: { total: number; totalAmount: number };
  rows: ExpenseRow[];
  totalsByCategory: Array<{ category: string; categoryLabel: string; count: number; total: number }>;
  totalsByCostCenter?: Array<{ id: number; code: string; name: string; count: number; total: number }>;
  expenseCategories: Array<{ value: string; label: string }>;
  outflowSources?: Array<{ value: string; label: string }>;
  managerLinkedCategories: string[];
  costCenters?: CostCenter[];
  workflowStatuses?: Array<{ value: string; label: string }>;
};

type PolicyResponse = {
  policy: {
    managerAutoApprovalLimit: number;
    categoriesRequireAdmin: string[];
  };
};

type ApprovalQueueResponse = {
  rows: ExpenseRow[];
};

type CostCentersResponse = {
  rows: CostCenter[];
};

type PortfolioResponse = {
  users: Array<{ id: number; fullName: string; role: string }>;
};

type AttachmentRow = {
  id: number;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedByName: string;
  uploadedAt: string;
};

type AttachmentResponse = {
  rows: AttachmentRow[];
};

type OutflowSummaryRow = {
  outflowSource: string;
  outflowSourceLabel: string;
  count: number;
  total: number;
  sharePct: number;
};

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const DEFAULT_WORKFLOW = [
  { value: "all", label: "Todos" },
  { value: "pending_admin", label: "Pendente Admin" },
  { value: "executed", label: "Executado" },
  { value: "rejected", label: "Rejeitado" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler ficheiro."));
    reader.readAsDataURL(file);
  });
}

function workflowLabel(status: string | undefined) {
  const value = String(status || "executed");
  if (value === "pending_admin") return "Pendente Admin";
  if (value === "rejected") return "Rejeitado";
  return "Executado";
}

function workflowStyle(status: string | undefined) {
  const value = String(status || "executed");
  if (value === "pending_admin") return "bg-amber-100 text-amber-800 border border-amber-200";
  if (value === "rejected") return "bg-rose-100 text-rose-800 border border-rose-200";
  return "bg-emerald-100 text-emerald-800 border border-emerald-200";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CashFlowPage() {
  const user = getUser();
  const role = String(user?.role || "").toLowerCase();
  const canRegister = role === "admin" || role === "manager";
  const canApprove = role === "admin";
  const canPolicy = role === "admin";

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [expenses, setExpenses] = useState<ExpensesResponse | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [approvals, setApprovals] = useState<ExpenseRow[]>([]);
  const [portfolioUsers, setPortfolioUsers] = useState<Array<{ id: number; fullName: string; role: string }>>([]);

  const [loading, setLoading] = useState(false);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [payeeFilter, setPayeeFilter] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [outflowSourceFilter, setOutflowSourceFilter] = useState("all");
  const [costCenterFilter, setCostCenterFilter] = useState("all");

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseModalError, setExpenseModalError] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [expenseCategory, setExpenseCategory] = useState("salario");
  const [expenseOutflowSource, setExpenseOutflowSource] = useState("caixa_geral");
  const [expenseCostCenterId, setExpenseCostCenterId] = useState("");
  const [expenseAmountInput, setExpenseAmountInput] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseEntityName, setExpenseEntityName] = useState("");
  const [managerAmountInputs, setManagerAmountInputs] = useState<Record<number, string>>({});
  const [savingExpense, setSavingExpense] = useState(false);

  const [managerLimitInput, setManagerLimitInput] = useState("");
  const [requireAdminCategories, setRequireAdminCategories] = useState<string[]>([]);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [newCenterCode, setNewCenterCode] = useState("");
  const [newCenterName, setNewCenterName] = useState("");
  const [savingCenter, setSavingCenter] = useState(false);

  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(null);
  const [attachmentRows, setAttachmentRows] = useState<AttachmentRow[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [loadingAttachment, setLoadingAttachment] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const expenseCategories = useMemo(
    () => overview?.expenseCategories || expenses?.expenseCategories || [],
    [overview?.expenseCategories, expenses?.expenseCategories],
  );

  const outflowSources = useMemo(
    () => overview?.outflowSources || expenses?.outflowSources || [{ value: "caixa_geral", label: "Caixa Geral" }],
    [overview?.outflowSources, expenses?.outflowSources],
  );

  const managerLinked = useMemo(
    () => new Set(overview?.managerLinkedCategories || expenses?.managerLinkedCategories || []),
    [overview?.managerLinkedCategories, expenses?.managerLinkedCategories],
  );

  const workflowOptions = useMemo(
    () => expenses?.workflowStatuses || DEFAULT_WORKFLOW,
    [expenses?.workflowStatuses],
  );

  const selectedExpense = useMemo(
    () => (expenses?.rows || []).find((row) => row.id === selectedExpenseId) || null,
    [expenses?.rows, selectedExpenseId],
  );

  const managerUsers = useMemo(
    () => portfolioUsers.filter((userItem) => {
      const roleName = String(userItem.role || "").toLowerCase();
      return roleName === "manager" || roleName === "agent";
    }),
    [portfolioUsers],
  );

  const isManagerCategory = managerLinked.has(expenseCategory);
  const managerAllocations = useMemo(
    () => managerUsers
      .map((manager) => ({
        managerUserId: manager.id,
        amount: parseCurrencyInput(managerAmountInputs[manager.id] || ""),
      }))
      .filter((item) => item.amount > 0),
    [managerAmountInputs, managerUsers],
  );
  const managerAllocationsTotal = useMemo(
    () => managerAllocations.reduce((sum, item) => sum + item.amount, 0),
    [managerAllocations],
  );

  const outflowSummary = useMemo<OutflowSummaryRow[]>(() => {
    let baseRows: Array<{ outflowSource: string; outflowSourceLabel: string; count: number; total: number }> = [];
    if (Array.isArray(overview?.expenseByOutflowSource) && overview.expenseByOutflowSource.length > 0) {
      baseRows = overview.expenseByOutflowSource.map((row) => ({
        outflowSource: row.outflowSource,
        outflowSourceLabel: row.outflowSourceLabel,
        count: Number(row.count || 0),
        total: Number(row.total || 0),
      }));
    }
    const rows = expenses?.rows || [];
    if (baseRows.length === 0 && rows.length > 0) {
      const grouped = new Map<string, { outflowSource: string; outflowSourceLabel: string; count: number; total: number }>();
      for (const row of rows) {
        const key = String(row.outflowSource || "caixa_geral");
        const current = grouped.get(key) || {
          outflowSource: key,
          outflowSourceLabel: row.outflowSourceLabel || "Caixa Geral",
          count: 0,
          total: 0,
        };
        current.count += 1;
        current.total += Number(row.amount || 0);
        grouped.set(key, current);
      }
      baseRows = Array.from(grouped.values());
    }

    const normalized = baseRows.map((item) => ({
      outflowSource: item.outflowSource,
      outflowSourceLabel: item.outflowSourceLabel,
      count: Number(item.count || 0),
      total: Number(Number(item.total || 0).toFixed(2)),
      sharePct: 0,
    }));
    const grandTotal = normalized.reduce((sum, row) => sum + row.total, 0);
    return normalized
      .map((row) => ({
        ...row,
        sharePct: grandTotal > 0 ? Number(((row.total / grandTotal) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenses?.rows, overview?.expenseByOutflowSource]);

  const loadPortfolio = useCallback(async () => {
    try {
      const data = await apiFetch<PortfolioResponse>("/users?role=portfolio");
      setPortfolioUsers(data.users || []);
    } catch {
      setPortfolioUsers([]);
    }
  }, []);

  const loadCenters = useCallback(async () => {
    try {
      const data = await apiFetch<CostCentersResponse>("/accounting/cash-flow/cost-centers");
      setCostCenters(data.rows || []);
    } catch {
      setCostCenters([]);
    }
  }, []);

  const loadPolicy = useCallback(async () => {
    if (!canPolicy) return;
    try {
      const data = await apiFetch<PolicyResponse>("/accounting/cash-flow/policy");
      const limit = Number(data.policy?.managerAutoApprovalLimit || 0);
      setManagerLimitInput(formatCurrencyInput(limit, { emptyIfZero: false }));
      setRequireAdminCategories(data.policy?.categoriesRequireAdmin || []);
    } catch {
      setManagerLimitInput("");
      setRequireAdminCategories([]);
    }
  }, [canPolicy]);

  const loadCashFlow = useCallback(async () => {
    setLoading(true);
    try {
      setError("");
      const o = new URLSearchParams();
      const e = new URLSearchParams();
      if (fromDate) {
        o.set("from", fromDate);
        e.set("from", fromDate);
      }
      if (toDate) {
        o.set("to", toDate);
        e.set("to", toDate);
      }
      e.set("category", categoryFilter);
      e.set("payeeType", payeeFilter);
      e.set("workflowStatus", workflowFilter);
      e.set("outflowSource", outflowSourceFilter);
      e.set("costCenterId", costCenterFilter);
      e.set("page", "1");
      e.set("pageSize", "300");

      const [oRes, eRes] = await Promise.all([
        apiFetch<OverviewResponse>(`/accounting/cash-flow/overview?${o.toString()}`),
        apiFetch<ExpensesResponse>(`/accounting/cash-flow/expenses?${e.toString()}`),
      ]);
      setOverview(oRes);
      setExpenses(eRes);
      if (Array.isArray(eRes.costCenters) && eRes.costCenters.length > 0) {
        setCostCenters(eRes.costCenters);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar fluxo de caixa.");
      setOverview(null);
      setExpenses(null);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, costCenterFilter, fromDate, outflowSourceFilter, payeeFilter, toDate, workflowFilter]);

  const loadApprovals = useCallback(async () => {
    if (!canApprove) {
      setApprovals([]);
      return;
    }
    setLoadingApprovals(true);
    try {
      const q = new URLSearchParams();
      if (fromDate) q.set("from", fromDate);
      if (toDate) q.set("to", toDate);
      const data = await apiFetch<ApprovalQueueResponse>(`/accounting/cash-flow/expenses/approvals?${q.toString()}`);
      setApprovals(data.rows || []);
    } catch {
      setApprovals([]);
    } finally {
      setLoadingApprovals(false);
    }
  }, [canApprove, fromDate, toDate]);

  useEffect(() => {
    loadPortfolio();
    loadCenters();
    loadPolicy();
    loadCashFlow();
    loadApprovals();
  }, [loadApprovals, loadCashFlow, loadCenters, loadPolicy, loadPortfolio]);

  useEffect(() => {
    setExpenseModalError("");
    if (isManagerCategory) {
      setExpenseEntityName("");
      setExpenseAmountInput("");
    } else {
      setManagerAmountInputs({});
    }
  }, [isManagerCategory]);

  useEffect(() => {
    if (!expenseCostCenterId && costCenters.length > 0) {
      const first = costCenters.find((center) => center.isActive) || costCenters[0];
      if (first) setExpenseCostCenterId(String(first.id));
    }
  }, [costCenters, expenseCostCenterId]);

  const applyFilters = async () => {
    await Promise.all([loadCashFlow(), loadApprovals()]);
  };

  const openExpenseModal = () => {
    setExpenseModalError("");
    setExpenseModalOpen(true);
  };

  const closeExpenseModal = () => {
    setExpenseModalError("");
    setExpenseModalOpen(false);
  };

  const registerExpense = async () => {
    if (!canRegister) return;
    setExpenseModalError("");

    const payload: Record<string, unknown> = {
      expenseDate,
      category: expenseCategory,
      outflowSource: expenseOutflowSource,
      costCenterId: expenseCostCenterId ? Number(expenseCostCenterId) : null,
      description: expenseDescription.trim(),
      note: expenseNote.trim(),
    };

    if (isManagerCategory) {
      if (managerUsers.length === 0) {
        setExpenseModalError("Nao existem gestores ativos para esta empresa.");
        return;
      }
      if (managerAllocations.length === 0) {
        setExpenseModalError("Informe ao menos um valor por gestor.");
        return;
      }
      payload.amount = managerAllocationsTotal;
      payload.managerAllocations = managerAllocations.map((item) => ({
        managerUserId: item.managerUserId,
        amount: item.amount,
      }));
    } else {
      const amount = parseCurrencyInput(expenseAmountInput);
      if (amount <= 0) {
        setExpenseModalError("Informe um valor valido para a despesa.");
        return;
      }
      if (!expenseEntityName.trim()) {
        setExpenseModalError("Informe a entidade da despesa.");
        return;
      }
      payload.amount = amount;
      payload.entityName = expenseEntityName.trim();
    }

    try {
      setSavingExpense(true);
      const response = await apiFetch<{ message: string }>("/accounting/cash-flow/expenses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSuccess(response.message || "Despesa registada com sucesso.");
      setExpenseAmountInput("");
      setExpenseDescription("");
      setExpenseNote("");
      setExpenseEntityName("");
      setExpenseOutflowSource("caixa_geral");
      setManagerAmountInputs({});
      setExpenseModalOpen(false);
      await Promise.all([loadCashFlow(), loadApprovals()]);
    } catch (err) {
      setExpenseModalError(err instanceof Error ? err.message : "Falha ao registar despesa.");
    } finally {
      setSavingExpense(false);
    }
  };

  const updateManagerAmount = (managerUserId: number, value: string) => {
    const parsed = parseCurrencyInput(value);
    const formatted = formatCurrencyInput(parsed, { emptyIfZero: true });
    setManagerAmountInputs((current) => ({ ...current, [managerUserId]: formatted }));
  };

  const savePolicy = async () => {
    const managerAutoApprovalLimit = parseCurrencyInput(managerLimitInput);
    if (managerAutoApprovalLimit <= 0) return setError("Informe um limite valido.");
    try {
      setSavingPolicy(true);
      setError("");
      await apiFetch<{ message: string }>("/accounting/cash-flow/policy", {
        method: "PUT",
        body: JSON.stringify({ managerAutoApprovalLimit, categoriesRequireAdmin: requireAdminCategories }),
      });
      setSuccess("Politica atualizada com sucesso.");
      await Promise.all([loadPolicy(), loadCashFlow(), loadApprovals()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar politica.");
    } finally {
      setSavingPolicy(false);
    }
  };

  const createCenter = async () => {
    if (!canRegister) return;
    const code = newCenterCode.trim().toUpperCase();
    const name = newCenterName.trim();
    if (!code || !name) return setError("Preencha codigo e nome do centro de custo.");
    try {
      setSavingCenter(true);
      setError("");
      await apiFetch<{ message: string }>("/accounting/cash-flow/cost-centers", {
        method: "POST",
        body: JSON.stringify({ code, name }),
      });
      setSuccess("Centro de custo criado com sucesso.");
      setNewCenterCode("");
      setNewCenterName("");
      await Promise.all([loadCenters(), loadCashFlow()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar centro de custo.");
    } finally {
      setSavingCenter(false);
    }
  };

  const decideApproval = async (expenseId: number, decision: "approve" | "reject") => {
    const rejectionReason = decision === "reject" ? String(window.prompt("Motivo da rejeicao:", "") || "").trim() : "";
    if (decision === "reject" && !rejectionReason) return;
    try {
      setError("");
      await apiFetch<{ message: string }>(`/accounting/cash-flow/expenses/${expenseId}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ decision, rejectionReason }),
      });
      setSuccess(decision === "approve" ? "Despesa aprovada com sucesso." : "Despesa rejeitada com sucesso.");
      await Promise.all([loadCashFlow(), loadApprovals()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar aprovacao.");
    }
  };

  const openAttachments = async (expenseId: number) => {
    setSelectedExpenseId(expenseId);
    setAttachmentRows([]);
    setAttachmentInputKey((prev) => prev + 1);
    setAttachmentFile(null);
    setLoadingAttachment(true);
    try {
      const data = await apiFetch<AttachmentResponse>(`/accounting/cash-flow/expenses/${expenseId}/attachments`);
      setAttachmentRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar anexos.");
    } finally {
      setLoadingAttachment(false);
    }
  };

  const uploadAttachment = async () => {
    if (!selectedExpenseId || !attachmentFile) return setError("Selecione o ficheiro para anexar.");
    try {
      setUploadingAttachment(true);
      setError("");
      const fileBase64 = await fileToBase64(attachmentFile);
      await apiFetch<{ message: string }>(`/accounting/cash-flow/expenses/${selectedExpenseId}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          fileName: attachmentFile.name,
          mimeType: attachmentFile.type,
          fileBase64,
        }),
      });
      setSuccess("Anexo carregado com sucesso.");
      await Promise.all([openAttachments(selectedExpenseId), loadCashFlow(), loadApprovals()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar anexo.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const downloadAttachment = async (attachment: AttachmentRow) => {
    if (!selectedExpenseId) return;
    try {
      const token = getToken();
      const companyId = getActiveCompanyId();
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (companyId) headers.set("x-company-id", String(companyId));
      const response = await fetch(`${API_BASE_URL}/accounting/cash-flow/expenses/${selectedExpenseId}/attachments/${attachment.id}/download`, { headers });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || "Falha ao descarregar anexo.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao descarregar anexo.");
    }
  };

  const exportCsv = () => {
    const rows = (expenses?.rows || []).map((row) => ({
      data: row.expenseDate,
      categoria: row.categoryLabel,
      origem_saida: row.outflowSourceLabel || "Caixa Geral",
      centro_custo: row.costCenterName || "Sem centro",
      entidade: row.payeeName,
      descricao: row.description || "",
      valor_mt: row.amount.toFixed(2),
      status: workflowLabel(row.workflowStatus),
      anexos: String(row.attachmentsCount || 0),
    }));
    downloadTextFile(`Despesas-Fluxo-Caixa-${todayIso()}.csv`, toCsv(rows), "text/csv;charset=utf-8");
    setSuccess("Despesas exportadas em CSV.");
  };

  const printExpenses = () => {
    const rows = (expenses?.rows || [])
      .map((row) => `<tr><td>${row.expenseDate}</td><td>${row.categoryLabel}</td><td>${row.outflowSourceLabel || "Caixa Geral"}</td><td>${row.costCenterName || "Sem centro"}</td><td>${row.payeeName}</td><td>${row.description || "-"}</td><td style='text-align:right'>${formatCurrencyMT(row.amount)}</td><td>${workflowLabel(row.workflowStatus)}</td></tr>`)
      .join("");
    openCorporatePrintWindow({
      title: "Fluxo-Caixa-Despesas",
      browserControls: true,
      bodyHtml: `<div class='block'><h2>Relatorio de Despesas</h2><p class='muted'><strong>Periodo:</strong> ${fromDate || "Inicio"} ate ${toDate || "Hoje"}</p></div><div class='block'><table><thead><tr><th>Data</th><th>Categoria</th><th>Origem</th><th>Centro</th><th>Entidade</th><th>Descricao</th><th style='text-align:right'>Valor</th><th>Status</th></tr></thead><tbody>${rows || "<tr><td colspan='8'>Sem despesas</td></tr>"}</tbody></table></div>`,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Fluxo de Caixa</h1>
          <p className="text-slate-600 mt-1">Alcada, centros de custo, anexos e aprovacao operacional.</p>
        </div>
        <div className="flex items-center gap-2">
          {canRegister && (
            <Button onClick={openExpenseModal}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Nova Despesa
            </Button>
          )}
          <Button variant="outline" onClick={applyFilters} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline" onClick={printExpenses}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-2" />
            Excel (CSV)
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
      {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">{success}</p>}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-9 gap-3">
        <div>
          <Label>Data inicial</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <Label>Data final</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div>
          <Label>Categoria</Label>
          <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">Todas</option>
            {expenseCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Entidade</Label>
          <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={payeeFilter} onChange={(e) => setPayeeFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="manager">Gestor</option>
            <option value="entity">Entidade</option>
          </select>
        </div>
        <div>
          <Label>Workflow</Label>
          <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)}>
            {workflowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Origem da saida</Label>
          <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={outflowSourceFilter} onChange={(e) => setOutflowSourceFilter(e.target.value)}>
            <option value="all">Todas</option>
            {outflowSources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Centro de custo</Label>
          <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={costCenterFilter} onChange={(e) => setCostCenterFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="none">Sem centro</option>
            {costCenters.filter((center) => center.isActive).map((center) => <option key={center.id} value={String(center.id)}>{center.code} - {center.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <Button onClick={applyFilters} disabled={loading}>Aplicar filtros</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-700">Entradas</p>
          <p className="text-2xl font-bold text-blue-900">{formatCurrencyMT(overview?.summary.cashIn || 0)}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">Saidas</p>
          <p className="text-2xl font-bold text-rose-900">{formatCurrencyMT(overview?.summary.cashOut || 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">Saldo liquido</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrencyMT(overview?.summary.netCash || 0)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Juros</p>
          <p className="text-2xl font-bold text-emerald-900">{formatCurrencyMT(overview?.summary.interestReceived || 0)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2 text-amber-900">
          <ShieldAlert className="w-5 h-5" />
          <p className="font-semibold">Pendencias de aprovacao: {overview?.approvalsSummary?.pendingAdminCount || 0}</p>
        </div>
        <p className="text-sm text-amber-800 mt-1">Valor pendente: {formatCurrencyMT(overview?.approvalsSummary?.pendingAdminAmount || 0)}</p>
      </div>

      {canPolicy && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Politica de Alcada</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Limite automatico manager (MT)</Label>
              <Input value={managerLimitInput} onChange={(e) => setManagerLimitInput(formatCurrencyInput(parseCurrencyInput(e.target.value), { emptyIfZero: true }))} />
            </div>
            <div className="md:col-span-2">
              <Label>Categorias com aprovacao obrigatoria admin</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                {expenseCategories.map((category) => (
                  <label key={category.value} className="flex items-center gap-2 border border-slate-200 rounded px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={requireAdminCategories.includes(category.value)}
                      onChange={() => {
                        setRequireAdminCategories((current) => {
                          const set = new Set(current);
                          if (set.has(category.value)) set.delete(category.value);
                          else set.add(category.value);
                          return Array.from(set);
                        });
                      }}
                    />
                    {category.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button onClick={savePolicy} disabled={savingPolicy}>{savingPolicy ? "A guardar..." : "Guardar politica"}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Centros de Custo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costCenters.map((center) => (
                <TableRow key={center.id}>
                  <TableCell>{center.code}</TableCell>
                  <TableCell>{center.name}</TableCell>
                  <TableCell>{center.isActive ? "Ativo" : "Inativo"}</TableCell>
                </TableRow>
              ))}
              {costCenters.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-slate-500 py-5">Sem centros registados.</TableCell></TableRow>}
            </TableBody>
          </Table>
          {canRegister && (
            <div className="space-y-2">
              <Label>Novo centro</Label>
              <Input placeholder="Codigo" value={newCenterCode} onChange={(e) => setNewCenterCode(e.target.value)} />
              <Input placeholder="Nome" value={newCenterName} onChange={(e) => setNewCenterName(e.target.value)} />
              <div className="flex justify-end"><Button onClick={createCenter} disabled={savingCenter}>{savingCenter ? "A criar..." : "Criar"}</Button></div>
            </div>
          )}
        </div>
      </div>

      {canRegister && (
        <Dialog
          open={expenseModalOpen}
          onOpenChange={(open) => {
            if (!open) closeExpenseModal();
            else setExpenseModalOpen(true);
          }}
        >
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registar Despesa</DialogTitle>
              <DialogDescription>O cadastro ocorre em modal e erros de validacao ficam apenas aqui.</DialogDescription>
            </DialogHeader>

            {expenseModalError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{expenseModalError}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              </div>
              <div>
                <Label>Categoria</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
                  {expenseCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Origem da saida</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={expenseOutflowSource} onChange={(e) => setExpenseOutflowSource(e.target.value)}>
                  {outflowSources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Centro de custo</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={expenseCostCenterId} onChange={(e) => setExpenseCostCenterId(e.target.value)}>
                  {costCenters.filter((center) => center.isActive).map((center) => <option key={center.id} value={String(center.id)}>{center.code} - {center.name}</option>)}
                </select>
              </div>

              {isManagerCategory ? (
                <div className="lg:col-span-4 space-y-2">
                  <Label>Valores por gestor (registo unico em lote)</Label>
                  {managerUsers.length > 0 ? (
                    <div className="border border-slate-200 rounded-md p-2 max-h-64 overflow-y-auto space-y-2">
                      {managerUsers.map((manager) => (
                        <div key={manager.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                          <p className="text-sm text-slate-700 md:col-span-2">{manager.fullName}</p>
                          <Input
                            placeholder="0.00"
                            value={managerAmountInputs[manager.id] || ""}
                            onChange={(e) => updateManagerAmount(manager.id, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      Sem gestores ativos para esta empresa.
                    </p>
                  )}
                  <p className="text-sm text-slate-700">
                    Total do lote: <strong>{formatCurrencyMT(managerAllocationsTotal)}</strong>
                  </p>
                </div>
              ) : (
                <>
                  <div className="lg:col-span-2">
                    <Label>Entidade</Label>
                    <Input value={expenseEntityName} onChange={(e) => setExpenseEntityName(e.target.value)} placeholder="Ex: EDM" />
                  </div>
                  <div>
                    <Label>Valor (MT)</Label>
                    <Input value={expenseAmountInput} onChange={(e) => setExpenseAmountInput(formatCurrencyInput(parseCurrencyInput(e.target.value), { emptyIfZero: true }))} />
                  </div>
                </>
              )}

              <div className="lg:col-span-2">
                <Label>Descricao</Label>
                <Input value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} />
              </div>
              <div className="lg:col-span-2">
                <Label>Nota interna</Label>
                <Input value={expenseNote} onChange={(e) => setExpenseNote(e.target.value)} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeExpenseModal} disabled={savingExpense}>Cancelar</Button>
              <Button onClick={registerExpense} disabled={savingExpense}>{savingExpense ? "A registar..." : "Registar despesa"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canApprove && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Fila de Aprovacao</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Anexos</TableHead>
                <TableHead>Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvals.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.expenseDate}</TableCell>
                  <TableCell>{row.categoryLabel}</TableCell>
                  <TableCell>{row.outflowSourceLabel || "Caixa Geral"}</TableCell>
                  <TableCell>{row.costCenterName || "Sem centro"}</TableCell>
                  <TableCell>{row.payeeName}</TableCell>
                  <TableCell className="text-right">{formatCurrencyMT(row.amount)}</TableCell>
                  <TableCell>{row.attachmentsCount || 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => openAttachments(row.id)}>Anexos</Button>
                      <Button onClick={() => decideApproval(row.id, "approve")}>Aprovar</Button>
                      <Button variant="outline" onClick={() => decideApproval(row.id, "reject")}>Rejeitar</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {loadingApprovals && <TableRow><TableCell colSpan={8} className="text-center py-5">A carregar fila...</TableCell></TableRow>}
              {!loadingApprovals && approvals.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-5">Sem pendencias.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Despesas</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Centro</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Anexos</TableHead>
              <TableHead>Registado por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(expenses?.rows || []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.expenseDate}</TableCell>
                <TableCell>{row.categoryLabel}</TableCell>
                <TableCell>{row.outflowSourceLabel || "Caixa Geral"}</TableCell>
                <TableCell>{row.costCenterName || "Sem centro"}</TableCell>
                <TableCell>{row.payeeName}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${workflowStyle(row.workflowStatus)}`}>{workflowLabel(row.workflowStatus)}</span>
                  {row.rejectionReason ? <p className="text-xs text-rose-700 mt-1">{row.rejectionReason}</p> : null}
                </TableCell>
                <TableCell className="text-right">{formatCurrencyMT(row.amount)}</TableCell>
                <TableCell><Button variant="outline" onClick={() => openAttachments(row.id)}><Paperclip className="w-4 h-4 mr-1" />{row.attachmentsCount || 0}</Button></TableCell>
                <TableCell>{row.createdByName}</TableCell>
              </TableRow>
            ))}
            {(!expenses || expenses.rows.length === 0) && <TableRow><TableCell colSpan={9} className="text-center py-5">Sem despesas no filtro.</TableCell></TableRow>}
          </TableBody>
        </Table>
        <p className="text-sm text-slate-600 mt-3">Total filtrado: <strong>{formatCurrencyMT(expenses?.totals.totalAmount || 0)}</strong> ({expenses?.totals.total || 0} registos)</p>
      </div>

      {selectedExpenseId && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Anexos da despesa #{selectedExpenseId}</h2>
          {selectedExpense && (
            <p className="text-sm text-slate-600 mb-3">{selectedExpense.categoryLabel} - {selectedExpense.payeeName} - {formatCurrencyMT(selectedExpense.amount)}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="md:col-span-2">
              <Label>Ficheiro (PDF/PNG/JPG)</Label>
              <Input key={attachmentInputKey} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={uploadAttachment} disabled={uploadingAttachment || !attachmentFile}>{uploadingAttachment ? "A carregar..." : "Carregar"}</Button>
              <Button variant="outline" onClick={() => openAttachments(selectedExpenseId)} disabled={loadingAttachment}>Atualizar</Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ficheiro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Carregado por</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachmentRows.map((attachment) => (
                <TableRow key={attachment.id}>
                  <TableCell>{attachment.fileName}</TableCell>
                  <TableCell>{attachment.mimeType}</TableCell>
                  <TableCell>{formatSize(attachment.fileSizeBytes)}</TableCell>
                  <TableCell>{attachment.uploadedByName}</TableCell>
                  <TableCell>{String(attachment.uploadedAt || "").slice(0, 19).replace("T", " ")}</TableCell>
                  <TableCell><Button variant="outline" onClick={() => downloadAttachment(attachment)}>Download</Button></TableCell>
                </TableRow>
              ))}
              {loadingAttachment && <TableRow><TableCell colSpan={6} className="text-center py-5">A carregar anexos...</TableCell></TableRow>}
              {!loadingAttachment && attachmentRows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-5">Sem anexos.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Resumo por categoria</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead>Qtd</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {(expenses?.totalsByCategory || []).map((row) => (
                <TableRow key={row.category}><TableCell>{row.categoryLabel}</TableCell><TableCell>{row.count}</TableCell><TableCell className="text-right">{formatCurrencyMT(row.total)}</TableCell></TableRow>
              ))}
              {(!expenses || expenses.totalsByCategory.length === 0) && <TableRow><TableCell colSpan={3} className="text-center py-5">Sem dados.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Resumo por origem da saida</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Origem</TableHead><TableHead>Qtd</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">% do total</TableHead></TableRow></TableHeader>
            <TableBody>
              {outflowSummary.map((row) => (
                <TableRow key={row.outflowSource}>
                  <TableCell>{row.outflowSourceLabel}</TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell className="text-right">{formatCurrencyMT(row.total)}</TableCell>
                  <TableCell className="text-right">{row.sharePct.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
              {outflowSummary.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-5">Sem dados.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Resumo por centro de custo</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Centro</TableHead><TableHead>Qtd</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {(expenses?.totalsByCostCenter || []).map((row) => (
                <TableRow key={`${row.code}-${row.id}`}><TableCell>{row.code} - {row.name}</TableCell><TableCell>{row.count}</TableCell><TableCell className="text-right">{formatCurrencyMT(row.total)}</TableCell></TableRow>
              ))}
              {(!expenses || (expenses.totalsByCostCenter || []).length === 0) && <TableRow><TableCell colSpan={3} className="text-center py-5">Sem dados.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">A atualizar dados do fluxo de caixa...</p>}
      {canApprove && approvals.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            <p className="font-semibold">Aprovacoes realizadas aqui refletem imediatamente na contabilidade.</p>
          </div>
        </div>
      )}
    </div>
  );
}
