import { useEffect, useMemo, useState } from "react";
import { Package, Plus, Search, Pencil, Power, Loader2 } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import {
  creditProductsApi,
  type CreditProduct,
  type CreditProductInput,
} from "../../lib/credit-products";

const emptyForm: CreditProductInput = {
  code: "",
  name: "",
  description: "",
  minAmount: 0,
  maxAmount: 0,
  minTermMonths: 1,
  maxTermMonths: 12,
  interestRate: 0,
  administrativeFeeRate: 0,
  dailyPenaltyRate: 0,
  paymentFrequency: "mensal",
  amortizationMethod: "price",
  requiresGuarantee: false,
  isActive: true,
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-MZ", {
    style: "currency",
    currency: "MZN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRate(value: number) {
  return `${Number(value).toFixed(2)}%`;
}

export default function ProdutosCreditoPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.parametros.negocio");
  const [search, setSearch] = useState("");
  const [produtos, setProdutos] = useState<CreditProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CreditProduct | null>(null);
  const [form, setForm] = useState<CreditProductInput>(emptyForm);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    creditProductsApi.list()
      .then((response) => {
        if (mounted) setProdutos(response.products);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Nao foi possivel carregar os produtos.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [canManage]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return produtos;
    return produtos.filter((product) =>
      [product.code, product.name, product.description].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [produtos, search]);

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>Sem permissão para alterar a parametrização de negócio.</p>
      </div>
    );
  }

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (product: CreditProduct) => {
    setEditing(product);
    setForm({
      code: product.code,
      name: product.name,
      description: product.description,
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      minTermMonths: product.minTermMonths,
      maxTermMonths: product.maxTermMonths,
      interestRate: product.interestRate,
      administrativeFeeRate: product.administrativeFeeRate,
      dailyPenaltyRate: product.dailyPenaltyRate,
      paymentFrequency: product.paymentFrequency,
      amortizationMethod: product.amortizationMethod,
      requiresGuarantee: product.requiresGuarantee,
      isActive: product.isActive,
    });
    setError("");
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = editing
        ? await creditProductsApi.update(editing.id, form)
        : await creditProductsApi.create(form);

      setProdutos((current) =>
        editing
          ? current.map((item) => item.id === response.product.id ? response.product : item)
          : [response.product, ...current],
      );
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel guardar o produto.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product: CreditProduct) => {
    setSaving(true);
    setError("");
    try {
      if (product.isActive) {
        await creditProductsApi.deactivate(product.id);
        setProdutos((current) =>
          current.map((item) => item.id === product.id ? { ...item, isActive: false } : item),
        );
      } else {
        const response = await creditProductsApi.update(product.id, {
          code: product.code,
          name: product.name,
          description: product.description,
          minAmount: product.minAmount,
          maxAmount: product.maxAmount,
          minTermMonths: product.minTermMonths,
          maxTermMonths: product.maxTermMonths,
          interestRate: product.interestRate,
          administrativeFeeRate: product.administrativeFeeRate,
          dailyPenaltyRate: product.dailyPenaltyRate,
          paymentFrequency: product.paymentFrequency,
          amortizationMethod: product.amortizationMethod,
          requiresGuarantee: product.requiresGuarantee,
          isActive: true,
        });
        setProdutos((current) =>
          current.map((item) => item.id === response.product.id ? response.product : item),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel alterar o estado do produto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Produtos de Crédito</h1>
            <p className="text-sm text-slate-500">Regras comerciais e operacionais por produto.</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Produto
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por código, nome ou descrição..."
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm"
        />
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
          A carregar produtos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhum produto cadastrado</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Crie o primeiro produto para definir limites, taxas, frequência e método de amortização.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="px-4 py-3.5 text-left font-medium text-slate-600">Código</th>
                <th className="px-4 py-3.5 text-left font-medium text-slate-600">Produto</th>
                <th className="px-4 py-3.5 text-left font-medium text-slate-600">Valor</th>
                <th className="px-4 py-3.5 text-left font-medium text-slate-600">Prazo</th>
                <th className="px-4 py-3.5 text-left font-medium text-slate-600">Juro</th>
                <th className="px-4 py-3.5 text-left font-medium text-slate-600">Frequência</th>
                <th className="px-4 py-3.5 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3.5 text-right font-medium text-slate-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{product.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">{product.name}</div>
                    {product.description && <div className="text-xs text-slate-400 mt-0.5">{product.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatMoney(product.minAmount)} — {formatMoney(product.maxAmount)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {product.minTermMonths} — {product.maxTermMonths} meses
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatRate(product.interestRate)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{product.paymentFrequency}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${product.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {product.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      disabled={saving}
                      onClick={() => toggleActive(product)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 mr-1 disabled:opacity-50"
                    >
                      <Power className="w-3 h-3 inline mr-1" />
                      {product.isActive ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => openEdit(product)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50"
                    >
                      <Pencil className="w-3 h-3 inline mr-1" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editing ? "Editar produto de crédito" : "Novo produto de crédito"}
                </h2>
                <p className="text-xs text-slate-500 mt-1">Os valores definidos aqui serão usados como parâmetros do produto.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Código</span>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full h-10 rounded-lg border px-3 text-sm uppercase" placeholder="CRED-NORMAL" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Nome</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 rounded-lg border px-3 text-sm" placeholder="Crédito Normal" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-600">Descrição</span>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" rows={2} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Valor mínimo (MZN)</span>
                <input type="number" min="0" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })} className="w-full h-10 rounded-lg border px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Valor máximo (MZN)</span>
                <input type="number" min="0" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: Number(e.target.value) })} className="w-full h-10 rounded-lg border px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Prazo mínimo (meses)</span>
                <input type="number" min="1" value={form.minTermMonths} onChange={(e) => setForm({ ...form, minTermMonths: Number(e.target.value) })} className="w-full h-10 rounded-lg border px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Prazo máximo (meses)</span>
                <input type="number" min="1" value={form.maxTermMonths} onChange={(e) => setForm({ ...form, maxTermMonths: Number(e.target.value) })} className="w-full h-10 rounded-lg border px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Taxa de juro (%)</span>
                <input type="number" min="0" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: Number(e.target.value) })} className="w-full h-10 rounded-lg border px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Taxa administrativa (%)</span>
                <input type="number" min="0" step="0.01" value={form.administrativeFeeRate} onChange={(e) => setForm({ ...form, administrativeFeeRate: Number(e.target.value) })} className="w-full h-10 rounded-lg border px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Mora diária (%)</span>
                <input type="number" min="0" step="0.01" value={form.dailyPenaltyRate} onChange={(e) => setForm({ ...form, dailyPenaltyRate: Number(e.target.value) })} className="w-full h-10 rounded-lg border px-3 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Frequência</span>
                <select value={form.paymentFrequency} onChange={(e) => setForm({ ...form, paymentFrequency: e.target.value as CreditProductInput["paymentFrequency"] })} className="w-full h-10 rounded-lg border px-3 text-sm">
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="mensal">Mensal</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Amortização</span>
                <select value={form.amortizationMethod} onChange={(e) => setForm({ ...form, amortizationMethod: e.target.value as CreditProductInput["amortizationMethod"] })} className="w-full h-10 rounded-lg border px-3 text-sm">
                  <option value="price">PRICE</option>
                  <option value="sac">SAC</option>
                  <option value="americano">Americano</option>
                </select>
              </label>
              <label className="md:col-span-2 flex items-center gap-3 rounded-lg border p-3">
                <input type="checkbox" checked={form.requiresGuarantee} onChange={(e) => setForm({ ...form, requiresGuarantee: e.target.checked })} />
                <span className="text-sm text-slate-700">Exigir garantia para este produto</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t bg-slate-50 px-6 py-4">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2 rounded-lg border bg-white text-sm text-slate-600 disabled:opacity-50">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "A guardar..." : "Guardar produto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
