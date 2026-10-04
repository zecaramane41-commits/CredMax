import { useCallback, useEffect, useState } from "react";
import { Headphones, Plus, MessageSquare, Send, Search, Filter, RefreshCw, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { useNavigate } from "react-router";

type Ticket = { id: number; companyId: number; companyName: string; subject: string; description: string; category: string; priority: string; status: string; messageCount: number; createdByName: string; createdAt: string; updatedAt: string; };
type TicketMessage = { id: number; user_id: number; user_name: string; message: string; is_internal: boolean; created_at: string; };

const STATUS_MAP: Record<string, string> = { open: "Aberto", in_progress: "Em Andamento", resolved: "Resolvido", closed: "Fechado" };
const PRIORITY_MAP: Record<string, string> = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };
const CATEGORY_OPTIONS = ["general", "technical", "billing", "feature", "other"];
const CATEGORY_MAP: Record<string, string> = { general: "Geral", technical: "Técnico", billing: "Facturação", feature: "Funcionalidade", other: "Outro" };

export default function AdminSupportPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ companyId: "", subject: "", description: "", category: "general", priority: "normal" });
  const [saving, setSaving] = useState(false);

  // Detail dialog
  const [showDetail, setShowDetail] = useState(false);
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);
  const [detailMessages, setDetailMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const loadTickets = useCallback(async () => {
    try { setLoading(true); setError("");
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchTerm) params.set("search", searchTerm);
      const data = await apiFetch<{ tickets: Ticket[] }>(`/admin/support?${params}`);
      setTickets(data.tickets || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setLoading(false); }
  }, [statusFilter, searchTerm]);

  const loadCompanies = useCallback(async () => {
    try { const data = await apiFetch<{ companies: { id: number; name: string }[] }>("/admin/companies"); setCompanies(data.companies || []); } catch {}
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) { navigate("/", { replace: true }); return; }
    void loadTickets(); void loadCompanies();
  }, [isCentralAdmin, loadTickets, loadCompanies, navigate]);

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try { setSaving(true);
      await apiFetch("/admin/support", { method: "POST", body: JSON.stringify(createForm) });
      setMessage("Ticket criado com sucesso."); setShowCreate(false);
      await loadTickets();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setSaving(false); }
  };

  const openDetail = async (ticket: Ticket) => {
    setDetailTicket(ticket); setDetailMessages([]); setShowDetail(true);
    try {
      const data = await apiFetch<{ ticket: Ticket; messages: TicketMessage[] }>(`/admin/support/${ticket.id}`);
      setDetailMessages(data.messages || []);
    } catch {}
  };

  const sendReply = async () => {
    if (!replyText.trim() || !detailTicket) return;
    try {
      await apiFetch(`/admin/support/${detailTicket.id}/messages`, {
        method: "POST", body: JSON.stringify({ message: replyText, isInternal })
      });
      setReplyText("");
      const data = await apiFetch<{ ticket: Ticket; messages: TicketMessage[] }>(`/admin/support/${detailTicket.id}`);
      setDetailMessages(data.messages || []);
      await loadTickets();
    } catch {}
  };

  const updateStatus = async (ticketId: number, newStatus: string) => {
    try {
      await apiFetch(`/admin/support/${ticketId}/status`, { method: "PUT", body: JSON.stringify({ status: newStatus }) });
      setMessage("Status atualizado.");
      await loadTickets();
      if (detailTicket?.id === ticketId) await openDetail(detailTicket);
    } catch {}
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            Suporte
          </h1>
          <p className="text-slate-500 mt-1">Centraliza a comunicação entre as empresas e a administração da plataforma.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700">
          <Plus className="w-4 h-4 mr-2" /> Novo Ticket
        </Button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}
      {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{message}</div>}

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Pesquisar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos</option>
          <option value="open">Abertos</option>
          <option value="in_progress">Em Andamento</option>
          <option value="resolved">Resolvidos</option>
          <option value="closed">Fechados</option>
        </select>
        <Button variant="outline" onClick={() => void loadTickets()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full">
          <thead><tr className="bg-gradient-to-r from-slate-50 to-slate-100">
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Empresa</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Assunto</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Categoria</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Prioridade</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Status</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Mensagens</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Actualizado</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto" /> A carregar...</td></tr>
            : tickets.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">Nenhum ticket encontrado.</td></tr>
            : tickets.map(t => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => void openDetail(t)}>
                <td className="px-5 py-3 font-medium">{t.companyName}</td>
                <td className="px-5 py-3">{t.subject}</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">{CATEGORY_MAP[t.category] || t.category}</span></td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.priority === 'urgent' ? 'bg-red-100 text-red-700' : t.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100'}`}>{PRIORITY_MAP[t.priority] || t.priority}</span></td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.status === 'open' ? 'bg-blue-100 text-blue-700' : t.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : t.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS_MAP[t.status] || t.status}</span></td>
                <td className="px-5 py-3">{t.messageCount}</td>
                <td className="px-5 py-3 text-sm text-slate-500">{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString("pt-MZ") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-amber-600" /> Novo Ticket de Suporte</DialogTitle><DialogDescription>Abra um chamado para uma empresa.</DialogDescription></DialogHeader>
          <form onSubmit={(e) => void createTicket(e)} className="space-y-4">
            <div className="space-y-1"><Label>Empresa *</Label>
              <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={createForm.companyId} onChange={(e) => setCreateForm(f => ({ ...f, companyId: e.target.value }))} required>
                <option value="">Seleccione...</option>
                {companies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>Assunto *</Label><Input value={createForm.subject} onChange={(e) => setCreateForm(f => ({ ...f, subject: e.target.value }))} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Categoria</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={createForm.category} onChange={(e) => setCreateForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CATEGORY_MAP[c] || c}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Prioridade</Label>
                <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={createForm.priority} onChange={(e) => setCreateForm(f => ({ ...f, priority: e.target.value }))}>
                  {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1"><Label>Descrição</Label><textarea className="h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={createForm.description} onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-gradient-to-r from-amber-500 to-orange-600">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null} Criar Ticket
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={(o) => !o && setShowDetail(false)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-600" />
              {detailTicket?.subject}
              {detailTicket && <span className={`text-xs px-2 py-0.5 rounded-full ${detailTicket.status === 'open' ? 'bg-blue-100 text-blue-700' : detailTicket.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : detailTicket.status === 'resolved' ? 'bg-emerald-100' : 'bg-slate-100'}`}>{STATUS_MAP[detailTicket.status]}</span>}
            </DialogTitle>
            <DialogDescription>{detailTicket?.companyName} — {CATEGORY_MAP[detailTicket?.category || ""] || detailTicket?.category}</DialogDescription>
          </DialogHeader>

          {detailTicket && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 text-sm">
                <p className="text-slate-600 mb-2">{detailTicket.description}</p>
                <div className="flex gap-2 mt-3">
                  {detailTicket.status !== "resolved" && detailTicket.status !== "closed" && (
                    <Button size="sm" onClick={() => void updateStatus(detailTicket.id, "resolved")} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle className="w-3 h-3 mr-1" /> Resolver</Button>
                  )}
                  {detailTicket.status === "resolved" && (
                    <Button size="sm" variant="outline" onClick={() => void updateStatus(detailTicket.id, "open")}>Reabrir</Button>
                  )}
                </div>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto">
                {detailMessages.map(msg => (
                  <div key={msg.id} className={`p-3 rounded-lg text-sm ${msg.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-white border border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <strong className="text-slate-900">{msg.user_name}</strong>
                      {msg.is_internal && <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">Interno</span>}
                      <span className="text-xs text-slate-400 ml-auto">{new Date(msg.created_at).toLocaleString("pt-MZ")}</span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 space-y-2">
                <textarea className="w-full h-20 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Escreva uma resposta..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded" />
                    Nota interna (visível apenas para administradores)
                  </label>
                  <Button onClick={() => void sendReply()} disabled={!replyText.trim()} size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600">
                    <Send className="w-3 h-3 mr-1" /> Enviar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}