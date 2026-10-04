/**
 * Componentes compartilhados para o pipeline de crédito
 * Elimina a duplicação massiva entre AnalisePage, AprovacaoPage, AutorizacaoPage, DesembolsoPage
 */
import { useState } from "react";
import { Search, MessageSquare } from "lucide-react";
import type { Pedido } from "../../../../shared/types";
import { ESTADO_LABEL, ESTADO_COLOR } from "../../../../shared/types";
import { formatCurrencyMT } from "../../lib/format";

// ============================================================
// PipelineList - Lista de pedidos com search (lado esquerdo)
// ============================================================

type PipelineListProps = {
  pedidos: Pedido[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  label?: string;
};

export function PipelineList({
  pedidos,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  placeholder = "Buscar pedido...",
  emptyMessage = "Nenhum pedido encontrado.",
  label,
}: PipelineListProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      {label !== undefined && (
        <p className="text-xs text-slate-500">{pedidos.length} {label}</p>
      )}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {pedidos.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`w-full text-left p-3 rounded-xl border transition-all ${
              selectedId === p.id
                ? "border-indigo-300 bg-indigo-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-slate-800 text-sm truncate">{p.cliente}</div>
              <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ESTADO_COLOR[p.estado] || "bg-slate-100 text-slate-600"}`}>
                {ESTADO_LABEL[p.estado] || p.estado}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <span>{formatCurrencyMT(p.valor)}</span>
              <span>·</span>
              <span>{p.tipoCredito}</span>
              <span>·</span>
              <span>{p.prazo}m</span>
              {p.isGrupo && <span className="text-purple-500">· Grupo</span>}
              {p.reemprestimo && <span className="text-amber-500">· Reemprés.</span>}
            </div>
          </button>
        ))}
        {pedidos.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-8">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// InfoCard - Card de informação para os detalhes
// ============================================================

type InfoCardProps = {
  label: string;
  value: string;
  highlight?: boolean;
};

export function InfoCard({ label, value, highlight }: InfoCardProps) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-semibold ${highlight ? "text-emerald-700" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

// ============================================================
// GrupoMembrosSection - Seção de membros do grupo
// ============================================================

type GrupoMembrosSectionProps = {
  membros: { memberName: string; amount: number }[];
};

export function GrupoMembrosSection({ membros }: GrupoMembrosSectionProps) {
  if (!membros || membros.length === 0) return null;
  return (
    <div className="bg-indigo-50 rounded-lg p-3">
      <p className="text-xs font-semibold text-indigo-700 mb-1">
        Membros do Grupo ({membros.length})
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
        {membros.map((m, idx) => (
          <div key={idx} className="text-xs text-indigo-600 bg-white rounded px-2 py-1 border border-indigo-200">
            <span className="font-medium">{m.memberName}:</span> {formatCurrencyMT(m.amount)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// EmptyState - Estado vazio
// ============================================================

type EmptyStateProps = {
  icon: React.ReactNode;
  message: string;
};

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
      <div className="text-slate-300 mb-3 flex justify-center">{icon}</div>
      <p className="text-slate-500">{message}</p>
    </div>
  );
}

// ============================================================
// PedidoDetailCards - Grid de informações do pedido
// ============================================================

type PedidoDetailCardsProps = {
  pedido: Pedido;
};

export function PedidoDetailCards({ pedido }: PedidoDetailCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <InfoCard label="Valor" value={formatCurrencyMT(pedido.valor)} />
      <InfoCard label="Tipo" value={pedido.tipoCredito} />
      <InfoCard label="Prazo" value={`${pedido.prazo} meses`} />
      <InfoCard label="Taxa" value={`${pedido.taxa}%`} />
      <InfoCard label="Frequência" value={pedido.frequencia} />
      <InfoCard label="Mês Ref." value={pedido.mesReferencia} />
      <InfoCard label={pedido.reemprestimo ? "Reemprés." : "Tipo"} value={pedido.reemprestimo ? "Sim" : "Novo"} />
      <InfoCard label="Data Solic." value={pedido.data} />
      {pedido.valorAprovado !== undefined && (
        <InfoCard label="Valor Aprovado" value={formatCurrencyMT(pedido.valorAprovado)} highlight />
      )}
      {pedido.dataAprovacao && (
        <InfoCard label="Data Aprovação" value={pedido.dataAprovacao} />
      )}
      {pedido.aprovadoPor && (
        <InfoCard label="Aprovado Por" value={pedido.aprovadoPor} />
      )}
    </div>
  );
}

// ============================================================
// QuickComments - Modelos de comentários rápidos de decisão
// ============================================================

export const QUICK_COMMENTS = {
  aprovar: [
    "Documentação validada e capacidade financeira comprovada. Aprovado.",
    "Score de crédito positivo e garantias verificadas com sucesso.",
    "Cliente com bom histórico de reembolso e sem restrições ativas.",
    "Rendimento mensal compatível com as prestações calculadas.",
  ],
  rejeitar: [
    "Capacidade financeira insuficiente para a prestação calculada.",
    "Documentação pendente ou inválida apresentada pelo cliente.",
    "Endividamento prévio incompatível com o limite de risco da instituição.",
    "Garantias insuficientes ou sem comprovação legal válida.",
  ],
  cancelar: [
    "Pedido cancelado a pedido do cliente antes do processamento.",
    "Dados cadastrais incorretos. Necessário reenviar proposta.",
    "Proposta duplicada ou descontinuada no sistema.",
  ],
};

type QuickCommentsProps = {
  onSelect: (comment: string) => void;
};

export function QuickComments({ onSelect }: QuickCommentsProps) {
  const [activeCategory, setActiveCategory] = useState<"aprovar" | "rejeitar" | "cancelar">("aprovar");

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-600" /> Comentários Rápidos (Clique para inserir)
        </span>
        <div className="flex gap-1 bg-white border border-slate-200 p-0.5 rounded-lg shadow-sm">
          <button
            type="button"
            onClick={() => setActiveCategory("aprovar")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              activeCategory === "aprovar" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("rejeitar")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              activeCategory === "rejeitar" ? "bg-rose-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Rejeitar
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("cancelar")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              activeCategory === "cancelar" ? "bg-amber-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Cancelar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {QUICK_COMMENTS[activeCategory].map((comment, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelect(comment)}
            className={`text-xs text-left p-2 rounded-lg border transition-all ${
              activeCategory === "aprovar"
                ? "bg-white hover:bg-emerald-50 border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-800"
                : activeCategory === "rejeitar"
                ? "bg-white hover:bg-rose-50 border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-800"
                : "bg-white hover:bg-amber-50 border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-800"
            }`}
          >
            • {comment}
          </button>
        ))}
      </div>
    </div>
  );
}