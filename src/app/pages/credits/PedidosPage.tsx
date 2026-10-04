import { useState, useEffect } from "react";
import { FileText, Plus, Search, Eye, Edit, XCircle, Filter, ChevronDown, Loader2, Users, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { fetchClients, type ClientSummary } from "../../lib/clients";
import { criarPedido, cancelarPedido, verificarPedidoAtivo, usePedidosPolling, getPipelineStatus } from "../../lib/loans";
import type { Pedido, PedidoFormData } from "../../../../shared/types";
import { ESTADO_LABEL, ESTADO_COLOR } from "../../../../shared/types";
import { formatCurrencyMT } from "../../lib/format";
import PedidoDetailsModal from "../../components/credits/PedidoDetailsModal";
import NovoPedidoModal from "../../components/credits/NovoPedidoModal";

export { getPipelineStatus };

export default function PedidosPage() {
  const user = getUser();
  const canCreate = hasPermission(user, "solicitar.credito");
  const canEdit = hasPermission(user, "solicitar.credito");
  const canCancel = hasPermission(user, "solicitar.credito");

  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [showModalNovoPedido, setShowModalNovoPedido] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Escuta os pedidos em tempo real do banco de dados
  useEffect(() => usePedidosPolling(setPedidos), []);

  // Filtered list — newest pedidos first
  const filtered = pedidos
    .filter((p) => {
      const matchSearch = p.cliente.toLowerCase().includes(search.toLowerCase());
      const matchEstado = filterEstado === "todos" || p.estado === filterEstado;
      return matchSearch && matchEstado;
    })
    .sort((a, b) => b.id - a.id);

  const handleCreatePedido = async (data: PedidoFormData) => {
    const ativo = verificarPedidoAtivo(data.clienteId, pedidos);
    if (ativo) {
      throw new Error(`Este cliente já possui um pedido ativo (${ativo.cliente} - ${ESTADO_LABEL[ativo.estado]}). Somente é permitido um pedido por cliente por vez.`);
    }

    const novo = await criarPedido(data);
    setPedidos((prev) => [novo, ...prev]);
    toast.success(`Pedido #${novo.id} criado com sucesso no banco de dados.`);
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm("Tem certeza que deseja cancelar este pedido?")) return;
    try {
      await cancelarPedido(id, "Cancelado pelo utilizador");
      toast.success("Pedido cancelado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cancelar pedido.");
    }
  };

  if (!canCreate) {
    return <div className="flex items-center justify-center h-64 text-slate-500"><p>Sem permissão para aceder aos pedidos.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Pedidos de Crédito</h1>
            <p className="text-sm text-slate-500">Central de registo e acompanhamento de solicitações de crédito</p>
          </div>
        </div>
        <button onClick={() => setShowModalNovoPedido(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm text-sm font-medium">
          <Plus className="w-4 h-4" />Novo Pedido
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}
            className="h-10 pl-9 pr-8 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 appearance-none bg-white">
            <option value="todos">Todos</option>
            {Object.entries(ESTADO_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>
        <span className="text-xs text-slate-500">{filtered.length} pedido(s)</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">ID</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Cliente</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Tipo</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Mês</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Valor</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Crédito</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Prazo</th>
              <th className="px-4 py-3.5 text-left font-medium text-slate-600">Estado</th>
              <th className="px-4 py-3.5 text-right font-medium text-slate-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-700">#{String(p.id).slice(-6)}</td>
                <td className="px-4 py-3 text-slate-700">
                  <div className="flex items-center gap-1.5">
                    {p.isGrupo && <Users className="w-3.5 h-3.5 text-purple-500" />}
                    {p.reemprestimo && <RefreshCcw className="w-3.5 h-3.5 text-amber-500" />}
                    {p.cliente}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.clienteType === "singular" ? "bg-blue-100 text-blue-700"
                    : p.clienteType === "grupo" ? "bg-purple-100 text-purple-700"
                    : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {p.clienteType === "singular" ? "Singular" : p.clienteType === "grupo" ? "Grupo" : "Empresa"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">{p.mesReferencia}</td>
                <td className="px-4 py-3 text-slate-700">{formatCurrencyMT(p.valor)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.tipoCredito === "Consumo" ? "bg-cyan-100 text-cyan-700" : "bg-orange-100 text-orange-700"
                  }`}>{p.tipoCredito}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.prazo}m</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_COLOR[p.estado]}`}>
                    {ESTADO_LABEL[p.estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => { setSelectedPedido(p); setShowDetailModal(true); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-100 transition-colors"
                      title="Detalhes do pedido"
                    >
                      <Eye className="w-4 h-4 text-amber-600" />
                    </button>
                    {canEdit && p.estado === "rascunho" && (
                      <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-100 transition-colors" title="Editar">
                        <Edit className="w-4 h-4 text-blue-600" />
                      </button>
                    )}
                    {canCancel && (p.estado === "rascunho" || p.estado === "pendente") && (
                      <button onClick={() => handleCancel(p.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-100 transition-colors" title="Cancelar">
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-400">Nenhum pedido encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Novo Pedido */}
      <NovoPedidoModal
        open={showModalNovoPedido}
        onOpenChange={setShowModalNovoPedido}
        onSubmit={handleCreatePedido}
      />

      {/* Modal de Detalhes */}
      <PedidoDetailsModal
        pedido={selectedPedido}
        open={showDetailModal}
        onOpenChange={(open) => { if (!open) { setShowDetailModal(false); setSelectedPedido(null); } }}
        onUpdate={() => setPedidos(loadPedidos())}
      />
    </div>
  );
}