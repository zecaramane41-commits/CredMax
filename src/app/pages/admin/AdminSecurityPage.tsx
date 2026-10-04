import { useCallback, useEffect, useState } from "react";
import { Lock, Shield, KeyRound, Eye, EyeOff, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

export default function AdminSecurityPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadSettings = useCallback(async () => {
    try { setLoading(true); const data = await apiFetch<{ settings: Record<string, string> }>("/admin/settings"); setSettings(data.settings || {}); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) { navigate("/", { replace: true }); return; }
    void loadSettings();
  }, [isCentralAdmin, loadSettings, navigate]);

  const updateSetting = (key: string, value: string) => setSettings(s => ({ ...s, [key]: value }));

  const saveSettings = async () => {
    try { setSaving(true); await apiFetch("/admin/settings", { method: "PUT", body: JSON.stringify({ settings }) }); setMessage("Configurações salvas."); } catch {} finally { setSaving(false); }
  };

  const SECURITY_KEYS = [
    { key: "maintenance_mode", label: "Modo de Manutenção", type: "select", options: [{ value: "true", label: "Ativo" }, { value: "false", label: "Inativo" }], desc: "Bloqueia o acesso de todas as empresas ao sistema." },
    { key: "maintenance_message", label: "Mensagem de Manutenção", type: "text", desc: "Mensagem exibida durante a manutenção." },
  ];
  const SESSION_KEYS = [
    { key: "auth_session_timeout_min", label: "Timeout Padrão (min)", type: "number", desc: "Tempo máximo de inatividade antes de expirar a sessão." },
    { key: "auth_password_min_length", label: "Comprimento Mínimo da Senha", type: "number", desc: "Número mínimo de caracteres para senhas." },
    { key: "auth_password_require_upper", label: "Exigir Maiúsculas", type: "select", options: [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }], desc: "Exige pelo menos uma letra maiúscula na senha." },
    { key: "auth_password_require_lower", label: "Exigir Minúsculas", type: "select", options: [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }], desc: "Exige pelo menos uma letra minúscula na senha." },
    { key: "auth_password_require_number", label: "Exigir Números", type: "select", options: [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }], desc: "Exige pelo menos um número na senha." },
    { key: "auth_password_require_special", label: "Exigir Caracteres Especiais", type: "select", options: [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }], desc: "Exige pelo menos um caractere especial na senha." },
    { key: "auth_password_expiry_days", label: "Expiração de Senha (dias)", type: "number", desc: "Após quantos dias a senha expira (0 = nunca)." },
    { key: "auth_max_login_attempts", label: "Tentativas Máximas de Login", type: "number", desc: "Número de tentativas falhas antes de bloquear a conta." },
    { key: "auth_lockout_minutes", label: "Bloqueio (minutos)", type: "number", desc: "Tempo de bloqueio após exceder tentativas." },
    { key: "auth_enforce_mfa", label: "Exigir Autenticação 2FA", type: "select", options: [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }], desc: "Força autenticação em dois fatores para todos os utilizadores." },
  ];
  const PLAN_KEYS = [
    { key: "plan_monthly_price", label: "Preço Plano Mensal (MT)", type: "number", desc: "Valor da assinatura mensal." },
    { key: "plan_quarterly_price", label: "Preço Plano Trimestral (MT)", type: "number", desc: "Valor da assinatura trimestral." },
    { key: "plan_annual_price", label: "Preço Plano Anual (MT)", type: "number", desc: "Valor da assinatura anual." },
    { key: "plan_grace_days", label: "Dias de Carência", type: "number", desc: "Dias após vencimento antes de bloquear o acesso." },
  ];

  if (loading) return <div className="flex items-center justify-center h-48"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div><h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center"><Lock className="w-5 h-5 text-white" /></div>Segurança</h1><p className="text-slate-500 mt-1">Gestão de permissões, sessões, políticas de senha e 2FA.</p></div>
      {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700"><CheckCircle className="w-4 h-4 inline mr-1" />{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Shield className="w-5 h-5 text-red-500" /> Políticas de Senha & Sessão</h3>
          {SESSION_KEYS.map(k => (
            <div key={k.key} className="space-y-1">
              <Label>{k.label}</Label>
              {k.type === "select" ? (
                <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={settings[k.key] || "false"} onChange={(e) => updateSetting(k.key, e.target.value)}>
                  {k.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" type={k.type} value={settings[k.key] || ""} onChange={(e) => updateSetting(k.key, e.target.value)} />
              )}
              <p className="text-xs text-slate-500">{k.desc}</p>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-500" /> Planos e Assinaturas</h3>
            {PLAN_KEYS.map(k => (
              <div key={k.key} className="space-y-1">
                <Label>{k.label}</Label>
                <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" type="number" value={settings[k.key] || ""} onChange={(e) => updateSetting(k.key, e.target.value)} />
                <p className="text-xs text-slate-500">{k.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Lock className="w-5 h-5 text-red-500" /> Manutenção</h3>
            {SECURITY_KEYS.map(k => (
              <div key={k.key} className="space-y-1">
                <Label>{k.label}</Label>
                {k.type === "select" ? (
                  <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={settings[k.key] || "false"} onChange={(e) => updateSetting(k.key, e.target.value)}>
                    {k.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" value={settings[k.key] || ""} onChange={(e) => updateSetting(k.key, e.target.value)} />
                )}
                <p className="text-xs text-slate-500">{k.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void saveSettings()} disabled={saving} className="bg-gradient-to-r from-red-500 to-rose-600">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}