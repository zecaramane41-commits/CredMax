import { useState, useEffect } from "react";
import { ShieldCheck, DollarSign, XCircle, History } from "lucide-react";
import { toast } from "sonner";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { decidirPedido, usePedidosPolling } from "../../lib/loans";
import type { Pedido } from "../../../../shared/types";
import { ESTADO_LABEL } from "../../../../shared/types";
import { PipelineList, PedidoDetailCards, GrupoMembrosSection, EmptyState, QuickComments } from "../../components/credits/PipelineShared";

const TABS = [
  { key: "pendentes" as const, label: "📋 Pendentes para Autorização", filter: (p: Pedido) => p.estado === "autorizado" },
  { key: "liberados" as const, label: "✅ Liberados", filter: (p: Pedido) => p.estado === "liberado" || p.estado === "desembolsado" },
];

export default function AutorizacaoPage() {
  const user = getUser();
  const canView = hasPermission(user, "autorizar.credito");
  const canAuthorize = hasPermission(user, "autorizar.credito");

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [activeTab, setActiveTab] = useState<"pendentes" | "liberados">("pendentes");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => usePedidosPolling(setPedidos), []);

  const activeTabConfig = TABS.find(t => t.key === activeTab)!;
  const filtered = pedidos.filter(p => 
    activeTabConfig.filter(p) && 
    p.cliente.toLowerCase().includes(search.toLowerCase())
  );
  const selected = pedidos.find((p) => p.id === selectedId) || null;

  const handleAuthorizeDisbursement = async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    try {
      await decidirPedido(selectedId, "approve", observacao, true);
      toast.success("Crédito autorizado e liberado para desembolso com sucesso.");
      setSelectedId(null);
      setObservacao("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao autorizar crédito.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefuse = async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    try {
      await decidirPedido(selectedId, "reject", observacao);
      toast.success("Solicitação recusada na fase de autorização.");
      setSelectedId(null);
      setObservacao("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao recusar solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!canView) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão para aceder à autorização.</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Autorização de Crédito</h1>
          <p className="text-sm text-slate-500">Autorização final antes do desembolso</p>
        </div>
      </div>

      {/* Abas */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedId(null); }}
              className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.key
                  ? "border-red-500 text-red-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {tab.label} ({pedidos.filter(tab.filter).length})
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "pendentes" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista */}
          <div className="lg:col-span-1">
            <PipelineList
              pedidos={filtered}
              selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id); setObservacao(""); }}
              search={search}
              onSearchChange={setSearch}
              label="pendente(s) para autorizar"
              emptyMessage="Nenhum pedido para autorizar."
            />
          </div>

          {/* Detalhes + Ações */}
          <div className="lg:col-span-2">
            {selected && canAuthorize ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <h2 className="text-lg font-semibold text-slate-800">{selected.cliente}</h2>
                <PedidoDetailCards pedido={selected} />
                <GrupoMembrosSection membros={selected.membros} />

                <QuickComments
                  onSelect={(comment) =>
                    setObservacao((prev) => (prev ? `${prev}\n${comment}` : comment))
                  }
                />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">Observações da Autorização</label>
                    {observacao && (
                      <button
                        type="button"
                        onClick={() => setObservacao("")}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        Limpar texto
                      </button>
                    )}
                  </div>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="w-full h-20 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-red-500 resize-none"
                    placeholder="Selecione um comentário rápido acima ou registe observações da autorização..."
                  />
                </div>

                <div className="flex gap-2">
                  <button onClick={handleAuthorizeDisbursement}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
                    <DollarSign className="w-4 h-4" /> Autorizar Desembolso
                  </button>
                  <button onClick={handleRefuse}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shadow-sm">
                    <XCircle className="w-4 h-4" /> Recusar
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState 
                icon={<ShieldCheck className="w-12 h-12" />}
                message="Selecione um pedido para autorizar"
              />
            )}
          </div>
        </div>
      ) : (
        /* Tabela de Liberados */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-purple-50 border-b border-purple-200">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-700" />
              <h3 className="font-semibold text-purple-900">Créditos Liberados</h3>
            </div>
            <p className="text-xs text-purple-700 mt-1">Estes créditos foram liberados e aguardam desembolso</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data Liberação</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Liberado Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      Nenhum crédito liberado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.cliente}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.tipoCredito}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-900">{c.valor.toLocaleString("pt-PT")} MT</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{ESTADO_LABEL[c.estado]}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.dataDesembolso || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.desembolsadoPor || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}