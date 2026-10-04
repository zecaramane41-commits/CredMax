import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Download, RefreshCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { apiFetch } from "../../lib/api";
import { downloadTextFile, toCsv } from "../../lib/download";
import { openCorporatePrintWindow } from "../../lib/print";

type AccountingAccount = {
  id: number;
  code: string;
  name: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  isActive: boolean;
};

type LedgerLine = {
  entryId: number;
  lineId: number;
  entryDate: string;
  eventType: string;
  description: string;
  referenceType: string | null;
  referenceId: number | null;
  loanId: number | null;
  createdByName: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
  runningBalance: number | null;
};

type LedgerResponse = {
  filters: { from: string; to: string; accountCode: string; eventType: string };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  lines: LedgerLine[];
  totals: {
    totalDebit: number;
    totalCredit: number;
    netMovement: number;
    cashIn: number;
    cashOut: number;
    netCash: number;
  };
  summaryByEvent: Array<{
    eventType: string;
    totalDebit: number;
    totalCredit: number;
    netMovement: number;
    cashIn: number;
    cashOut: number;
    netCash: number;
  }>;
  closingByPeriod: {
    weekly: Array<{
      periodStart: string;
      totalDebit: number;
      totalCredit: number;
      netMovement: number;
      cashIn: number;
      cashOut: number;
      netCash: number;
    }>;
    monthly: Array<{
      periodStart: string;
      totalDebit: number;
      totalCredit: number;
      netMovement: number;
      cashIn: number;
      cashOut: number;
      netCash: number;
    }>;
    yearly: Array<{
      periodStart: string;
      totalDebit: number;
      totalCredit: number;
      netMovement: number;
      cashIn: number;
      cashOut: number;
      netCash: number;
    }>;
  };
  summaryByAccount: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    accountClass: string;
    totalDebit: number;
    totalCredit: number;
    netMovement: number;
  }>;
};

type CompanyProfileResponse = {
  company: {
    name: string;
    legalName?: string;
    nuit?: string;
    phone?: string;
    email?: string;
    address?: string;
    logoUrl?: string;
  };
};

const money = new Intl.NumberFormat("pt-PT");

const eventTypeLabels: Record<string, string> = {
  desembolso: "Desembolso",
  pagamento: "Pagamento",
  mora: "Mora",
  estorno: "Estorno",
  abatimento: "Abatimento",
  capitalizacao: "Capitalizacao",
  perdao_mora: "Perdao de Mora",
  despesa: "Despesa",
  liquidacao_antecipada: "Liquidacao Antecipada",
  reestruturacao_contrato: "Reestruturacao",
};

const accountTypeLabels: Record<string, string> = {
  asset: "Ativo",
  liability: "Passivo",
  equity: "Capital Proprio",
  revenue: "Rendimento",
  expense: "Gasto",
};

function labelEventType(value: string) {
  const key = String(value || "").trim().toLowerCase();
  return eventTypeLabels[key] || value || "-";
}

function labelAccountType(value: string) {
  const key = String(value || "").trim().toLowerCase();
  return accountTypeLabels[key] || value || "-";
}

