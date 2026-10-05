import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Search, User, CreditCard, FileText, Receipt, ScrollText } from "lucide-react";
import { apiFetch } from "../../lib/api";

export type SearchResultItem = {
  kind: "CLIENTE" | "CREDITO" | "PEDIDO" | "CONTRATO" | "PAGAMENTO";
  id: number;
  title: string;
  subtitle: string;
  status: string | null;
  meta: Record<string, unknown>;
};

type SearchGroups = {
  clients: SearchResultItem[];
  loans: SearchResultItem[];
  requests: SearchResultItem[];
  contracts: SearchResultItem[];
  repayments: SearchResultItem[];
};

const KIND_ICON: Record<string, typeof User> = {
  CLIENTE: User,
  CREDITO: CreditCard,
  PEDIDO: FileText,
  CONTRATO: ScrollText,
  PAGAMENTO: Receipt,
};

const KIND_LABEL: Record<string, string> = {
  CLIENTE: "Clientes",
  CREDITO: "Créditos",
  PEDIDO: "Pedidos",
  CONTRATO: "Contratos",
  PAGAMENTO: "Pagamentos",
};

const KIND_KEYS: Array<[string, keyof SearchGroups]> = [
  ["CLIENTE", "clients"],
  ["CREDITO", "loans"],
  ["PEDIDO", "requests"],
  ["CONTRATO", "contracts"],
  ["PAGAMENTO", "repayments"],
];

function targetFor(item: SearchResultItem): string {
  const meta = item.meta || {};
  switch (item.kind) {
    case "CLIENTE":
      return `/clients?search=${encodeURIComponent(item.title)}`;
    case "CREDITO":
      return `/credits?tab=estado&search=${encodeURIComponent(item.title)}`;
    case "PEDIDO":
      return `/credits?tab=pedidos&search=${encodeURIComponent(item.title)}`;
    case "CONTRATO":
      return `/credits?tab=estado&search=${encodeURIComponent(String(meta.contractNo || item.title))}`;
    case "PAGAMENTO":
      return `/payments?search=${encodeURIComponent(item.title)}`;
    default:
      return "/dashboard";
  }
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<SearchGroups | null>(null);
  const [total, setTotal] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const flat: SearchResultItem[] = groups
    ? [...groups.clients, ...groups.loans, ...groups.requests, ...groups.contracts, ...groups.repayments]
    : [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const q = term.trim();
    if (q.length < 2) {
      setGroups(null);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(async () => {
      try {
        const data = await apiFetch<{ query: string; total: number; groups: SearchGroups }>(
          `/search?q=${encodeURIComponent(q)}&limit=6`,
        );
        setGroups(data.groups);
        setTotal(data.total);
        setHighlight(0);
        setOpen(true);
      } catch {
        setGroups(null);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [term]);

  const go = (item: SearchResultItem) => {
    setOpen(false);
    setTerm("");
    navigate(targetFor(item));
  };

  return (
    <div ref={boxRef} className="relative hidden md:block w-72 lg:w-96">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => { if (flat.length) setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, flat.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && flat[highlight]) go(flat[highlight]);
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Pesquisar no CredMax… (cliente, CRD, REQ…)"
          className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 animate-pulse">…</span>
        )}
      </div>
      {open && flat.length > 0 && (
        <div className="absolute mt-2 w-full max-h-[60vh] overflow-auto bg-white rounded-xl shadow-xl border border-slate-200 z-50">
          <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-slate-400">
            {total} resultado{total === 1 ? "" : "s"}
          </p>
          {KIND_KEYS.map(([kind, key]) => {
            const items = groups?.[key] || [];
            if (!items.length) return null;
            const Icon = KIND_ICON[kind];
            return (
              <div key={kind} className="pb-1">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50">
                  {KIND_LABEL[kind]}
                </p>
                {items.map((item) => {
                  const idx = flat.indexOf(item);
                  return (
                    <button
                      key={`${kind}-${item.id}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(item)}
                      onMouseEnter={() => setHighlight(idx)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${idx === highlight ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                    >
                      <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-3.5 h-3.5 text-slate-500" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800 truncate">{item.title}</span>
                        <span className="block text-xs text-slate-500 truncate">
                          {item.subtitle}{item.status ? ` · ${item.status}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {open && term.trim().length >= 2 && !loading && flat.length === 0 && (
        <div className="absolute mt-2 w-full bg-white rounded-xl shadow-xl border border-slate-200 z-50 px-3 py-3 text-sm text-slate-500">
          Sem resultados para “{term.trim()}”.
        </div>
      )}
    </div>
  );
}

