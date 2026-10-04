import { useCallback, useEffect, useState } from "react";
import { UserCheck, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";

type Gestor = {
  id: number;
  fullName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  companyName?: string | null;
};

const emptyForm = { fullName: "", role: "manager", email: "", isActive: true };

export default function GestoresPage() {
  const user = getUser();
  const canManage = hasPermission(user, "criar.usuarios");
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ users: Gestor[] }>("/users?role=portfolio");
      setGestores(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar gestores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(g: Gestor) {
    setEditingId(g.id);
    setForm({ fullName: g.fullName, role: g.role === "agent" ? "agent" : "manager", email: g.email || "", isActive: g.isActive });
    setShowModal(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!form.fullName.trim()) {
      setError("O nome do gestor é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(editingId ? `/users/portfolios/${editingId}` : "/users/portfolios", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          role: form.role,
          email: form.email.trim() || undefined,
          isActive: form.isActive,
        }),
      });
      setMessage(editingId ? "Gestor actualizado." : "Gestor adicionado. Já pode ser atribuído a carteiras.");
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar gestor.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(g: Gestor) {
    setError("");
    setMessage("");
    try {
      await apiFetch(`/users/portfolios/${g.id}`, { method: "DELETE" });
      setMessage(`Gestor "${g.fullName}" removido.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover gestor.");
    }
  }

  if (!canManage) return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg"><UserCheck className="w-6 h-6 text-white" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Gestores de Carteiras</h1><p className="text-sm text-slate-500">Pessoas que gerem carteiras — não têm login no sistema</p></div>
        </div>
        <button onClick={() => { setEditingId(null); setForm(emptyForm); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"><Plus className="w-4 h-4" />Adicionar Gestor</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {loading && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />A carregar gestores...</p>}
      {!loading && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b"><th className="px-4 py-3 text-left font-medium text-slate-600">Nome</th><th className="px-4 py-3 text-left font-medium text-slate-600">Email interno</th><th className="px-4 py-3 text-center font-medium text-slate-600">Tipo</th><th className="px-4 py-3 text-center font-medium text-slate-600">Estado</th><th className="px-4 py-3 text-right font-medium text-slate-600">Acções</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {gestores.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{g.fullName}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{g.email || "-"}</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${g.role === "agent" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>{g.role === "agent" ? "Subgestor" : "Gestor"}</span></td>
                  <td className="px-4 py-3 text-center"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${g.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{g.isActive ? "Ativo" : "Inativo"}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setEditingId(g.id); setForm({ fullName: g.fullName, role: g.role === "agent" ? "agent" : "manager", email: g.email || "", isActive: g.isActive }); setShowModal(true); }} className="p-2 text-slate-500 hover:text-indigo-600"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => void remove(g)} className="p-2 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {gestores.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sem gestores registados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">{editingId ? "Editar gestor" : "Novo gestor"}</h2>
            <label className="block text-sm text-slate-600">Nome *<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-300 text-sm" placeholder="Ex: Rafael Manhicane" /></label>
            <label className="block text-sm text-slate-600">Tipo
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-300 text-sm">
                <option value="manager">Gestor</option>
                <option value="agent">Subgestor / Agente</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">Email interno (opcional)<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-300 text-sm" placeholder="gestor@empresa.co.mz" /></label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Ativo</label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? "A guardar..." : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

