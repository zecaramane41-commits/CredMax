import { useCallback, useEffect, useState } from "react";
import { Settings, RefreshCw, CheckCircle, Mail, MessageSquare, Globe } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

export default function AdminSettingsPage() {
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

  const update = (key: string, value: string) => setSettings(s => ({ ...s, [key]: value }));

  const save = async () => {
    try { setSaving(true); await apiFetch("/admin/settings", { method: "PUT", body: JSON.stringify({ settings }) }); setMessage("Configurações salvas."); } catch {} finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-48"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div><h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center"><Settings className="w-5 h-5 text-white" /></div>Configurações</h1><p className="text-slate-500 mt-1">Parâmetros gerais da plataforma: notificações, email, SMS e personalização.</p></div>
      {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700"><CheckCircle className="w-4 h-4 inline mr-1" />{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Mail className="w-5 h-5 text-blue-500" /> Configuração de Email (SMTP)</h3>
          {[
            { key: "smtp_host", label: "Servidor SMTP", type: "text" },
            { key: "smtp_port", label: "Porta SMTP", type: "number" },
            { key: "smtp_user", label: "Usuário SMTP", type: "text" },
            { key: "smtp_pass", label: "Senha SMTP", type: "text" },
            { key: "smtp_from", label: "Email Remetente", type: "email" },
          ].map(k => (
            <div key={k.key} className="space-y-1">
              <Label>{k.label}</Label>
              <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" type={k.type} value={settings[k.key] || ""} onChange={(e) => update(k.key, e.target.value)} />
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-teal-500" /> Configuração de SMS</h3>
            <div className="space-y-1">
              <Label>Provedor SMS</Label>
              <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={settings.sms_provider || "console"} onChange={(e) => update("sms_provider", e.target.value)}>
                <option value="console">Console (dev)</option>
                <option value="twilio">Twilio</option>
              </select>
            </div>
            {["sms_api_key", "sms_sender_id"].map(k => (
              <div key={k} className="space-y-1">
                <Label>{k === "sms_api_key" ? "Chave API SMS" : "ID do Remetente"}</Label>
                <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" type="text" value={settings[k] || ""} onChange={(e) => update(k, e.target.value)} />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Globe className="w-5 h-5 text-purple-500" /> Personalização da Plataforma</h3>
            {[
              { key: "platform_name", label: "Nome da Plataforma", type: "text" },
              { key: "platform_logo_url", label: "URL do Logotipo", type: "text" },
            ].map(k => (
              <div key={k.key} className="space-y-1">
                <Label>{k.label}</Label>
                <input className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" type={k.type} value={settings[k.key] || ""} onChange={(e) => update(k.key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving} className="bg-gradient-to-r from-slate-600 to-slate-800">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Settings className="w-4 h-4 mr-2" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}