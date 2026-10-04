import { useState, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Loader2,
  Printer,
  Search,
  XCircle,
} from "lucide-react";
import type { ClientCreditProfile } from "../../lib/notifications";
import { formatCurrencyMT } from "../../lib/format";
import { openCorporatePrintWindow } from "../../lib/print";

type Props = {
  profile: ClientCreditProfile | null;
  loading: boolean;
  clientName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CreditFilter = "active" | "paid" | "all";

const STATUS_MAP: Record<string, "active" | "paid"> = {
  active: "active",
  ativo: "active",
  open: "active",
  paid: "paid",
  pago: "paid",
  closed: "paid",
  liquidado: "paid",
  quitado: "paid",
};

function classifyLoanStatus(status: string): CreditFilter {
  const normalized = status.toLowerCase().trim();
  if (normalized === "active" || normalized === "ativo" || normalized === "open") return "active";
  return "paid";
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "late" || s === "overdue" || s === "atrasado") return "bg-red-100 text-red-800 border-red-200";
  if (s === "partial" || s === "parcial") return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "paid" || s === "pago" || s === "closed" || s === "liquidado" || s === "quitado") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "active" || s === "ativo" || s === "open") return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === "late" || s === "overdue" || s === "atrasado") return "Em Atraso";
  if (s === "partial" || s === "parcial") return "Parcial";
  if (s === "paid" || s === "pago") return "Pago";
  if (s === "closed" || s === "liquidado" || s === "quitado") return "Liquidado";
  if (s === "active" || s === "ativo" || s === "open") return "Ativo";
  return status;
}

