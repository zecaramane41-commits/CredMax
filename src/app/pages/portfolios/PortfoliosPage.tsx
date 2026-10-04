import { useCallback, useEffect, useState } from "react";
import { Layers, Plus } from "lucide-react";
import CarteirasAtivasPage from "./CarteirasAtivasPage";
import SegmentacaoPage from "./SegmentacaoPage";
import TransferenciasPage from "./TransferenciasPage";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  type Carteira,
  createCarteira,
  listCarteiras,
  listGestores,
  type Gestor,
} from "../../lib/carteiras";
import { getUser } from "../../lib/auth";
import { hasPermission } from "../../lib/permissions";

const money = (v: string | number | undefined) =>
  Number(v ?? 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PortfoliosPage() {
  const user = getUser();
  const canManage = hasPermission(user, "gerir.carteiras");
  const [tree, setTree] = useState<Carteira[]>([]);
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", gestorUserId: "", parentId: "", description: "", subGestores: [] as number[] });
  const [tab, setTab] = useState<"estrutura" | "ativas" | "segmentacao" | "transferencias">("ativas");


  const load = useCallback(async () => {
    try {
      const [data, g] = await Promise.all([listCarteiras(), listGestores()]);
      setTree(data.carteiras || []);
      setGestores(g.gestores || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar carteiras.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.name.trim() || !form.gestorUserId) {
      setError("Nome da carteira e Gestor responsável são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      await createCarteira({
        name: form.name.trim(),
        gestorUserId: Number(form.gestorUserId),
        parentId: form.parentId ? Number(form.parentId) : null,
        description: form.description.trim() || undefined,
        subGestores: form.parentId ? undefined : form.subGestores,
      });
      setMessage(form.parentId ? "Subcarteira criada." : "Carteira criada.");
      setShowModal(false);
      setForm({ name: "", gestorUserId: "", parentId: "", description: "", subGestores: [] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar carteira.");
    } finally {
      setSaving(false);
    }
  }

  const parentOptions = tree.map((c) => ({ id: c.id, label: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-600" />
            Carteiras
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Cada carteira tem um gestor responsável e pode conter subcarteiras. Clientes, desembolsos,
            reembolsos e relatórios estão ligados à sua carteira em tempo real.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setForm({ name: "", gestorUserId: "", parentId: "", description: "", subGestores: [] });
              setShowModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> Nova carteira
          </Button>
        )}
      </div>

      {message && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">{message}</div>
      )}
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {([
          { key: "ativas", label: "Carteiras Ativas" },
          { key: "segmentacao", label: "Segmentação" },
          { key: "transferencias", label: "Transferências" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ativas" && <CarteirasAtivasPage />}
      {tab === "segmentacao" && <SegmentacaoPage />}
      {tab === "transferencias" && <TransferenciasPage />}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.parentId ? "Nova subcarteira" : "Nova carteira"}</DialogTitle>
            <DialogDescription>
              Nome da carteira e Gestor responsável são obrigatórios.
              {form.parentId && " Esta subcarteira fica sob a direcção da carteira principal."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome da carteira *</Label>
              <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required />
            </div>
            <div>
              <Label className="text-slate-700 font-medium">Gestor responsável *</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-sm"
                value={form.gestorUserId}
                onChange={(e) => setForm((s) => ({ ...s, gestorUserId: e.target.value }))}
                required
              >
                <option value="" className="text-slate-500 bg-white">Selecione o gestor...</option>
                {gestores.map((g) => (
                  <option key={g.id} value={g.id} className="text-slate-900 bg-white">
                    {g.fullName || g.email} ({g.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-slate-700 font-medium">Carteira principal (subcarteira)</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-sm"
                value={form.parentId}
                onChange={(e) => setForm((s) => ({ ...s, parentId: e.target.value }))}
              >
                <option value="" className="text-slate-500 bg-white">— Nenhuma (carteira raiz)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id} className="text-slate-900 bg-white">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {!form.parentId && (
              <div className="md:col-span-2">
                <Label className="text-slate-700 font-medium">Subgestores / Subcarteiras (opcional)</Label>
                <p className="text-xs text-slate-500 mb-2">
                  Cada subgestor seleccionado recebe automaticamente uma subcarteira própria sob a direcção desta carteira.
                </p>
                <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1">
                  {gestores
                    .filter((g) => g.id !== Number(form.gestorUserId))
                    .map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-sm text-slate-800 px-1 py-1 rounded hover:bg-white cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                          checked={form.subGestores.includes(g.id)}
                          onChange={(e) =>
                            setForm((s) => ({
                              ...s,
                              subGestores: e.target.checked
                                ? [...s.subGestores, g.id]
                                : s.subGestores.filter((id) => id !== g.id),
                            }))
                          }
                        />
                        <span className="font-medium text-slate-900">{g.fullName || g.email}</span>
                        <span className="text-xs text-slate-500">({g.role})</span>
                      </label>
                    ))}
                  {gestores.length === 0 && <p className="text-xs text-slate-400 px-1 py-1">Sem gestores disponíveis.</p>}
                </div>
              </div>
            )}
            <div className="md:col-span-2">
              <Label>Descrição (opcional)</Label>
              <Input value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "A guardar..." : "Criar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
