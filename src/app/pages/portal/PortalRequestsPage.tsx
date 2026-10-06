import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { AlertCircle, ChevronDown, ChevronUp, ClipboardList, Loader2, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { formatCurrencyMT } from "../../lib/format";
import {
  isPortalAuthenticated,
  portalFetch,
  type PortalRequest,
  type PortalTimelineItem,
} from "../../lib/portal-api";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending_analyst: { label: "Em análise", className: "bg-amber-100 text-amber-700" },
  pending_manager: { label: "Aguarda gestor", className: "bg-blue-100 text-blue-700" },
  pending_final: { label: "Aguarda aprovação final", className: "bg-indigo-100 text-indigo-700" },
  approved: { label: "Aprovado", className: "bg-green-100 text-green-700" },
  disbursed: { label: "Desembolsado", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejeitado", className: "bg-red-100 text-red-700" },
  risk_blocked: { label: "Bloqueado por risco", className: "bg-red-100 text-red-700" },
};

const STATE_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Pedido submetido",
  TRIAGE: "Triagem",
  DOCUMENTATION: "Documentação recebida",
  ANALYSIS: "Em análise",
  EVALUATION: "Avaliação",
  APPROVAL: "Aprovação",
  APPROVED: "Aprovado",
  CONTRACT: "Contrato",
  DISBURSEMENT: "Desembolso",
  ACTIVE: "Ativo / Desembolsado",
  PAID: "Liquidado",
  DELINQUENT: "Em atraso",
  RESTRUCTURED: "Reestruturado",
  REJECTED: "Rejeitado",
};

const FREQUENCY_LABEL: Record<string, string> = {
  mensal: "Mensal",
  quinzenal: "Quinzenal",
  semanal: "Semanal",
  diario: "Diário",
};

function statusBadge(status: string) {
  const known = STATUS_LABEL[status];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${known ? known.className : "bg-slate-100 text-slate-600"}`}
    >
      {known ? known.label : status}
    </span>
  );
}

/**
 * Lista de pedidos do cliente + linha do tempo do processo (Fase 2.2 — §5).
 * Consulta apenas pedidos do próprio cliente (ownership verificado no backend).
 */
export default function PortalRequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [timelines, setTimelines] = useState<Record<number, PortalTimelineItem[]>>({});
  const [timelineLoading, setTimelineLoading] = useState<number | null>(null);
  const [timelineError, setTimelineError] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await portalFetch<{ requests: PortalRequest[] }>("/portal/applications");
      setRequests(payload.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os pedidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPortalAuthenticated()) {
      void loadRequests();
    }
  }, [loadRequests]);

  const toggleTimeline = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (timelines[id]) return;
    setTimelineLoading(id);
    setTimelineError("");
    try {
      const payload = await portalFetch<{ items: PortalTimelineItem[] }>(
        `/portal/applications/${id}/timeline`,
      );
      setTimelines((prev) => ({ ...prev, [id]: payload.items }));
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : "Linha do tempo indisponível.");
    } finally {
      setTimelineLoading(null);
    }
  };

  if (!isPortalAuthenticated()) {
    return <Navigate to="/credito/aceder" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Os meus pedidos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhe o estado e a linha do tempo de cada pedido submetido pelo portal.
          </p>
        </div>
        <Button onClick={() => navigate("/credito")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo pedido
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar pedidos…
        </p>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">Ainda não tem pedidos de crédito.</p>
          <p className="mt-1 text-sm text-slate-500">
            Comece por simular no simulador público e submeta o pedido a partir daí.
          </p>
          <Button className="mt-4" onClick={() => navigate("/credito")}>
            Ir para o simulador
          </Button>
        </div>
      )}

      {!loading && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{request.contractNo}</span>
                    {statusBadge(request.status)}
                    {request.processState && (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        Etapa: {STATE_LABEL[request.processState] || request.processState}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">
                    {formatCurrencyMT(request.requestedAmount)} · {request.periodMonths} meses ·{" "}
                    {FREQUENCY_LABEL[request.paymentFrequency] || request.paymentFrequency} · Taxa{" "}
                    {request.rate}%
                  </p>
                  <p className="text-xs text-slate-400">
                    Submetido em {new Date(request.createdAt).toLocaleString("pt-PT")}
                    {request.purpose ? ` · ${request.purpose}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleTimeline(request.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {expandedId === request.id ? "Ocultar histórico" : "Ver histórico"}
                  {expandedId === request.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>

              {expandedId === request.id && (
                <div className="border-t border-slate-100 p-4">
                  {timelineLoading === request.id && (
                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> A carregar linha do tempo…
                    </p>
                  )}
                  {timelineError && <p className="text-sm text-red-600">{timelineError}</p>}
                  {timelineLoading !== request.id &&
                    !timelineError &&
                    (timelines[request.id]?.length ?? 0) === 0 && (
                      <p className="text-sm text-slate-500">
                        Ainda sem movimentos registados na trilha de processo.
                      </p>
                    )}
                  {timelineLoading !== request.id && (timelines[request.id]?.length ?? 0) > 0 && (
                    <ol className="relative ml-2 space-y-4 border-l border-slate-200">
                      {(timelines[request.id] || []).map((item) => (
                        <li key={item.id} className="ml-4">
                          <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-indigo-500 ring-4 ring-indigo-100" />
                          <p className="text-sm font-medium text-slate-800">
                            {item.fromState
                              ? `${STATE_LABEL[item.fromState] || item.fromState} → `
                              : ""}
                            {STATE_LABEL[item.toState] || item.toState}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.createdAt ? new Date(item.createdAt).toLocaleString("pt-PT") : ""}
                            {item.actorName ? ` · ${item.actorName}` : ""}
                            {item.reason ? ` · ${item.reason}` : ""}
                          </p>
                          {item.note && <p className="mt-0.5 text-xs text-slate-600">{item.note}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

