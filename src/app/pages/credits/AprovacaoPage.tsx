import { useState, useEffect } from "react";
import { CheckSquare, CheckCircle, XCircle, Eye, History } from "lucide-react";
import { toast } from "sonner";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { decidirPedido, usePedidosPolling } from "../../lib/loans";
import type { Pedido } from "../../../../shared/types";
import { ESTADO_LABEL } from "../../../../shared/types";
import { PipelineList, PedidoDetailCards, GrupoMembrosSection, EmptyState, QuickComments } from "../../components/credits/PipelineShared";

const TABS = [
  { key: "pendentes" as const, label: "📋 Pendentes para Aprovação", filter: (p: Pedido) => p.estado === "aprovado" },
  { key: "autorizados" as const, label: "✅ Autorizados", filter: (p: Pedido) => p.estado === "autorizado" || p.estado === "liberado" || p.estado === "desembolsado" },
];

export default function AprovacaoPage() {
  const user = getUser();
  const canView = hasPermission(user, "aprovar.credito");
  const canApprove = hasPermission(user, "aprovar.credito");

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [activeTab, setActiveTab] = useState<"pendentes" | "autorizados">("pendentes");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => usePedidosPolling(setPedidos), []);

  const activeTabConfig = TABS.find(t => t.key === activeTab)!;
  const filtered = pedidos.filter(p => 
    activeTabConfig.filter(p) && 
    p.cliente.toLowerCase().includes(search.toLowerCase())
  );
  const selected = pedidos.find(p => p.id === selectedId) || null;
  const isAdmin = user?.role === "admin";

  const handleAuthorize = async (direct = false) => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    try {
      await decidirPedido(selectedId, "approve", justificativa, direct);
      if (direct) {
        toast.success("Crédito aprovado com autorização total direta pelo Administrador!");
      } else {
        toast.success("Crédito aprovado com sucesso e encaminhado para Autorização final.");
      }
      setSelectedId(null);
      setJustificativa("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar aprovação.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    try {
      await decidirPedido(selectedId, "reject", justificativa);
      toast.success("Solicitação rejeitada.");
      setSelectedId(null);
      setJustificativa("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao rejeitar solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!canView) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão para aceder à aprovação.</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg">
          <CheckSquare className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Aprovação de Crédito</h1>
          <p className="text-sm text-slate-500">Aprova os pedidos analisados e encaminha para autorização</p>
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
                  ? "border-emerald-500 text-emerald-600"
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
              onSelect={(id) => { setSelectedId(id); setJustificativa(""); }}
              search={search}
              onSearchChange={setSearch}
              label="pendente(s)"
              emptyMessage="Nenhum pedido pendente de aprovação."
            />
          </div>

          {/* Detalhes + Ações */}
          <div className="lg:col-span-2">
            {selected && canApprove ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <h2 className="text-lg font-semibold text-slate-800">{selected.cliente}</h2>
                <PedidoDetailCards pedido={selected} />
                <GrupoMembrosSection membros={selected.membros} />

                <QuickComments
                  onSelect={(comment) =>
                    setJustificativa((prev) => (prev ? `${prev}\n${comment}` : comment))
                  }
                />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">Justificativa da Decisão</label>
                    {justificativa && (
                      <button
                        type="button"
                        onClick={() => setJustificativa("")}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        Limpar texto
                      </button>
                    )}
                  </div>
                  <textarea
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    className="w-full h-20 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
                    placeholder="Selecione um comentário rápido acima ou digite a justificativa..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    onClick={() => handleAuthorize(false)}
                    disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" /> Avançar para Autorização
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleAuthorize(true)}
                      disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                      title="Autoriza totalmente e libera para desembolso imediato"
                    >
                      <CheckCircle className="w-4 h-4" /> Aprovação Total (Admin)
                    </button>
                  )}
                  <button
                    onClick={handleReject}
                    disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Recusar
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState 
                icon={<CheckSquare className="w-12 h-12" />}
                message="Selecione um pedido para aprovar"
              />
            )}
          </div>
        </div>
      ) : (
        /* Tabela de Autorizados (Somente Leitura) */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-indigo-50 border-b border-indigo-200">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-700" />
              <h3 className="font-semibold text-indigo-900">Créditos Autorizados</h3>
            </div>
            <p className="text-xs text-indigo-700 mt-1">Estes créditos já foram autorizados e estão prontos para desembolso</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data Autorização</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Autorizado Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      Nenhum crédito autorizado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.cliente}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.tipoCredito}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-900">{c.valor.toLocaleString("pt-PT")} MT</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{ESTADO_LABEL[c.estado]}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.dataAutorizacao || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.autorizadoPor || "—"}</td>
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