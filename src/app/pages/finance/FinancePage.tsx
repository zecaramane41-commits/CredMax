import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, ShieldAlert, Wallet } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { formatCurrencyMT } from "../../lib/format";
import {
  closeFinanceDay,
  fetchFinanceAudit,
  fetchFinanceHistory,
  fetchFinanceSessionState,
  openFinanceDay,
  registerFinanceReinforcement,
  type FinanceSessionAuditRecord,
  type FinanceDaySession,
  type FinanceSessionState,
} from "../../lib/finance-session";
import { clearAuth, getActiveCompanyId, getUser } from "../../lib/auth";
import { useRealtimeSubscription } from "../../lib/realtime";

function round2(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export default function FinancePage() {
  const user = getUser();
  const activeCompanyId = getActiveCompanyId();
  const selectedCompanyId = activeCompanyId || (user?.companyId ?? null);
  const isCentralAdmin = Boolean(user?.role === "admin" && !user?.companyId);
  const isCompanyAdmin = Boolean(user?.role === "admin" && user?.companyId);
  const canReopenFinanceDay = Boolean(
    isCentralAdmin || (isCompanyAdmin && Number(user?.companyId) === Number(selectedCompanyId)),
  );
  const [state, setState] = useState<FinanceSessionState | null>(null);
  const [history, setHistory] = useState<FinanceDaySession[]>([]);
  const [audit, setAudit] = useState<FinanceSessionAuditRecord[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [openingCapital, setOpeningCapital] = useState("0");
  const [reinforcement, setReinforcement] = useState("0");
  const [openingBalance, setOpeningBalance] = useState("");
  const [reinforcementAmount, setReinforcementAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [currentState, historyData, auditData] = await Promise.all([
      fetchFinanceSessionState(),
      fetchFinanceHistory(12),
      fetchFinanceAudit(30),
    ]);
    setState(currentState);
    setHistory(historyData.sessions || []);
    setAudit(auditData.records || []);
    setOpeningBalance(String(currentState.previousClosingBalance || 0));
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar financeiro."));
  }, []);

  useRealtimeSubscription(
    ["FINANCE_SESSION_CHANGED", "CAIXA_MUTATION", "LOAN_DISBURSED", "REPAYMENT_APPLIED"],
    () => {
      load().catch(() => {});
    },
  );

  const financeNumbers = useMemo(() => {
    if (!state) {
      return {
        disbursements: 0,
        reimbursements: 0,
        expenses: 0,
      };
    }
    return state.todayFlows;
  }, [state]);

  const reopeningSameDay = Boolean(state?.session && state.session.status !== "open");
  const canOpenFinanceDay = !reopeningSameDay || canReopenFinanceDay;

  const handleOpen = async () => {
    if (reopeningSameDay && !canReopenFinanceDay) {
      setError("Reabertura no mesmo dia permitida apenas para Admin da empresa ou Central de Empresas.");
      return;
    }
    let reopenReason = "";
    if (reopeningSameDay) {
      const confirmed = window.confirm(
        "O dia ja foi fechado. Deseja realmente reabrir? Qualquer alteracao feita sera notada neste dia e o fecho sera recalculado com as novas mudancas.",
      );
      if (!confirmed) return;
      reopenReason = String(window.prompt("Informe o motivo da reabertura:") || "").trim();
      if (!reopenReason) {
        setError("Informe o motivo da reabertura para continuar.");
        return;
      }
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await openFinanceDay({
        openingBalance: round2(Number(openingBalance || 0)),
        openingCapital: round2(Number(openingCapital || 0)),
        reinforcement: round2(Number(reinforcement || 0)),
        confirmReopen: reopeningSameDay,
        reopenReason: reopeningSameDay ? reopenReason : undefined,
        notesOpen: reopeningSameDay ? reopenReason : undefined,
      });
      window.location.reload();
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao abrir dia.");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await closeFinanceDay({});
      setMessage(response.message);
      if (response.shouldLogout) {
        clearAuth();
        window.location.href = "/login";
        return;
      }
      setState(response.state);
      const historyData = await fetchFinanceHistory(12);
      setHistory(historyData.sessions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao fechar dia.");
    } finally {
      setBusy(false);
    }
  };

  const handleReinforcement = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const amount = round2(Number(reinforcementAmount || 0));
      const response = await registerFinanceReinforcement({ amount });
      setState(response.state);
      setReinforcementAmount("");
      setMessage(response.message);
      const [historyData, auditData] = await Promise.all([fetchFinanceHistory(12), fetchFinanceAudit(30)]);
      setHistory(historyData.sessions || []);
      setAudit(auditData.records || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registar reforco.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Financeiro</h1>
        <p className="text-slate-600 mt-1">Abertura e fecho diario do sistema com controle de saldo operacional.</p>
      </div>

      {message && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">{message}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Data Operacional</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{state?.businessDate || "-"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Saldo Disponivel</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrencyMT(state?.availableBalance || 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Reembolsos do Dia</p>
          <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrencyMT(financeNumbers.reimbursements)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Saidas do Dia</p>
          <p className="mt-2 text-xl font-semibold text-amber-700">
            {formatCurrencyMT(financeNumbers.disbursements + financeNumbers.expenses)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Estado do Dia</h2>
          {!state?.session || state?.session?.status !== "open" ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Dia financeiro fechado. Para operar o sistema, realize a abertura.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Saldo de Abertura</Label>
                  <Input type="number" step="0.01" value={openingBalance} readOnly />
                  <p className="mt-1 text-xs text-slate-500">Automatico: saldo final do dia anterior.</p>
                </div>
                <div>
                  <Label>Capital Inicial</Label>
                  <Input type="number" step="0.01" value={openingCapital} onChange={(e) => setOpeningCapital(e.target.value)} disabled={!canOpenFinanceDay} />
                </div>
                <div>
                  <Label>Reforco Inicial</Label>
                  <Input type="number" step="0.01" value={reinforcement} onChange={(e) => setReinforcement(e.target.value)} disabled={!canOpenFinanceDay} />
                </div>
              </div>
              {canOpenFinanceDay ? (
                <Button onClick={handleOpen} disabled={busy}>
                  <Wallet className="w-4 h-4 mr-2" />
                  Abrir Dia Financeiro
                </Button>
              ) : (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Reabertura no mesmo dia disponivel apenas para Admin da empresa ou Central de Empresas.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                Dia aberto com sucesso. Operacoes financeiras liberadas.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                <p>Saldo abertura: <strong>{formatCurrencyMT(state.session.openingBalance)}</strong></p>
                <p>Capital inicial: <strong>{formatCurrencyMT(state.session.openingCapital)}</strong></p>
                <p>Reforcos acumulados: <strong>{formatCurrencyMT(state.session.reinforcementTotal)}</strong></p>
                <p>Saldo disponivel: <strong>{formatCurrencyMT(state.availableBalance)}</strong></p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label>Adicionar Reforco</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={reinforcementAmount}
                    onChange={(e) => setReinforcementAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" variant="secondary" onClick={handleReinforcement} disabled={busy}>
                    Registar Reforco
                  </Button>
                </div>
              </div>
              <Button variant="destructive" onClick={handleClose} disabled={busy}>
                <Lock className="w-4 h-4 mr-2" />
                Fechar Dia e Sair
              </Button>
            </div>
          )}
          <p className="text-xs text-slate-500">{state?.formula}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Historico de Fechos</h2>
          <div className="space-y-2 max-h-[340px] overflow-y-auto">
            {history.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{item.businessDate}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      item.status === "open"
                        ? "bg-blue-100 text-blue-700"
                        : item.status === "auto_closed"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {item.status === "open" ? <ShieldAlert className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {item.status === "open" ? "Aberto" : item.status === "auto_closed" ? "Fecho Auto" : "Fechado"}
                  </span>
                </div>
                <p className="text-slate-600 mt-1">Saldo: {formatCurrencyMT(item.closingBalance ?? item.openingBalance)}</p>
              </div>
            ))}
            {history.length === 0 && <p className="text-sm text-slate-500">Sem historico de sessao financeira.</p>}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-200">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Auditoria de Sessao</h3>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {audit.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">
                      {item.actionType === "open"
                        ? "Abertura"
                        : item.actionType === "reopen"
                          ? "Reabertura"
                          : item.actionType === "close"
                            ? "Fecho"
                            : item.actionType === "auto_close"
                              ? "Fecho Automatico"
                              : "Reforco"}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("pt-PT")}</p>
                  </div>
                  <p className="text-slate-600 mt-1">Data operacional: {item.businessDate}</p>
                  <p className="text-slate-600">Operador: {item.actorName || "Sistema"}</p>
                  {item.note ? <p className="text-slate-700 mt-1">{item.note}</p> : null}
                </div>
              ))}
              {audit.length === 0 && <p className="text-sm text-slate-500">Sem registos de auditoria.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
