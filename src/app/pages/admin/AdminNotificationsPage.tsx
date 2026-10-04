import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Plus, Send, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

export default function AdminNotificationsPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", notificationType: "general", severity: "info", targetCompanies: "all" });
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  const loadNotifications = useCallback(async () => {
    try { setLoading(true); const data = await apiFetch<{ notifications: any[] }>(`/admin/notifications?type=${typeFilter}`); setNotifications(data.notifications || []); } catch {} finally { setLoading(false); }
  }, [typeFilter]);

  useEffect(() => {
    if (!isCentralAdmin) { navigate("/", { replace: true }); return; }
    void loadNotifications();
  }, [isCentralAdmin, loadNotifications, navigate]);

  const createNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    try { setSaving(true); await apiFetch("/admin/notifications", { method: "POST", body: JSON.stringify(form) }); setMessage("Notificação criada."); setShowCreate(false); await loadNotifications(); } catch {} finally { setSaving(false); }
  };

  const sendNotification = async (id: number) => {
    try { await apiFetch(`/admin/notifications/${id}/send`, { method: "PUT" }); setMessage("Notificação enviada."); await loadNotifications(); } catch {}
  };

  const TYPE_MAP: Record<string, string> = { general: "Geral", maintenance: "Manutenção", institutional: "Institucional", renewal: "Renovação", automatic: "Automática" };
  const SEVERITY_MAP: Record<string, string> = { info: "Info", warning: "Aviso", error: "Erro" };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-white" /></div>Notificações</h1><p className="text-slate-500 mt-1">Envio de avisos, comunicados e notificações em massa para as empresas.</p></div>
        <Button onClick={() => setShowCreate(true)} className="bg-gradient-to-r from-pink-500 to-rose-600"><Plus className="w-4 h-4 mr-2" /> Nova Notificação</Button>
      </div>
      {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700"><CheckCircle className="w-4 h-4 inline mr-1" />{message}</div>}
      <div className="flex gap-3">
        <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Todos os tipos</option>
          {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button variant="outline" onClick={() => void loadNotifications()}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full">
          <thead><tr className="bg-gradient-to-r from-slate-50 to-slate-100">
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Título</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Tipo</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Severidade</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Alvo</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Enviada</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Criada</th>
            <th className="text-right px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Ações</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-5 py-12 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /></td></tr>
            : notifications.map(n => (
              <tr key={n.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3 font-medium">{n.title}</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">{TYPE_MAP[n.notification_type] || n.notification_type}</span></td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${n.severity === 'error' ? 'bg-red-100 text-red-700' : n.severity === 'warning' ? 'bg-amber-100' : 'bg-blue-100'}`}>{SEVERITY_MAP[n.severity] || n.severity}</span></td>
                <td className="px-5 py-3 text-sm">{n.target_companies === "all" ? "Todas" : n.target_companies}</td>
                <td className="px-5 py-3">{n.sent_at ? <span className="text-emerald-600 text-xs font-medium">Enviada</span> : <span className="text-amber-600 text-xs">Pendente</span>}</td>
                <td className="px-5 py-3 text-sm text-slate-500">{n.created_at ? new Date(n.created_at).toLocaleDateString("pt-MZ") : "-"}</td>
                <td className="px-5 py-3 text-right">{!n.sent_at && <Button size="sm" onClick={() => void sendNotification(n.id)}><Send className="w-3 h-3 mr-1" /> Enviar</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent><DialogHeader><DialogTitle>Nova Notificação</DialogTitle></DialogHeader>
          <form onSubmit={(e) => void createNotification(e)} className="space-y-4">
            <div className="space-y-1"><Label>Título *</Label><Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required /></div>
            <div className="space-y-1"><Label>Mensagem *</Label><textarea className="h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.message} onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))} required /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1"><Label>Tipo</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.notificationType} onChange={(e) => setForm(f => ({ ...f, notificationType: e.target.value }))}>
                  {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Severidade</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.severity} onChange={(e) => setForm(f => ({ ...f, severity: e.target.value }))}>
                  {Object.entries(SEVERITY_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Alvo</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.targetCompanies} onChange={(e) => setForm(f => ({ ...f, targetCompanies: e.target.value }))}>
                  <option value="all">Todas as empresas</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-gradient-to-r from-pink-500 to-rose-600">{saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null} Criar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}