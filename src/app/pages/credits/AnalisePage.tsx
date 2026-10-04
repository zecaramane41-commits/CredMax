import { useState, useEffect } from "react";
import { ClipboardCheck, CheckCircle, XCircle, History, Eye, Users } from "lucide-react";
import { toast } from "sonner";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { decidirPedido, usePedidosPolling } from "../../lib/loans";
import type { Pedido } from "../../../../shared/types";
import { ESTADO_LABEL, ESTADO_COLOR } from "../../../../shared/types";
import { PipelineList, PedidoDetailCards, GrupoMembrosSection, EmptyState, QuickComments } from "../../components/credits/PipelineShared";
import { formatCurrencyMT } from "../../lib/format";

const TABS = [
  { key: "pendentes" as const, label: "📋 Pendentes para Análise", filter: (p: Pedido) => p.estado === "pendente" || p.estado === "em_analise" },
  { key: "aprovados" as const, label: "✅ Aprovados (Análise)", filter: (p: Pedido) => ["aprovado", "autorizado", "liberado", "desembolsado"].includes(p.estado) },
];

export default function AnalisePage() {
  const user = getUser();
  const canView = hasPermission(user, "analisar.credito");
  const canAnalyze = hasPermission(user, "analisar.credito");

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [activeTab, setActiveTab] = useState<"pendentes" | "aprovados">("pendentes");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCredito, setSelectedCredito] = useState<Pedido | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => usePedidosPolling(setPedidos), []);

  const activeTabConfig = TABS.find(t => t.key === activeTab)!;
  const filtered = pedidos.filter(p => 
    activeTabConfig.filter(p) && 
    p.cliente.toLowerCase().includes(search.toLowerCase())
  );
  const selected = pedidos.find(p => p.id === selectedId) || null;
  const isAdmin = user?.role === "admin";

  const handleApprove = async (direct = false) => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    try {
      await decidirPedido(selectedId, "approve", observacao, direct);
      if (direct) {
        toast.success("Crédito aprovado com autorização total direta pelo Administrador!");
      } else {
        toast.success("Análise concluída com sucesso e encaminhada para Aprovação.");
      }
      setSelectedId(null);
      setObservacao("");
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
      await decidirPedido(selectedId, "reject", observacao);
      toast.success("Solicitação rejeitada na fase de análise.");
      setSelectedId(null);
      setObservacao("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao rejeitar análise.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetails = (credito: Pedido) => {
    setSelectedCredito(credito);
    setShowDetailModal(true);
  };

  if (!canView) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão para aceder à análise.</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
          <ClipboardCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Análise de Crédito</h1>
          <p className="text-sm text-slate-500">Analise os pedidos pendentes e decida o encaminhamento</p>
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
                  ? "border-blue-500 text-blue-600"
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
              label="pedido(s) pendente(s)"
              emptyMessage="Nenhum pedido pendente."
            />
          </div>

          {/* Detalhes */}
          <div className="lg:col-span-2">
            {selected && canAnalyze ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{selected.cliente}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {selected.tipoCredito} · {selected.prazo} meses · {selected.frequencia}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${ESTADO_COLOR[selected.estado]}`}>
                    {ESTADO_LABEL[selected.estado]}
                  </span>
                </div>

                <PedidoDetailCards pedido={selected} />
                <GrupoMembrosSection membros={selected.membros} />

                <QuickComments
                  onSelect={(comment) =>
                    setObservacao((prev) => (prev ? `${prev}\n${comment}` : comment))
                  }
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-700">Observação da Análise</label>
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
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="Selecione um comentário rápido acima ou digite observações específicas..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                  <button
                    onClick={() => handleApprove(false)}
                    disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium text-xs sm:text-sm"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Aprovar Análise
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleApprove(true)}
                      disabled={submitting}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium text-xs sm:text-sm shadow-sm"
                      title="Aprova todas as etapas e libera para desembolso imediato"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Aprovação Total (Admin)
                    </button>
                  )}
                  <button
                    onClick={handleReject}
                    disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium text-xs sm:text-sm"
                  >
                    <XCircle className="w-4 h-4" />
                    Rejeitar
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState 
                icon={<ClipboardCheck className="w-12 h-12" />}
                message="Selecione um pedido para visualizar detalhes"
              />
            )}
          </div>
        </div>
      ) : (
        /* Tabela de Créditos Aprovados (Somente Leitura) */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-emerald-50 border-b border-emerald-200">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-700" />
              <h3 className="font-semibold text-emerald-900">Créditos Aprovados - Histórico</h3>
            </div>
            <p className="text-xs text-emerald-700 mt-1">Estes créditos foram aprovados e não podem mais ser editados</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Valor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Valor Aprovado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data Aprovação</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Aprovado Por</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                      Nenhum crédito aprovado ainda
                    </td>
                  </tr>
                ) : (
                  filtered.map((credito) => (
                    <tr key={credito.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{credito.cliente}</div>
                        {credito.isGrupo && <span className="text-xs text-purple-600">Grupo</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{credito.tipoCredito}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-900">{formatCurrencyMT(credito.valor)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-emerald-700">
                        {formatCurrencyMT(credito.valorAprovado ?? credito.valor)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{credito.dataAprovacao || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{credito.aprovadoPor || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleViewDetails(credito)}
                          className="inline-flex items-center justify-center p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Detalhes */}
      {showDetailModal && selectedCredito && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Detalhes do Crédito</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-6">
              <h4 className="font-semibold text-slate-900 border-b pb-2">Informações do Pedido</h4>
              <PedidoDetailCards pedido={selectedCredito} />
              <GrupoMembrosSection membros={selectedCredito.membros} />
              <div className="pt-4 border-t">
                <p className="text-xs text-slate-500 text-center">
                  📅 Solicitado em {selectedCredito.data} · ID: #{selectedCredito.id}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}