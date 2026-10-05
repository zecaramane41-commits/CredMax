import { useCallback, useEffect, useState } from "react";
import { Calendar, Plus, Search, Pencil, Trash2, Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import {
  financialCalendarApi,
  type FinancialCalendarDay,
  type FinancialCalendarInput,
} from "../../lib/financial-calendar";

const emptyForm: FinancialCalendarInput = {
  date: "",
  description: "",
  type: "feriado",
};

const typeLabel: Record<FinancialCalendarDay["type"], string> = {
  feriado: "Feriado",
  nao_util: "Não útil",
  dia_util: "Dia útil",
};

export default function CalendarioFinanceiroPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.parametros.negocio") || user?.role === "admin";
  const [search, setSearch] = useState("");
  const [dias, setDias] = useState<FinancialCalendarDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FinancialCalendarInput>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadDays = useCallback(async () => {
    setLoading(true);
    try {
      setDias(await financialCalendarApi.list());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o calendário.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void loadDays();
  }, [canManage, loadDays]);

  if (!canManage) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão.</p></div>;
  }

  const filtered = dias.filter((day) => {
    const term = search.trim().toLowerCase();
    return !term
      || day.date.includes(term)
      || day.description.toLowerCase().includes(term)
      || typeLabel[day.type].toLowerCase().includes(term);
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const saveDay = async () => {
    if (!form.date || !form.description.trim()) {
      toast.error("Informe a data e a descrição.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const updated = await financialCalendarApi.update(editingId, form);
        setDias((current) => current.map((day) => day.id === editingId ? updated : day));
        toast.success("Dia do calendário atualizado.");
      } else {
        const created = await financialCalendarApi.create(form);
        setDias((current) => [...current, created].sort((a, b) => a.date.localeCompare(b.date)));
        toast.success("Dia adicionado ao calendário.");
      }
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar o dia.");
    } finally {
      setSaving(false);
    }
  };

  const editDay = (day: FinancialCalendarDay) => {
    setEditingId(day.id);
    setForm({
      date: day.date,
      description: day.description,
      type: day.type,
    });
  };

  const removeDay = async (day: FinancialCalendarDay) => {
    if (!window.confirm(`Remover "${day.description}" de ${day.date}?`)) return;
    try {
      await financialCalendarApi.remove(day.id);
      setDias((current) => current.filter((item) => item.id !== day.id));
      if (editingId === day.id) resetForm();
      toast.success("Dia removido do calendário.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o dia.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-xl shadow-lg">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Calendário Financeiro</h1>
            <p className="text-sm text-slate-500">Dias úteis, feriados e exceções por empresa</p>
          </div>
        </div>
        <button
          onClick={() => void loadDays()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          {editingId ? <Pencil className="w-4 h-4 text-indigo-600" /> : <Plus className="w-4 h-4 text-indigo-600" />}
          <h2 className="font-bold text-slate-900">{editingId ? "Editar dia" : "Adicionar dia"}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))}
            className="h-10 px-3 rounded-lg border border-slate-300 text-sm"
          />
          <input
            value={form.description}
            onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
            placeholder="Ex.: Dia da Independência"
            className="h-10 px-3 rounded-lg border border-slate-300 text-sm md:col-span-2"
          />
          <select
            value={form.type}
            onChange={(e) => setForm((current) => ({ ...current, type: e.target.value as FinancialCalendarInput["type"] }))}
            className="h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="feriado">Feriado</option>
            <option value="nao_util">Não útil</option>
            <option value="dia_util">Dia útil</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          {editingId && (
            <button onClick={resetForm} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
              Cancelar
            </button>
          )}
          <button
            onClick={() => void saveDay()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingId ? "Atualizar" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar dia..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" />
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center"><Loader2 className="w-7 h-7 text-indigo-600 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhum dia cadastrado</h3>
          <p className="text-slate-500 max-w-md mx-auto">Adicione feriados e exceções do calendário da empresa.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b">
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Data</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Descrição</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Tipo</th>
              <th className="px-4 py-3.5 text-right font-medium text-slate-600">Ações</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((day) => (
                <tr key={day.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{day.date}</td>
                  <td className="px-4 py-3 text-slate-600">{day.description}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${day.isWorkingDay ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {typeLabel[day.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => editDay(day)} className="p-2 text-slate-500 hover:text-indigo-600" title="Editar"><Pencil className="w-4 h-4 inline" /></button>
                    <button onClick={() => void removeDay(day)} className="p-2 text-slate-500 hover:text-red-600" title="Remover"><Trash2 className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