function defaultFromDate() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function AccountingPage() {
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [company, setCompany] = useState<CompanyProfileResponse["company"] | null>(null);
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(defaultToDate());
  const [accountCodeFilter, setAccountCodeFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [gotoPageInput, setGotoPageInput] = useState("1");
  const [accrualLoanId, setAccrualLoanId] = useState("");
  const pageSize = 100;

  const loadAccounts = useCallback(async () => {
    const data = await apiFetch<{ accounts: AccountingAccount[] }>("/accounting/accounts");
    setAccounts(data.accounts || []);
  }, []);

  const loadLedger = useCallback(
    async (nextPage = 1) => {
      setLoading(true);
      try {
        setError("");
        const params = new URLSearchParams({
          from: fromDate,
          to: toDate,
          accountCode: accountCodeFilter,
          eventType: eventTypeFilter,
          page: String(nextPage),
          pageSize: String(pageSize),
        });
        const data = await apiFetch<LedgerResponse>(`/accounting/ledger?${params.toString()}`);
        setLedger(data);
        setPage(data.pagination.page);
        setGotoPageInput(String(data.pagination.page));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao carregar razao contabil.");
        setLedger(null);
      } finally {
        setLoading(false);
      }
    },
    [accountCodeFilter, eventTypeFilter, fromDate, toDate],
  );

  useEffect(() => {
    loadAccounts().catch(() => setAccounts([]));
    loadLedger(1);
    apiFetch<CompanyProfileResponse>("/company/profile")
      .then((data) => setCompany(data.company))
      .catch(() => setCompany(null));
  }, [loadAccounts, loadLedger]);

  const pageTotals = useMemo(() => {
    return (ledger?.lines || []).reduce(
      (acc, line) => {
        acc.debit += line.debit;
        acc.credit += line.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );
  }, [ledger?.lines]);

  const ledgerTotals = ledger?.totals || {
    totalDebit: 0,
    totalCredit: 0,
    netMovement: 0,
    cashIn: 0,
    cashOut: 0,
    netCash: 0,
  };

  const handleApplyFilters = async () => {
    setSuccess("");
    setPage(1);
    await loadLedger(1);
  };

  const handleAccrueMora = async () => {
    try {
      setError("");
      setSuccess("");
      const payload = accrualLoanId.trim() ? { loanId: Number(accrualLoanId) } : {};
      const result = await apiFetch<{ message: string; postedEntries: number; totalAmount: number }>("/accounting/mora/accrue", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSuccess(`${result.message} Lancamentos: ${result.postedEntries}. Valor: ${money.format(result.totalAmount)} MT.`);
      await loadLedger(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao apropriar mora.");
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        accountCode: accountCodeFilter,
        eventType: eventTypeFilter,
        page: "1",
        pageSize: "500",
      });
      const data = await apiFetch<LedgerResponse>(`/accounting/ledger?${params.toString()}`);
      const rows = (data.lines || []).map((line) => ({
        data: line.entryDate,
        conta_codigo: line.accountCode,
        conta_nome: line.accountName,
        evento: line.eventType,
        descricao: line.description,
        debito: line.debit,
        credito: line.credit,
        saldo_corrente: line.runningBalance ?? "",
        usuario: line.createdByName,
        referencia: `${line.referenceType || ""} ${line.referenceId || ""}`.trim(),
      }));
      downloadTextFile("razao-contabil.csv", toCsv(rows), "text/csv;charset=utf-8");
      setSuccess("Razao contabil exportado em CSV.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao exportar CSV.");
    }
  };

  const handleExportPdf = async () => {
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        accountCode: accountCodeFilter,
        eventType: eventTypeFilter,
        page: "1",
        pageSize: "500",
      });
      const data = await apiFetch<LedgerResponse>(`/accounting/ledger?${params.toString()}`);
      const companyHtml = `
        <div class="header">
          ${company?.logoUrl ? `<img src="${company.logoUrl}" class="logo" alt="Logo" />` : `<div class="logo"></div>`}
          <div>
            <h1 class="title">${company?.name || "-"}</h1>
            <p class="sub"><strong>Razao Social:</strong> ${company?.legalName || "-"}</p>
            <p class="sub"><strong>NUIT:</strong> ${company?.nuit || "-"}</p>
            <p class="sub"><strong>Telefone:</strong> ${company?.phone || "-"}</p>
            <p class="sub"><strong>Email:</strong> ${company?.email || "-"}</p>
          </div>
        </div>
      `;
      const linesRows = (data.lines || [])
        .map(
          (line) =>
            `<tr>
              <td>${line.entryDate}</td>
              <td>${line.accountCode}</td>
              <td>${line.accountName}</td>
              <td>${line.eventType}</td>
              <td>${line.description}</td>
              <td>${money.format(line.debit)}</td>
              <td>${money.format(line.credit)}</td>
              <td>${line.runningBalance !== null ? money.format(line.runningBalance) : "-"}</td>
            </tr>`,
        )
        .join("");
      const summaryRows = (data.summaryByAccount || [])
        .map(
          (row) =>
            `<tr>
              <td>${row.accountCode}</td>
              <td>${row.accountName}</td>
              <td>${money.format(row.totalDebit)}</td>
              <td>${money.format(row.totalCredit)}</td>
              <td>${money.format(row.netMovement)}</td>
            </tr>`,
        )
        .join("");

      const html = `
        ${companyHtml}
        <div class="block">
          <h2>Razao Contabil por Empresa</h2>
          <p class="muted"><strong>Periodo:</strong> ${fromDate} ate ${toDate} | <strong>Conta:</strong> ${accountCodeFilter === "all" ? "Todas" : accountCodeFilter} | <strong>Evento:</strong> ${eventTypeFilter}</p>
          <p class="muted"><strong>Registos:</strong> ${data.pagination.total}</p>
        </div>
        <div class="block">
          <h3>Resumo por Conta</h3>
          <table>
            <thead><tr><th>Codigo</th><th>Conta</th><th>Debito</th><th>Credito</th><th>Movimento Liquido</th></tr></thead>
            <tbody>${summaryRows || "<tr><td colspan='5'>Sem dados.</td></tr>"}</tbody>
          </table>
        </div>
        <div class="block">
          <h3>Lancamentos</h3>
          <table>
            <thead><tr><th>Data</th><th>Conta</th><th>Nome</th><th>Evento</th><th>Descricao</th><th>Debito</th><th>Credito</th><th>Saldo</th></tr></thead>
            <tbody>${linesRows || "<tr><td colspan='8'>Sem lancamentos no filtro.</td></tr>"}</tbody>
          </table>
        </div>
      `;
      const ok = openCorporatePrintWindow({
        title: "Razao-Contabil",
        bodyHtml: html,
        company: company || undefined,
        browserControls: true,
      });
      setSuccess(ok ? "Razao contabil aberto para impressao/salvar em PDF." : "Nao foi possivel abrir janela de impressao.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao exportar PDF.");
    }
  };

  const pagination = ledger?.pagination || { page: 1, pageSize, total: 0, totalPages: 1 };
  const handleGoToPage = async () => {
    const n = Number(gotoPageInput);
    if (!Number.isInteger(n) || n < 1) return;
    await loadLedger(Math.min(n, pagination.totalPages));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contabilidade</h1>
          <p className="text-slate-600 mt-1">Partida dobrada e razao contabil por empresa</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => loadLedger(page)}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline" onClick={handleExportPdf}>
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF (Padrao)
          </Button>
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel (CSV)
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}
      {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">{success}</p>}

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="space-y-1">
          <Label>Data inicial</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Data final</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Conta contabil</Label>
          <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={accountCodeFilter} onChange={(e) => setAccountCodeFilter(e.target.value)}>
            <option value="all">Todas</option>
            {accounts.map((account) => (
              <option key={account.code} value={account.code}>{account.code} - {account.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Tipo de evento</Label>
          <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="desembolso">Desembolso</option>
            <option value="pagamento">Pagamento</option>
            <option value="mora">Mora</option>
            <option value="estorno">Estorno</option>
            <option value="abatimento">Abatimento</option>
            <option value="capitalizacao">Capitalizacao</option>
            <option value="perdao_mora">Perdao de Mora</option>
            <option value="despesa">Despesa</option>
            <option value="liquidacao_antecipada">Liquidacao Antecipada</option>
            <option value="reestruturacao_contrato">Reestruturacao</option>
          </select>
        </div>
        <div className="flex items-end gap-2 md:col-span-1">
          <Button onClick={handleApplyFilters} disabled={loading}>Aplicar filtros</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="space-y-1 md:w-72">
            <Label>Apropriar mora (loanId opcional)</Label>
            <Input type="number" min={1} placeholder="Ex: 123" value={accrualLoanId} onChange={(e) => setAccrualLoanId(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={handleAccrueMora}>Apropriar Mora</Button>
          </div>
          <p className="text-xs text-slate-500 md:ml-2">
            Use apenas quando precisar reconhecer mora em lote ou por credito especifico.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50">
          <p className="text-xs text-blue-700">Debitos (pagina)</p>
          <p className="text-2xl font-bold text-blue-900">{money.format(pageTotals.debit)} MT</p>
        </div>
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
          <p className="text-xs text-emerald-700">Creditos (pagina)</p>
          <p className="text-2xl font-bold text-emerald-900">{money.format(pageTotals.credit)} MT</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-600">Registos filtrados</p>
          <p className="text-2xl font-bold text-slate-900">{pagination.total}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-600">Debito (filtro total)</p>
          <p className="text-xl font-bold text-slate-900">{money.format(ledgerTotals.totalDebit)} MT</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-600">Credito (filtro total)</p>
          <p className="text-xl font-bold text-slate-900">{money.format(ledgerTotals.totalCredit)} MT</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-600">Movimento liquido</p>
          <p className="text-xl font-bold text-slate-900">{money.format(ledgerTotals.netMovement)} MT</p>
        </div>
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
          <p className="text-xs text-emerald-700">Entradas caixa</p>
          <p className="text-xl font-bold text-emerald-900">{money.format(ledgerTotals.cashIn)} MT</p>
        </div>
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50">
          <p className="text-xs text-rose-700">Saidas caixa</p>
          <p className="text-xl font-bold text-rose-900">{money.format(ledgerTotals.cashOut)} MT</p>
        </div>
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
          <p className="text-xs text-amber-700">Saldo caixa</p>
          <p className="text-xl font-bold text-amber-900">{money.format(ledgerTotals.netCash)} MT</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Entradas e Saidas por Tipo</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Debito</TableHead>
              <TableHead>Credito</TableHead>
              <TableHead>Entrada Caixa</TableHead>
              <TableHead>Saida Caixa</TableHead>
              <TableHead>Saldo Caixa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ledger?.summaryByEvent || []).map((row) => (
              <TableRow key={row.eventType}>
                <TableCell>{labelEventType(row.eventType)}</TableCell>
                <TableCell>{money.format(row.totalDebit)} MT</TableCell>
                <TableCell>{money.format(row.totalCredit)} MT</TableCell>
                <TableCell className="text-emerald-700">{money.format(row.cashIn)} MT</TableCell>
                <TableCell className="text-rose-700">{money.format(row.cashOut)} MT</TableCell>
                <TableCell className={row.netCash >= 0 ? "text-emerald-800 font-medium" : "text-rose-800 font-medium"}>
                  {money.format(row.netCash)} MT
                </TableCell>
              </TableRow>
            ))}
            {(ledger?.summaryByEvent || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-slate-500 py-6">
                  Sem movimentos por tipo de evento no filtro.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-3">Fecho Semanal</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saida</TableHead>
                <TableHead>Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ledger?.closingByPeriod?.weekly || []).map((row) => (
                <TableRow key={`w-${row.periodStart}`}>
                  <TableCell>{row.periodStart}</TableCell>
                  <TableCell>{money.format(row.cashIn)} MT</TableCell>
                  <TableCell>{money.format(row.cashOut)} MT</TableCell>
                  <TableCell>{money.format(row.netCash)} MT</TableCell>
                </TableRow>
              ))}
              {(ledger?.closingByPeriod?.weekly || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">
                    Sem dados semanais.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-3">Fecho Mensal</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saida</TableHead>
                <TableHead>Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ledger?.closingByPeriod?.monthly || []).map((row) => (
                <TableRow key={`m-${row.periodStart}`}>
                  <TableCell>{row.periodStart}</TableCell>
                  <TableCell>{money.format(row.cashIn)} MT</TableCell>
                  <TableCell>{money.format(row.cashOut)} MT</TableCell>
                  <TableCell>{money.format(row.netCash)} MT</TableCell>
                </TableRow>
              ))}
              {(ledger?.closingByPeriod?.monthly || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">
                    Sem dados mensais.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 mb-3">Fecho do Exercicio</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saida</TableHead>
                <TableHead>Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ledger?.closingByPeriod?.yearly || []).map((row) => (
                <TableRow key={`y-${row.periodStart}`}>
                  <TableCell>{row.periodStart}</TableCell>
                  <TableCell>{money.format(row.cashIn)} MT</TableCell>
                  <TableCell>{money.format(row.cashOut)} MT</TableCell>
                  <TableCell>{money.format(row.netCash)} MT</TableCell>
                </TableRow>
              ))}
              {(ledger?.closingByPeriod?.yearly || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">
                    Sem dados anuais.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-900">Razao Contabil</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Descricao</TableHead>
              <TableHead>Debito</TableHead>
              <TableHead>Credito</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Utilizador</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ledger?.lines || []).map((line) => (
              <TableRow key={line.lineId}>
                <TableCell>{line.entryDate}</TableCell>
                <TableCell className="font-mono">{line.accountCode}</TableCell>
                <TableCell>{line.accountName}</TableCell>
                <TableCell className="uppercase text-xs">{labelEventType(line.eventType)}</TableCell>
                <TableCell>{line.description}</TableCell>
                <TableCell className="text-blue-700 font-semibold">{money.format(line.debit)} MT</TableCell>
                <TableCell className="text-emerald-700 font-semibold">{money.format(line.credit)} MT</TableCell>
                <TableCell>{line.runningBalance !== null ? `${money.format(line.runningBalance)} MT` : "-"}</TableCell>
                <TableCell>{line.createdByName}</TableCell>
              </TableRow>
            ))}
            {(!ledger || ledger.lines.length === 0) && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-slate-500 py-6">
                  Sem lancamentos contabeis para o filtro selecionado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-600">Pagina {pagination.page} de {pagination.totalPages}</span>
          <div className="flex gap-2 items-center">
            <Input
              className="h-8 w-20"
              type="number"
              min={1}
              max={pagination.totalPages}
              value={gotoPageInput}
              onChange={(e) => setGotoPageInput(e.target.value)}
            />
            <Button size="sm" variant="outline" disabled={loading} onClick={handleGoToPage}>Ir</Button>
            <Button size="sm" variant="outline" disabled={pagination.page <= 1 || loading} onClick={() => loadLedger(Math.max(1, pagination.page - 1))}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => loadLedger(Math.min(pagination.totalPages, pagination.page + 1))}>Proxima</Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Resumo por Conta</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codigo</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Total Debito</TableHead>
              <TableHead>Total Credito</TableHead>
              <TableHead>Movimento Liquido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ledger?.summaryByAccount || []).map((row) => (
              <TableRow key={row.accountCode}>
                <TableCell className="font-mono">{row.accountCode}</TableCell>
                <TableCell>{row.accountClass || "-"}</TableCell>
                <TableCell>{labelAccountType(row.accountType)}</TableCell>
                <TableCell>{row.accountName}</TableCell>
                <TableCell>{money.format(row.totalDebit)} MT</TableCell>
                <TableCell>{money.format(row.totalCredit)} MT</TableCell>
                <TableCell>{money.format(row.netMovement)} MT</TableCell>
              </TableRow>
            ))}
            {(ledger?.summaryByAccount || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-slate-500 py-6">
                  Sem resumo contabil para o periodo.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
