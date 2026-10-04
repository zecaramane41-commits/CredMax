import { useCallback, useEffect, useState, useMemo } from "react";
import { Layers, Pencil, RefreshCw, Users, Briefcase, Search, DollarSign } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { listCarteiras, listGestores, updateCarteira, type Carteira, type Gestor } from "../../lib/carteiras";
import { getUser } from "../../lib/auth";
import { hasPermission } from "../../lib/permissions";
import { formatCurrencyMT } from "../../lib/format";

const money = (v: string | number | undefined) =>
  Number(v ?? 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type EditState = { c: Carteira; name: string; gestorUserId: string; description: string; isActive: boolean };

function Row({ c, sub, onEdit, canManage }: { c: Carteira; sub?: boolean; onEdit: (c: Carteira) => void; canManage: boolean }) {
  const inactive = c.is_active === false;
  return (
    <div className={`rounded-xl border p-4 transition-all shadow-sm ${sub ? "border-slate-200 bg-slate-50/80 ml-6" : inactive ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white hover:border-indigo-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">#{c.id}{c.code ? ` · ${c.code}` : ""}</span>
            <h4 className={`text-sm ${sub ? "font-medium" : "font-bold text-slate-900"}`}>{c.name}</h4>
            {inactive ? (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300">Inactiva</Badge>
            ) : (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Activa</Badge>
            )}
            {!sub && (c.children?.length ?? 0) > 0 && (
              <Badge className="bg-indigo-100 text-indigo-800">{c.children!.length} subcarteira(s)</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
              Gestor: <strong className="text-indigo-700">{c.gestor_user_name || c.gestor_name || "Não Atribuído"}</strong>
            </span>
            {c.description && <span className="text-slate-400 italic">“{c.description}”</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-800">{Number(c.client_count ?? 0)} clientes</span>
          </div>
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
            <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-xs font-bold text-indigo-800">Saldo: {money(c.outstanding_balance)} MT</span>
          </div>
          <div className="text-right text-xs text-slate-500 hidden sm:block">
            <div>Desembolsado: <strong className="text-slate-700">{money(c.total_disbursed)} MT</strong></div>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => onEdit(c)} className="h-8 gap-1 text-xs">
              <Pencil className="w-3 h-3" /> Editar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Root({ c, onEdit, canManage }: { c: Carteira; onEdit: (c: Carteira) => void; canManage: boolean }) {
  return (
    <div className="space-y-2">
      <Row c={c} onEdit={onEdit} canManage={canManage} />
      {(c.children ?? []).map((s) => (
        <Row key={s.id} c={s} sub onEdit={onEdit} canManage={canManage} />
      ))}
    </div>
  );
}

export default function CarteirasAtivasPage() {
  const user = getUser();
  const canManage = hasPermission(user, "gerir.carteiras") || user?.role === "admin";
  const [roots, setRoots] = useState<Carteira[]>([]);
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, g] = await Promise.all([listCarteiras(), listGestores()]);
      setRoots(data.carteiras || []);
      setGestores(g.gestores || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar carteiras.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(c: Carteira) {
    if (!canManage) return;
    setEdit({ c, name: c.name, gestorUserId: c.gestor_user_id ? String(c.gestor_user_id) : "", description: c.description || "", isActive: c.is_active !== false });
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!edit) return;
    setError("");
    if (!edit.name.trim()) { setError("O nome da carteira é obrigatório."); return; }
    setSaving(true);
    try {
      await updateCarteira(edit.c.id, {
        name: edit.name.trim(),
        description: edit.description.trim(),
        isActive: edit.isActive,
        gestorUserId: edit.gestorUserId ? Number(edit.gestorUserId) : null,
      });
      setMessage(`Carteira "${edit.name.trim()}" actualizada com sucesso.`);
      setEdit(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao actualizar carteira.");
    } finally {
      setSaving(false);
    }
  }

  const filteredRoots = useMemo(() => {
    if (!search.trim()) return roots;
    const term = search.toLowerCase();
    return roots.filter((c) => {
      const matchRoot = c.name.toLowerCase().includes(term) ||
        (c.gestor_user_name || c.gestor_name || "").toLowerCase().includes(term);
      const matchChild = (c.children || []).some(
        (ch) => ch.name.toLowerCase().includes(term) || (ch.gestor_user_name || ch.gestor_name || "").toLowerCase().includes(term)
      );
      return matchRoot || matchChild;
    });
  }, [roots, search]);

  const totalCarteiras = roots.length;
  const activeCount = roots.filter((c) => c.is_active !== false).length;
  const totalClientes = roots.reduce((acc, c) => acc + Number(c.client_count || 0) + (c.children || []).reduce((sc, sub) => sc + Number(sub.client_count || 0), 0), 0);
  const totalSaldo = roots.reduce((acc, c) => acc + Number(c.outstanding_balance || 0) + (c.children || []).reduce((sc, sub) => sc + Number(sub.outstanding_balance || 0), 0), 0);
  const totalDesembolsado = roots.reduce((acc, c) => acc + Number(c.total_disbursed || 0) + (c.children || []).reduce((sc, sub) => sc + Number(sub.total_disbursed || 0), 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900">
            <Layers className="w-6 h-6 text-emerald-600" />
            Gestão de Carteiras & Gestores
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Todas as carteiras da instituição vinculadas aos seus gestores, clientes e métricas financeiras em tempo real.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {message && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">{message}</div>}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Total de Carteiras</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalCarteiras} <span className="text-xs font-normal text-emerald-600">({activeCount} activas)</span></p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Clientes Alocados</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{totalClientes}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Saldo Devedor Ativo</p>
          <p className="text-xl font-bold text-emerald-700 mt-1 truncate">{formatCurrencyMT(totalSaldo)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase font-semibold">Total Desembolsado</p>
          <p className="text-xl font-bold text-blue-700 mt-1 truncate">{formatCurrencyMT(totalDesembolsado)}</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar carteira ou gestor..."
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Estrutura de Carteiras e Subcarteiras</span>
            <span className="text-xs font-normal text-slate-500">{filteredRoots.length} registo(s)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredRoots.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">Nenhuma carteira encontrada.</p>
          ) : (
            filteredRoots.map((c) => <Root key={c.id} c={c} onEdit={openEdit} canManage={canManage} />)
          )}
        </CardContent>
      </Card>

      {edit && (
        <Dialog open={!!edit} onOpenChange={(open) => !open && setEdit(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Carteira #{edit.c.id}</DialogTitle>
              <DialogDescription>Actualize o nome, gestor responsável ou estado da carteira.</DialogDescription>
            </DialogHeader>
            <form onSubmit={saveEdit} className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Nome da Carteira *</Label>
                <Input
                  id="edit-name"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  placeholder="Ex: Carteira Maputo Central"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-gestor">Gestor Responsável *</Label>
                <select
                  id="edit-gestor"
                  value={edit.gestorUserId}
                  onChange={(e) => setEdit({ ...edit, gestorUserId: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Selecione o gestor...</option>
                  {gestores.map((g) => (
                    <option key={g.id} value={String(g.id)}>
                      {g.fullName || g.email} ({g.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-desc">Descrição (Opcional)</Label>
                <Input
                  id="edit-desc"
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  placeholder="Ex: Área geográfica, sector, etc."
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={edit.isActive}
                  onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <Label htmlFor="edit-active" className="cursor-pointer text-sm font-normal">
                  Carteira Activa
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="outline" onClick={() => setEdit(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                  {saving ? "A guardar..." : "Guardar Alterações"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
