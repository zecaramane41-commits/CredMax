import { useState, useEffect, useMemo } from "react";
import { CreditCard, Search, Download, Loader2, Filter, Layers, Briefcase, ChevronDown, Printer, AlertTriangle, CheckCircle2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
import { listCarteiras, type Carteira } from "../../lib/carteiras";
import { formatCurrencyMT } from "../../lib/format";
import { downloadTextFile, toCsv } from "../../lib/download";
import { openCorporatePrintWindow } from "../../lib/print";

type LoanReportItem = {
  id: number;
  contractNo: string;
  clientId: number;
  clientName: string;
  clientType: string;
  product: string;
  amount: number;
  balance: number;
  totalPaid?: number;
  disbursed: string;
  maturity: string;
  daysOverdue: number;
  status: string;
  carteiraId?: number | null;
  carteiraNome?: string;
  gestorName?: string;
  managerUserId?: number | null;
};

export default function CreditosReportPage() {
  const user = getUser();
  const canView = hasPermission(user, "visualizar.relatorios");
  const canExport = hasPermission(user, "exportar.relatorios");

  const [loans, setLoans] = useState<LoanReportItem[]>([]);
  const [carteiras, setCarteiras] = useState<Carteira[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCarteira, setSelectedCarteira] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    Promise.all([
      apiFetch<{ loans: any[] }>("/loans").catch(() => ({ loans: [] })),
      listCarteiras().then((r) => r.carteiras || []).catch(() => []),
    ]).then(([loansRes, carteiraList]) => {
      if (!ignore) {
        const rawLoans = loansRes.loans || [];
        const mapped: LoanReportItem[] = rawLoans.map((l: any) => ({
          id: Number(l.id),
          contractNo: l.contractNo || l.contract_no || `CTR-${l.id}`,
          clientId: Number(l.clientId || l.client_id),
          clientName: l.clientName || l.client_name || "Cliente",
          clientType: l.clientType || l.client_type || "singular",
          product: l.product || "Credito Normal",
          amount: Number(l.amount || l.principal || 0),
          balance: Number(l.balance || 0),
          totalPaid: Number(l.totalPaid || l.total_paid || 0),
          disbursed: l.disbursed || l.disbursed_on || "",
          maturity: l.maturity || l.maturity_on || "",
          daysOverdue: Number(l.daysOverdue || l.days_overdue || 0),
          status: l.status || "active",
          carteiraId: l.carteiraId || l.carteira_id || null,
          carteiraNome: l.carteiraNome || l.carteira_nome || "Geral",
          gestorName: l.gestorName || l.gestor_name || l.managerName || "—",
          managerUserId: l.managerUserId || l.manager_user_id || null,
        }));
        setLoans(mapped);
        setCarteiras(carteiraList);
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      const matchSearch =
        l.contractNo.toLowerCase().includes(search.toLowerCase()) ||
        l.clientName.toLowerCase().includes(search.toLowerCase());
      const matchCarteira =
        selectedCarteira === "all" ||
        String(l.carteiraId) === selectedCarteira ||
        l.carteiraNome?.toLowerCase() === selectedCarteira.toLowerCase();
      const matchStatus = selectedStatus === "all" || l.status === selectedStatus;
      const matchDateFrom = !dateFrom || (l.disbursed && l.disbursed >= dateFrom);
      const matchDateTo = !dateTo || (l.disbursed && l.disbursed <= dateTo);
      return matchSearch && matchCarteira && matchStatus && matchDateFrom && matchDateTo;
    });
  }, [loans, search, selectedCarteira, selectedStatus, dateFrom, dateTo]);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>Sem permissão para visualizar relatórios.</p>
      </div>
    );
  }

  const totalCreditos = filteredLoans.length;
  const totalDesembolsado = filteredLoans.reduce((s, l) => s + l.amount, 0);
  const totalSaldoDevedor = filteredLoans.reduce((s, l) => s + l.balance, 0);
  const totalEmMora = filteredLoans.filter((l) => l.daysOverdue > 0 || l.status === "overdue").length;

  const handleExportCSV = () => {
    const csvRows = filteredLoans.map((l) => ({
      Contrato: l.contractNo,
      Cliente: l.clientName,
      Tipo_Cliente: l.clientType,
      Produto: l.product,
      Carteira: l.carteiraNome || "Geral",
      Gestor: l.gestorName || "—",
      Montante_MT: l.amount,
      Saldo_Devedor_MT: l.balance,
      Data_Desembolso: l.disbursed,
      Vencimento: l.maturity,
      Dias_Atraso: l.daysOverdue,
      Estado: l.status,
    }));
    const csv = toCsv(csvRows);
    downloadTextFile(`relatorio-creditos-${Date.now()}.csv`, csv, "text/csv;charset=utf-8;");
  };

  const handlePrint = () => {
    const html = `
      <h2>Relatório Oficial de Créditos por Carteira</h2>
      <p>Data de Emissão: ${new Date().toLocaleDateString("pt-MZ")}</p>
      <p>Total de Contratos: ${totalCreditos} | Total Desembolsado: ${formatCurrencyMT(totalDesembolsado)} | Saldo Devedor Ativo: ${formatCurrencyMT(totalSaldoDevedor)}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:11px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th>Contrato</th>
            <th>Cliente</th>
            <th>Carteira</th>
            <th>Gestor</th>
            <th>Desembolsado (MT)</th>
            <th>Saldo Devedor (MT)</th>
            <th>Data Desembolso</th>
            <th>Mora (Dias)</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${filteredLoans
            .map(
              (l) => `
            <tr>
              <td><b>${l.contractNo}</b></td>
              <td>${l.clientName}</td>
              <td>${l.carteiraNome || "Geral"}</td>
              <td>${l.gestorName || "—"}</td>
              <td align="right">${formatCurrencyMT(l.amount)}</td>
              <td align="right"><b>${formatCurrencyMT(l.balance)}</b></td>
              <td>${l.disbursed || "—"}</td>
              <td align="center">${l.daysOverdue > 0 ? `<span style="color:red;">${l.daysOverdue} d</span>` : "Em dia"}</td>
              <td>${l.status}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
    openCorporatePrintWindow({
      title: "Relatório de Créditos por Carteira",
      html,
      reportName: "RELATÓRIO DE CRÉDITOS",
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg text-white">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Relatório de Créditos por Carteira</h1>
            <p className="text-sm text-slate-500">
              Acompanhamento detalhado de contratos, desembolsos e saldos por Carteira e Gestor
            </p>
          </div>
        </div>
        {canExport && (
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 shadow-sm"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> A carregar contratos do sistema...
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Total de Contratos</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalCreditos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Total Desembolsado</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrencyMT(totalDesembolsado)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Saldo Devedor Ativo</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrencyMT(totalSaldoDevedor)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Contratos em Mora</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{totalEmMora}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por contrato ou cliente..."
            className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filtro por Carteira */}
        <div className="relative min-w-[180px]">
          <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={selectedCarteira}
            onChange={(e) => setSelectedCarteira(e.target.value)}
            className="w-full h-9 pl-8 pr-8 text-xs font-medium rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
          >
            <option value="all">Todas as Carteiras</option>
            {carteiras.map((cart) => (
              <option key={cart.id} value={String(cart.id)}>
                {cart.name} ({cart.gestor_name || "Gestor"})
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Filtro por Estado */}
        <div className="relative min-w-[150px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full h-9 pl-8 pr-8 text-xs font-medium rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
          >
            <option value="all">Todos os Estados</option>
            <option value="active">Activo</option>
            <option value="warning">Alerta</option>
            <option value="overdue">Em Mora</option>
            <option value="settled">Liquidado</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Intervalo de datas */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-lg border border-slate-300"
            title="Data inicial de desembolso"
          />
          <span className="text-xs text-slate-400">a</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-lg border border-slate-300"
            title="Data final de desembolso"
          />
        </div>
      </div>

      {/* Tabela de Créditos com Carteira e Gestor */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Contrato</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-3 py-3">Carteira</th>
                <th className="px-3 py-3">Gestor Responsável</th>
                <th className="px-3 py-3 text-right">Desembolsado</th>
                <th className="px-3 py-3 text-right">Saldo Devedor</th>
                <th className="px-3 py-3 text-center">Data Desemb.</th>
                <th className="px-3 py-3 text-center">Mora</th>
                <th className="px-3 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLoans.length > 0 ? (
                filteredLoans.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-xs text-indigo-700">
                      {l.contractNo}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{l.clientName}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        <Layers className="w-3 h-3 text-slate-500" />
                        {l.carteiraNome || "Geral"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        <Briefcase className="w-3 h-3 text-indigo-500" />
                        {l.gestorName || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-slate-800">
                      {formatCurrencyMT(l.amount)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">
                      {formatCurrencyMT(l.balance)}
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-slate-500">
                      {l.disbursed || "—"}
                    </td>
                    <td className="px-3 py-3 text-center text-xs">
                      {l.daysOverdue > 0 ? (
                        <span className="inline-flex items-center gap-1 font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> {l.daysOverdue} dias
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">Em dia</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          l.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : l.status === "overdue"
                            ? "bg-red-100 text-red-700"
                            : l.status === "settled"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {l.status === "active"
                          ? "Activo"
                          : l.status === "overdue"
                          ? "Em Mora"
                          : l.status === "settled"
                          ? "Liquidado"
                          : l.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">
                    Nenhum crédito encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}