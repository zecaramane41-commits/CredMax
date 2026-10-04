import { useEffect, useMemo, useState } from "react";
import { FileCheck, Building, Receipt, Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../lib/api";

type CompanyProfile = {
  company: {
    name: string;
    nuit: string;
    email: string;
    phone: string;
    authEnforceMfa: boolean;
    privacyMaskSensitiveData: boolean;
    isActive: boolean;
  };
};

type DashboardResponse = {
  kpis: { delayedLoans: number; delayedBalance: number; recoveryRate: number };
};

export default function CompliancePage() {
  const [company, setCompany] = useState<CompanyProfile["company"] | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse["kpis"] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiFetch<CompanyProfile>("/company/profile"), apiFetch<DashboardResponse>("/dashboard/summary")])
      .then(([companyData, dashData]) => {
        setCompany(companyData.company);
        setDashboard(dashData.kpis);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar conformidade."));
  }, []);

  const checks = useMemo(() => {
    if (!company || !dashboard) return [];
    return [
      { area: "Banco de Mocambique - Empresa ativa", ok: company.isActive },
      { area: "Cadastro fiscal (NUIT)", ok: Boolean(company.nuit) },
      { area: "Contacto institucional", ok: Boolean(company.email || company.phone) },
      { area: "Recuperacao da carteira >= 70%", ok: dashboard.recoveryRate >= 70 },
      { area: "Atrasos criticos controlados", ok: dashboard.delayedLoans < 10 },
      { area: "Autenticacao reforcada (MFA)", ok: company.authEnforceMfa },
      { area: "Privacidade configurada", ok: typeof company.privacyMaskSensitiveData === "boolean" },
    ];
  }, [company, dashboard]);

  const actionPlan = useMemo(() => {
    if (!company || !dashboard) return [];
    const actions: Array<{ id: string; title: string; priority: "alta" | "media" | "baixa" }> = [];
    if (!company.nuit) {
      actions.push({ id: "fiscal", title: "Completar cadastro fiscal (NUIT) da empresa.", priority: "alta" });
    }
    if (!company.email && !company.phone) {
      actions.push({ id: "contact", title: "Definir contacto institucional (email e/ou telefone).", priority: "media" });
    }
    if (!company.authEnforceMfa) {
      actions.push({ id: "mfa", title: "Ativar MFA obrigatorio para reduzir risco de acesso indevido.", priority: "alta" });
    }
    if (dashboard.recoveryRate < 70) {
      actions.push({ id: "recovery", title: "Melhorar taxa de recuperacao da carteira para pelo menos 70%.", priority: "alta" });
    }
    if (dashboard.delayedLoans >= 10) {
      actions.push({ id: "delayed", title: "Reduzir contratos em atraso critico e reforcar cobranca preventiva.", priority: "media" });
    }
    return actions;
  }, [company, dashboard]);

  const okCount = checks.filter((c) => c.ok).length;
  const complianceRate = checks.length ? Math.round((okCount / checks.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Conformidade e Regulacao</h1>
        <p className="text-slate-600 mt-1">Indicadores reais por empresa ativa</p>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Building className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Regras Institucionais</h2>
          </div>
          <div className="space-y-3">
            {checks.slice(0, 4).map((item) => (
              <div key={item.area} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-700">{item.area}</span>
                {item.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <Receipt className="w-6 h-6 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Regras Operacionais</h2>
          </div>
          <div className="space-y-3">
            {checks.slice(4).map((item) => (
              <div key={item.area} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-700">{item.area}</span>
                {item.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-4">Indicadores de Conformidade</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: "Conformidade Geral", value: `${complianceRate}%`, icon: Building },
            { label: "Conformidade Fiscal", value: company?.nuit ? "100%" : "0%", icon: Receipt },
            { label: "Privacidade e Acesso", value: company ? (company.authEnforceMfa ? "100%" : "70%") : "0%", icon: Shield },
          ].map((indicator) => {
            const Icon = indicator.icon;
            return (
              <div key={indicator.label} className="p-4 bg-white/10 rounded-lg backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-5 h-5 text-emerald-400" />
                  <p className="text-sm text-slate-300">{indicator.label}</p>
                </div>
                <p className="text-3xl font-bold text-white">{indicator.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-900 mb-3">Plano de Acao de Conformidade</h3>
        {actionPlan.length === 0 ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            Sem pendencias criticas no momento. Indicadores dentro do nivel esperado.
          </p>
        ) : (
          <div className="space-y-2">
            {actionPlan.map((action) => (
              <div key={action.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                <p className="text-sm text-slate-700">{action.title}</p>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    action.priority === "alta"
                      ? "bg-red-100 text-red-700"
                      : action.priority === "media"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  Prioridade {action.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <FileCheck className="w-5 h-5 text-slate-700" />
          <h3 className="font-semibold text-slate-900">Empresa em contexto</h3>
        </div>
        <p className="text-sm text-slate-700">
          {company ? `${company.name} | NUIT: ${company.nuit || "-"} | Email: ${company.email || "-"} | Telefone: ${company.phone || "-"}` : "Sem empresa ativa."}
        </p>
      </div>
    </div>
  );
}
