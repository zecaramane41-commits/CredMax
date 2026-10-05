import { useEffect, useRef, useState } from "react";
import { Search, ArrowRight, UserRound, CreditCard, ClipboardList, Receipt, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { globalSearch, type GlobalSearchResult } from "../../lib/global-search";

const icons = {
  client: UserRound,
  loan: CreditCard,
  request: ClipboardList,
  payment: Receipt,
} as const;

const labels = { client: "Cliente", loan: "Crédito", request: "Pedido", payment: "Pagamento" } as const;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  useEffect(() => {
    const value = term.trim();
    if (value.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const data = await globalSearch(value);
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [term]);

  const go = (item: GlobalSearchResult) => {
    if (!item.href) return;
    setOpen(false);
    setTerm("");
    navigate(item.href);
  };

  return (
    <div className="relative hidden md:block w-full max-w-md">
      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 shadow-sm focus-within:border-indigo-300 focus-within:bg-white">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <Search className="h-4 w-4 text-slate-400" />}
        <input
          value={term}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && results[0]) go(results[0]); }}
          placeholder="Pesquisar clientes, créditos, pedidos..."
          className="h-10 w-full bg-transparent px-2 text-sm outline-none placeholder:text-slate-400"
          aria-label="Pesquisa global"
        />
      </div>
      {open && term.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {loading && !results.length ? (
            <div className="p-4 text-sm text-slate-500">A pesquisar...</div>
          ) : results.length ? (
            <div className="max-h-96 overflow-y-auto py-1">
              {results.map((item) => {
                const Icon = icons[item.type];
                return (
                  <button key={`${item.type}-${item.id}`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(item)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-50">
                    <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-slate-900">{item.title}</p><span className="text-[10px] uppercase text-slate-400">{labels[item.type]}</span></div>
                      <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                  </button>
                );
              })}
            </div>
          ) : <div className="p-4 text-sm text-slate-500">Nenhum resultado encontrado.</div>}
        </div>
      )}
    </div>
  );
}
