import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Info, Loader2, Send } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { formatCurrencyMT } from "../../lib/format";
import {
  clearPendingApplication,
  getPendingApplication,
  isPortalAuthenticated,
  portalFetch,
  setPendingApplication,
  type PendingApplication,
  type PortalCompany,
  type SimulationResult,
} from "../../lib/portal-api";

const FREQUENCY_OPTIONS = [
  { value: "mensal", label: "Mensal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "semanal", label: "Semanal" },
  { value: "diario", label: "Diário" },
];

/**
 * Simulador público do portal (Fase 2.2 — §5).
 * Entra como página inicial de `/credito`; cria pedidos SUBMITTED via token do portal.
 */
export default function PortalSimulatorPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<PortalCompany[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [periodMonths, setPeriodMonths] = useState("6");
  const [paymentFrequency, setPaymentFrequency] = useState("mensal");
  const [monthlyRatePercent, setMonthlyRatePercent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState<{ id: number; contractNo: string } | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

  useEffect(() => {
    portalFetch<{ companies: PortalCompany[] }>("/portal/companies", { auth: false })
      .then((data) => {
        setCompanies(data.companies);
        if (data.companies.length === 1) setCompanyId(data.companies[0].id);
      })
      .catch(() => setError("Não foi possível carregar as empresas disponíveis."));
  }, []);

  const submitApplication = async (payload: PendingApplication) => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await portalFetch<{ id: number; contractNo: string }>(
        "/portal/applications",
        { method: "POST", body: JSON.stringify(payload) },
      );
      clearPendingApplication();
      setSubmitted({ id: response.id, contractNo: response.contractNo });
      setResult(null);
    } catch (err) {
      clearPendingApplication();
      setSubmitError(err instanceof Error ? err.message : "Não foi possível submeter o pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  // Pedido pendente guardado antes do login: submete automaticamente ao voltar autenticado.
  useEffect(() => {
    const pending = getPendingApplication();
    if (!pending || !isPortalAuthenticated()) return;
    void submitApplication(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPayload = (): PendingApplication | null => {
    const cid = companyId !== "" ? Number(companyId) : companies.length === 1 ? companies[0].id : null;
    const value = Number(amount);
    const months = Number(periodMonths);
    if (!cid) {
      setError("Selecione a empresa para simular.");
      return null;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError("Indique um montante maior que zero.");
      return null;
    }
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      setError("Prazo inválido: use de 1 a 120 meses.");
      return null;
    }
    const payload: PendingApplication = {
      companyId: cid,
      amount: value,
      periodMonths: months,
      paymentFrequency,
    };
    const rateValue = monthlyRatePercent.trim();
    if (rateValue !== "") {
      const rateNum = Number(rateValue);
      if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
        setError("Taxa inválida: use um valor entre 0 e 100 (% ao mês).");
        return null;
      }
      payload.monthlyRatePercent = rateNum;
    }
    return payload;
  };

  const handleSimulate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitError("");
    setResult(null);
    setSubmitted(null);
    const payload = buildPayload();
    if (!payload) return;
    setLoading(true);
    try {
      const response = await portalFetch<SimulationResult>("/portal/simulate", {
        method: "POST",
        auth: false,
        body: JSON.stringify(payload),
      });
      setResult(response);
      setShowSchedule(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível calcular a simulação.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = () => {
    setError("");
    setSubmitError("");
    const payload = buildPayload();
    if (!payload) return;
    if (!isPortalAuthenticated()) {
      setPendingApplication(payload);
      navigate("/credito/aceder");
      return;
    }
    void submitApplication(payload);
  };

  const summary = result?.simulation.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Simulador de crédito</h1>
        <p className="mt-1 text-sm text-slate-500">
          Simule a sua prestação e, se gostar do resultado, submeta o pedido diretamente pelo portal.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {submitError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}
      {submitted && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Pedido <strong>#{submitted.id}</strong> ({submitted.contractNo}) submetido com sucesso para
            análise.
          </span>
          <Button size="sm" variant="outline" onClick={() => navigate("/credito/pedidos")}>
            Acompanhar pedido
          </Button>
        </div>
      )}

      <form
        onSubmit={handleSimulate}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {companies.length > 1 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <label htmlFor="portal-company" className="mb-1 block text-sm font-medium text-slate-700">
                Empresa
              </label>
              <select
                id="portal-company"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Selecione a empresa…</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="portal-amount" className="mb-1 block text-sm font-medium text-slate-700">
              Montante (MT)
            </label>
            <Input
              id="portal-amount"
              type="number"
              min={1}
              step="100"
              placeholder="Ex.: 10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="portal-period" className="mb-1 block text-sm font-medium text-slate-700">
              Prazo (meses)
            </label>
            <Input
              id="portal-period"
              type="number"
              min={1}
              max={120}
              value={periodMonths}
              onChange={(e) => setPeriodMonths(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="portal-frequency" className="mb-1 block text-sm font-medium text-slate-700">
              Frequência
            </label>
            <select
              id="portal-frequency"
              value={paymentFrequency}
              onChange={(e) => setPaymentFrequency(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="portal-rate" className="mb-1 block text-sm font-medium text-slate-700">
              Taxa mensal (%)
            </label>
            <Input
              id="portal-rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="Taxa padrão da empresa"
              value={monthlyRatePercent}
              onChange={(e) => setMonthlyRatePercent(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Simular
          </Button>
          {result && (
            <Button type="button" onClick={handleRequest} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Solicitar este crédito
            </Button>
          )}
          <span className="text-xs text-slate-500">
            Sem taxa escondida na simulação · resposta imediata
          </span>
        </div>
      </form>

      {result && summary && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                Prestação estimada
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {formatCurrencyMT(summary.firstPayment)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total de juros
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {formatCurrencyMT(summary.totalInterest)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total a pagar
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {formatCurrencyMT(summary.totalPayment)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nº de prestações
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">{summary.installments}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>
              Taxa: <strong>{result.simulation.rate}%</strong> ao mês
            </span>
            <span>
              1ª prestação:{" "}
              <strong>
                {new Date(`${result.simulation.dates.nextPayment}T00:00:00`).toLocaleDateString("pt-PT")}
              </strong>
            </span>
            <span>
              Vencimento final:{" "}
              <strong>
                {new Date(`${result.simulation.dates.maturity}T00:00:00`).toLocaleDateString("pt-PT")}
              </strong>
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{result.disclaimer}</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowSchedule((value) => !value)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 sm:px-6"
            >
              Cronograma de prestações
              {showSchedule ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showSchedule && (
              <div className="max-h-96 overflow-auto border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Nº</th>
                      <th className="px-4 py-2 font-semibold">Vencimento</th>
                      <th className="px-4 py-2 text-right font-semibold">Prestação</th>
                      <th className="px-4 py-2 text-right font-semibold">Capital</th>
                      <th className="px-4 py-2 text-right font-semibold">Juros</th>
                      <th className="px-4 py-2 text-right font-semibold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.simulation.schedule.map((row) => (
                      <tr key={row.installmentNo} className="text-slate-700">
                        <td className="px-4 py-2">{row.installmentNo}</td>
                        <td className="px-4 py-2">
                          {new Date(`${row.dueDate}T00:00:00`).toLocaleDateString("pt-PT")}
                        </td>
                        <td className="px-4 py-2 text-right">{formatCurrencyMT(row.paymentAmount)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrencyMT(row.principalAmount)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrencyMT(row.interestAmount)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrencyMT(row.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