export default function ClientCreditsModal({ profile, loading, clientName, open, onOpenChange }: Props) {
  const [filter, setFilter] = useState<CreditFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const displayName = profile?.client.name || clientName || "Cliente";
  const summary = profile?.summary;

  const filteredLoans = useMemo(() => {
    if (!profile?.loans) return [];
    return profile.loans.filter((loan) => {
      const matchFilter = filter === "all" || classifyLoanStatus(loan.status) === filter;
      const matchSearch = loan.contractNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loan.product.toLowerCase().includes(searchTerm.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [profile, filter, searchTerm]);

  const activeLoans = useMemo(() => profile?.loans.filter((l) => classifyLoanStatus(l.status) === "active") || [], [profile]);
  const paidLoans = useMemo(() => profile?.loans.filter((l) => classifyLoanStatus(l.status) === "paid") || [], [profile]);

  const filterCounts = {
    all: profile?.loans.length || 0,
    active: activeLoans.length,
    paid: paidLoans.length,
  };

  const printCreditDetails = () => {
    if (!profile) return;
    const now = new Date().toLocaleString("pt-PT");
    const loansHtml = filteredLoans
      .map(
        (loan) =>
          `<tr>
            <td>${loan.contractNo}</td>
            <td>${loan.product}</td>
            <td>${formatCurrencyMT(loan.principal)}</td>
            <td>${formatCurrencyMT(loan.balance)}</td>
            <td>${statusLabel(loan.status)}</td>
            <td>${loan.daysOverdue > 0 ? `${loan.daysOverdue} dias` : "-"}</td>
            <td>${loan.managerName || "-"}</td>
          </tr>`
      )
      .join("");

    const html = `
      <h1 class="title">Créditos — ${displayName}</h1>
      <p class="sub">Gerado em ${now}</p>
      <table>
        <thead>
          <tr>
            <th>Contrato</th>
            <th>Produto</th>
            <th>Principal</th>
            <th>Saldo</th>
            <th>Estado</th>
            <th>Atraso</th>
            <th>Gestor</th>
          </tr>
        </thead>
        <tbody>${loansHtml || "<tr><td colspan='7'>Nenhum crédito encontrado.</td></tr>"}</tbody>
      </table>
      <div style="margin-top: 16px; display: flex; gap: 16px; flex-wrap: wrap;">
        <div style="padding: 8px 12px; background: #fef2f2; border-radius: 8px;">
          <strong>Saldo em dívida:</strong> ${formatCurrencyMT(summary?.totalDebt || 0)}
        </div>
        <div style="padding: 8px 12px; background: #ecfdf5; border-radius: 8px;">
          <strong>Total pago:</strong> ${formatCurrencyMT(summary?.totalPaid || 0)}
        </div>
        <div style="padding: 8px 12px; background: #eff6ff; border-radius: 8px;">
          <strong>Contratos activos:</strong> ${summary?.activeLoans || 0}
        </div>
        <div style="padding: 8px 12px; background: #fffbeb; border-radius: 8px;">
          <strong>Prestações em atraso:</strong> ${summary?.overdueInstallments || 0}
        </div>
      </div>
    `;
    openCorporatePrintWindow({
      title: `Creditos_${displayName.replace(/\s+/g, "_")}`,
      bodyHtml: html,
      browserControls: true,
    });
  };

  const printLoanDetail = (loanId: number, contractNo: string) => {
    if (!profile) return;
    const loan = profile.loans.find((l) => l.id === loanId);
    if (!loan) return;

    const repayments = profile.repayments.filter((r) => r.loanId === loanId || r.contractNo === contractNo);
    const installments = profile.pendingInstallments.filter((i) => i.loanId === loanId || i.contractNo === contractNo);

    const now = new Date().toLocaleString("pt-PT");
    const repaymentsHtml = repayments
      .map(
        (r) =>
          `<tr>
            <td>${new Date(r.paymentDate).toLocaleDateString("pt-MZ")}</td>
            <td>${r.receiptNo || "-"}</td>
            <td>${formatCurrencyMT(r.amountReceived)}</td>
            <td>${formatCurrencyMT(r.principalApplied)}</td>
            <td>${formatCurrencyMT(r.interestApplied)}</td>
            <td>${formatCurrencyMT(r.moraApplied)}</td>
          </tr>`
      )
      .join("");
    const installmentsHtml = installments
      .map(
        (i) =>
          `<tr>
            <td>#${i.installmentNo}</td>
            <td>${new Date(i.dueDate).toLocaleDateString("pt-MZ")}</td>
            <td>${formatCurrencyMT(i.paymentAmount)}</td>
            <td>${statusLabel(i.status)}</td>
          </tr>`
      )
      .join("");

    const html = `
      <h1 class="title">Detalhes do Crédito — ${contractNo}</h1>
      <p class="sub">Cliente: ${displayName} | Gerado em ${now}</p>
      <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
        <div style="padding: 8px 12px; background: #f1f5f9; border-radius: 8px;">
          <strong>Produto:</strong> ${loan.product}
        </div>
        <div style="padding: 8px 12px; background: #f1f5f9; border-radius: 8px;">
          <strong>Principal:</strong> ${formatCurrencyMT(loan.principal)}
        </div>
        <div style="padding: 8px 12px; background: #f1f5f9; border-radius: 8px;">
          <strong>Saldo:</strong> ${formatCurrencyMT(loan.balance)}
        </div>
        <div style="padding: 8px 12px; background: #f1f5f9; border-radius: 8px;">
          <strong>Estado:</strong> ${statusLabel(loan.status)}
        </div>
      </div>
      <h3>Pagamentos</h3>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Recibo</th>
            <th>Recebido</th>
            <th>Capital</th>
            <th>Juros</th>
            <th>Mora</th>
          </tr>
        </thead>
        <tbody>${repaymentsHtml || "<tr><td colspan='6'>Sem pagamentos registados.</td></tr>"}</tbody>
      </table>
      <h3 style="margin-top: 16px;">Prestações</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Vencimento</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${installmentsHtml || "<tr><td colspan='4'>Sem prestações pendentes.</td></tr>"}</tbody>
      </table>
    `;
    openCorporatePrintWindow({
      title: `Credito_${contractNo.replace(/\//g, "_")}`,
      bodyHtml: html,
      browserControls: true,
    });
  };

  const viewCreditState = (loanId: number, contractNo: string) => {
    if (!profile) return;
    const loan = profile.loans.find((l) => l.id === loanId);
    if (!loan) return;

    const repayments = profile.repayments.filter((r) => r.loanId === loanId || r.contractNo === contractNo);
    const installments = profile.pendingInstallments.filter((i) => i.loanId === loanId || i.contractNo === contractNo);
    const totalReceived = repayments.reduce((s, r) => s + r.amountReceived, 0);
    const totalApplied = repayments.reduce((s, r) => s + r.amountApplied, 0);
    const totalPrincipal = repayments.reduce((s, r) => s + r.principalApplied, 0);
    const totalInterest = repayments.reduce((s, r) => s + r.interestApplied, 0);
    const totalMora = repayments.reduce((s, r) => s + r.moraApplied, 0);
    const overdueInstallments = installments.filter((i) => i.status === "late" || i.status === "overdue" || i.status === "atrasado");
    const paidInstallments = installments.filter((i) => i.status === "paid" || i.status === "pago");
    const pendingInstallments = installments.filter((i) => i.status === "pending" || i.status === "pendente");

    const now = new Date().toLocaleString("pt-PT");
    const html = `
      <h1 class="title">Estado Actual do Crédito — ${contractNo}</h1>
      <p class="sub">Cliente: ${displayName} | Gerado em ${now}</p>

      <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
        <div style="padding: 12px 16px; background: #f1f5f9; border-radius: 8px; flex: 1; min-width: 140px;">
          <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Produto</div>
          <div style="font-size: 16px; font-weight: 600;">${loan.product}</div>
        </div>
        <div style="padding: 12px 16px; background: #f1f5f9; border-radius: 8px; flex: 1; min-width: 140px;">
          <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Principal</div>
          <div style="font-size: 16px; font-weight: 600;">${formatCurrencyMT(loan.principal)}</div>
        </div>
        <div style="padding: 12px 16px; background: #fef2f2; border-radius: 8px; flex: 1; min-width: 140px;">
          <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Saldo Devedor</div>
          <div style="font-size: 16px; font-weight: 600; color: #dc2626;">${formatCurrencyMT(loan.balance)}</div>
        </div>
        <div style="padding: 12px 16px; background: #f0fdf4; border-radius: 8px; flex: 1; min-width: 140px;">
          <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Estado</div>
          <div style="font-size: 16px; font-weight: 600; color: #16a34a;">${statusLabel(loan.status)}</div>
        </div>
      </div>

      <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
        <div style="padding: 8px 12px; background: #f0fdf4; border-radius: 8px;">
          <strong>Total Recebido:</strong> ${formatCurrencyMT(totalReceived)}
        </div>
        <div style="padding: 8px 12px; background: #f0fdf4; border-radius: 8px;">
          <strong>Total Aplicado:</strong> ${formatCurrencyMT(totalApplied)}
        </div>
        <div style="padding: 8px 12px; background: #eff6ff; border-radius: 8px;">
          <strong>Capital Amortizado:</strong> ${formatCurrencyMT(totalPrincipal)}
        </div>
        <div style="padding: 8px 12px; background: #fffbeb; border-radius: 8px;">
          <strong>Juros Pagos:</strong> ${formatCurrencyMT(totalInterest)}
        </div>
        <div style="padding: 8px 12px; background: #fef2f2; border-radius: 8px;">
          <strong>Mora:</strong> ${formatCurrencyMT(totalMora)}
        </div>
      </div>

      <h3>Resumo das Prestações</h3>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Quantidade</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Em Atraso</td><td>${overdueInstallments.length}</td></tr>
          <tr><td>Pagas</td><td>${paidInstallments.length}</td></tr>
          <tr><td>Pendentes</td><td>${pendingInstallments.length}</td></tr>
        </tbody>
      </table>

      ${loan.daysOverdue > 0 ? `<div style="margin-top: 12px; padding: 8px 12px; background: #fef2f2; border-radius: 8px; color: #dc2626;">
        <strong>Atenção:</strong> Crédito com ${loan.daysOverdue} dias em atraso.
      </div>` : ""}
      ${loan.managerName ? `<div style="margin-top: 8px; padding: 8px 12px; background: #f1f5f9; border-radius: 8px;">
        <strong>Gestor Responsável:</strong> ${loan.managerName}
      </div>` : ""}
    `;
    openCorporatePrintWindow({
      title: `Estado_Credito_${contractNo.replace(/\//g, "_")}`,
      bodyHtml: html,
      browserControls: true,
    });
  };

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          A carregar créditos...
        </div>
      )}

      {profile && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs text-red-700 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Saldo em dívida
              </p>
              <p className="text-lg font-bold text-red-700">{formatCurrencyMT(summary?.totalDebt || 0)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Total pago
              </p>
              <p className="text-lg font-bold text-emerald-900">{formatCurrencyMT(summary?.totalPaid || 0)}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs text-blue-700 flex items-center gap-1">
                <CreditCard className="w-3 h-3" /> Contratos activos
              </p>
              <p className="text-lg font-bold text-blue-900">{summary?.activeLoans || 0}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Prestações em atraso
              </p>
              <p className="text-lg font-bold text-amber-900">{summary?.overdueInstallments || 0}</p>
            </div>
          </div>

          {summary?.nextDueDate && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3">
              <Calendar className="w-5 h-5 text-indigo-600" />
              <div>
                <p className="text-sm font-medium text-indigo-900">Próxima prestação</p>
                <p className="text-xs text-indigo-700">
                  {new Date(summary.nextDueDate).toLocaleDateString("pt-MZ")} — {formatCurrencyMT(summary.nextDueAmount)}
                </p>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {(["all", "active", "paid"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    filter === f
                      ? "bg-cyan-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f === "all" ? "Ambos" : f === "active" ? "Crédito Ativo" : "Pago"}
                  <span className="ml-1.5 text-xs opacity-70">({filterCounts[f]})</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar contrato..."
                  className="w-48 h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <button
                onClick={printCreditDetails}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="Imprimir lista de créditos"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </div>
          </div>

          {/* Credits table */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">Contrato</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">Produto</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-600">Principal</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-600">Saldo</th>
                  <th className="px-4 py-2.5 text-center font-medium text-slate-600">Estado</th>
                  <th className="px-4 py-2.5 text-center font-medium text-slate-600">Atraso</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-600">Gestor</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-600">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLoans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-sm font-medium text-slate-800">{loan.contractNo}</td>
                    <td className="px-4 py-2.5 text-slate-700">{loan.product}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatCurrencyMT(loan.principal)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{formatCurrencyMT(loan.balance)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(loan.status)}`}>
                        {statusLabel(loan.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-600">
                      {loan.daysOverdue > 0 ? (
                        <span className="text-red-600 font-medium">{loan.daysOverdue} dias</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{loan.managerName || "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => printLoanDetail(loan.id, loan.contractNo)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200"
                          title="Imprimir detalhes do crédito"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Imprimir
                        </button>
                        <button
                          onClick={() => viewCreditState(loan.id, loan.contractNo)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-cyan-700 hover:bg-cyan-50 border border-cyan-200"
                          title="Ver estado actual do crédito"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          Estado
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredLoans.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-sm text-slate-500 py-8">
                      {filter === "all"
                        ? "Nenhum crédito encontrado para este cliente."
                        : filter === "active"
                          ? "Nenhum crédito activo encontrado."
                          : "Nenhum crédito pago/liquidado encontrado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}