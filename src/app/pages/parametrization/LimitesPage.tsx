import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Gauge,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import {
  fetchApprovalPolicy,
  updateApprovalPolicy,
  type ApprovalPolicy,
} from "../../lib/charges";

type LimitFieldProps = {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  min?: number;
  step?: number;
};

function LimitField({
  label,
  description,
  value,
  onChange,
  suffix,
  min = 0,
  step = 1,
}: LimitFieldProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
      <label className="block text-xs font-bold text-slate-700">{label}</label>
      <div className="relative">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full h-11 px-3 pr-14 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
          {suffix}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}

export default function LimitesPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.parametros.negocio") || user?.role === "admin";

  const [policy, setPolicy] = useState<ApprovalPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [analystLimit, setAnalystLimit] = useState("");
  const [managerLimit, setManagerLimit] = useState("");
  const [finalLimit, setFinalLimit] = useState("");
  const [maxDebt, setMaxDebt] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxLoanTermMonths, setMaxLoanTermMonths] = useState("");
  const [blockAlertStatus, setBlockAlertStatus] = useState(true);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApprovalPolicy();
      setPolicy(data);
      setAnalystLimit(String(data.analystLimit ?? 50000));
      setManagerLimit(String(data.managerLimit ?? 200000));
      setFinalLimit(String(data.finalLimit ?? 1000000000));
      setMaxDebt(String(data.maxDebt ?? 80000));
      setMinScore(String(data.minScore ?? 600));
      setMaxLoanTermMonths(String(data.maxLoanTermMonths ?? 24));
      setBlockAlertStatus(Boolean(data.blockAlertStatus));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os limites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void loadPolicy();
  }, [canManage, loadPolicy]);

  const handleSave = async () => {
    if (!policy) return;

    const analyst = Number(analystLimit);
    const manager = Number(managerLimit);
    const final = Number(finalLimit);
    const debt = Number(maxDebt);
    const score = Number(minScore);
    const term = Number(maxLoanTermMonths);

    if (![analyst, manager, final].every((value) => Number.isFinite(value) && value > 0)) {
      toast.error("As três alçadas de aprovação devem ser maiores que zero.");
      return;
    }
    if (!(analyst <= manager && manager <= final)) {
      toast.error("A ordem das alçadas deve ser Analista ≤ Gestor ≤ Final.");
      return;
    }
    if (!Number.isFinite(debt) || debt < 0) {
      toast.error("O limite máximo de dívida é inválido.");
      return;
    }
    if (!Number.isInteger(score) || score < 0 || score > 1000) {
      toast.error("O score mínimo deve estar entre 0 e 1000.");
      return;
    }
    if (!Number.isInteger(term) || term < 1 || term > 120) {
      toast.error("O prazo máximo deve estar entre 1 e 120 meses.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateApprovalPolicy({
        ...policy,
        analystLimit: analyst,
        managerLimit: manager,
        finalLimit: final,
        maxDebt: debt,
        minScore: score,
        maxLoanTermMonths: term,
        blockAlertStatus,
      });
      setPolicy(updated);
      toast.success("Limites operacionais atualizados com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao guardar os limites.");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>Sem permissão para gerir os limites operacionais.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg text-white">
            <Gauge className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Limites Operacionais</h1>
            <p className="text-sm text-slate-500">
              Alçadas de aprovação, exposição ao risco e prazo máximo de crédito
            </p>
          </div>
        </div>
        <button
          onClick={() => void loadPolicy()}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <>
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-start gap-3 pb-4 border-b border-slate-100">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600"><Users className="w-5 h-5" /></div>
              <div>
                <h2 className="font-bold text-slate-900">Alçadas de Aprovação</h2>
                <p className="text-xs text-slate-500 mt-1">
                  O sistema exige que cada etapa respeite a alçada configurada para o valor solicitado.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <LimitField
                label="Limite do Analista"
                description="Valor máximo que o perfil de analista pode aprovar na sua etapa."
                value={analystLimit}
                onChange={setAnalystLimit}
                suffix="MT"
                step={1000}
              />
              <LimitField
                label="Limite do Gestor"
                description="Valor máximo que o gestor pode aprovar na etapa intermédia."
                value={managerLimit}
                onChange={setManagerLimit}
                suffix="MT"
                step={1000}
              />
              <LimitField
                label="Limite de Aprovação Final"
                description="Teto da aprovação final configurado para a empresa."
                value={finalLimit}
                onChange={setFinalLimit}
                suffix="MT"
                step={1000}
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              A ordem obrigatória é Analista ≤ Gestor ≤ Aprovação Final. O backend também valida esta regra.
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-start gap-3 pb-4 border-b border-slate-100">
              <div className="p-2 rounded-lg bg-rose-50 text-rose-600"><Target className="w-5 h-5" /></div>
              <div>
                <h2 className="font-bold text-slate-900">Limites de Risco e Exposição</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Estes parâmetros participam da avaliação de risco antes da aprovação do crédito.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <LimitField
                label="Dívida Máxima do Cliente"
                description="Acima deste valor, o cliente entra em bloqueio de risco para nova aprovação."
                value={maxDebt}
                onChange={setMaxDebt}
                suffix="MT"
                step={1000}
              />
              <LimitField
                label="Score Mínimo"
                description="Score mínimo aceito na avaliação automática de risco."
                value={minScore}
                onChange={setMinScore}
                suffix="/1000"
                step={1}
              />
              <LimitField
                label="Prazo Máximo de Crédito"
                description="Prazo máximo permitido pela política da empresa para novos créditos."
                value={maxLoanTermMonths}
                onChange={setMaxLoanTermMonths}
                suffix="meses"
                min={1}
                step={1}
              />
            </div>

            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Bloquear clientes em estado de alerta</p>
                  <p className="text-xs text-amber-800 mt-1">
                    Quando ativo, um cliente marcado como alerta não pode avançar automaticamente na aprovação.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={blockAlertStatus}
                onChange={(event) => setBlockAlertStatus(event.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
              />
            </div>
          </section>

          <section className="bg-slate-900 rounded-2xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CalendarClock className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Configuração por empresa</p>
                <p className="text-xs text-slate-300 mt-1">
                  Os limites são persistidos na política da empresa selecionada e usados pela esteira de crédito.
                </p>
              </div>
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={saving || !policy}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "A guardar..." : "Guardar Limites"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
