import { useEffect, useState } from "react";
import { AlertTriangle, Clock3, Percent, Save, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchApprovalPolicy, updateApprovalPolicy, type ApprovalPolicy } from "../../lib/charges";

const defaultPolicy: ApprovalPolicy = {
  analystLimit: 50000,
  managerLimit: 200000,
  finalLimit: 1000000000,
  minScore: 600,
  maxDebt: 80000,
  defaultDailyPenaltyRate: 2,
  defaultAdministrativeFeeRate: 2,
  defaultInterestRate: 30,
  maxLoanTermMonths: 24,
  moraMonthlyEnabled: true,
  moraWeeklyEnabled: false,
  moraDailyEnabled: false,
  blockAlertStatus: true,
};

function getMode(policy: ApprovalPolicy) {
  if (policy.moraDailyEnabled) return "daily";
  if (policy.moraWeeklyEnabled) return "weekly";
  if (policy.moraMonthlyEnabled) return "monthly";
  return "none";
}

export default function PenalizacoesPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.parametros.negocio");
  const [policy, setPolicy] = useState<ApprovalPolicy>(defaultPolicy);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    let mounted = true;
    fetchApprovalPolicy()
      .then((data) => {
        if (mounted) setPolicy(data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Nao foi possivel carregar a politica de mora.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [canManage]);

  if (!canManage) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;
  }

  const mode = getMode(policy);

  const setMode = (nextMode: string) => {
    setPolicy({
      ...policy,
      moraDailyEnabled: nextMode === "daily",
      moraWeeklyEnabled: nextMode === "weekly",
      moraMonthlyEnabled: nextMode === "monthly",
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await updateApprovalPolicy(policy);
      setPolicy(saved);
      setSuccess("Política de mora guardada com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel guardar a politica de mora.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Penalizações & Mora</h1>
            <p className="text-sm text-slate-500">Configure quando e quanto cobrar por atraso.</p>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "A guardar..." : "Guardar alterações"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
          A carregar política de mora...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { key: "daily", title: "Mora diária", description: "Aplica a taxa por cada dia de atraso.", icon: Clock3 },
              { key: "weekly", title: "Mora semanal", description: "Agrupa o atraso em períodos de 7 dias.", icon: Clock3 },
              { key: "monthly", title: "Mora mensal", description: "Aplica a regra mensal definida pela política.", icon: Clock3 },
            ].map(({ key, title, description, icon: Icon }) => {
              const selected = mode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`text-left rounded-xl border p-5 transition ${selected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Icon className={`w-5 h-5 ${selected ? "text-indigo-600" : "text-slate-400"}`} />
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${selected ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                      {selected ? "Selecionada" : "Inativa"}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-800">{title}</h3>
                  <p className="text-sm text-slate-500 mt-1">{description}</p>
                </button>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 rounded-lg bg-rose-50"><Percent className="w-5 h-5 text-rose-600" /></div>
              <div>
                <h2 className="font-semibold text-slate-800">Taxa de mora</h2>
                <p className="text-sm text-slate-500">Esta taxa é usada pelo cálculo de mora dos créditos da empresa.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Taxa de mora diária (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={policy.defaultDailyPenaltyRate}
                  onChange={(e) => setPolicy({ ...policy, defaultDailyPenaltyRate: Number(e.target.value) })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-400">Exemplo: 2 significa 2% por dia sobre o valor em mora.</span>
              </label>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Modo atual</p>
                <p className="text-lg font-semibold text-slate-800 mt-1">
                  {mode === "daily" ? "Diário" : mode === "weekly" ? "Semanal" : mode === "monthly" ? "Mensal" : "Desativado"}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {mode === "none" ? "Nenhuma regra de mora será aplicada." : "Apenas um modo fica ativo para evitar cobrança duplicada."}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h3 className="font-semibold text-amber-900">Regra de segurança</h3>
            <p className="text-sm text-amber-800 mt-1">
              A mora é calculada sobre valores efetivamente vencidos e continua sujeita ao estado e às regras do crédito.
              Alterar esta parametrização não altera contratos já liquidados.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
