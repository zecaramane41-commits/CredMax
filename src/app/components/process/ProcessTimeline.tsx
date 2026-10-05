import { useEffect, useState } from "react";
import { Clock3, Loader2 } from "lucide-react";
import { fetchProcessTimeline, type ProcessTimelineItem } from "../../lib/process-log";

const STATE_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Pedido criado",
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
  PENDING: "Pendente",
  VALIDATED: "Validado",
  PROCESSED: "Processado",
  CONFIRMED: "Confirmado",
};

function label(state: string | null) {
  if (!state) return "—";
  return STATE_LABEL[state] || state;
}

export default function ProcessTimeline({ clientId }: { clientId: number }) {
  const [items, setItems] = useState<ProcessTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchProcessTimeline({ clientId })
      .then((data) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock3 className="w-4 h-4 text-indigo-600" />
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Linha do tempo do processo</h3>
      </div>
      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> A carregar histórico…
        </p>
      )}
      {!loading && failed && (
        <p className="text-sm text-slate-500">Histórico de processo indisponível de momento.</p>
      )}
      {!loading && !failed && items.length === 0 && (
        <p className="text-sm text-slate-500">Ainda sem movimentos registados na trilha de processo.</p>
      )}
      {!loading && !failed && items.length > 0 && (
        <ol className="relative border-l border-slate-200 ml-2 space-y-4">
          {items.map((item) => (
            <li key={item.id} className="ml-4">
              <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-indigo-100" />
              <p className="text-sm font-medium text-slate-800">
                {label(item.fromState)} → {label(item.toState)}
              </p>
              <p className="text-xs text-slate-500">
                {item.createdAt ? new Date(item.createdAt).toLocaleString("pt-PT") : ""}
                {item.actorName ? ` · ${item.actorName}` : ""}
                {item.reason ? ` · ${item.reason}` : ""}
              </p>
              {item.note && <p className="text-xs text-slate-600 mt-0.5">{item.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
