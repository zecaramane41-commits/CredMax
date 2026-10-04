import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { FileText, Search, CheckSquare, ShieldCheck, Banknote, Activity, CreditCard } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import PedidosPage from "./PedidosPage";
import AnalisePage from "./AnalisePage";
import AprovacaoPage from "./AprovacaoPage";
import AutorizacaoPage from "./AutorizacaoPage";
import DesembolsoPage from "./DesembolsoPage";
import EstadoCreditoPage from "./EstadoCreditoPage";

type TabKey =
  | "pedidos"
  | "analise"
  | "aprovacao"
  | "autorizacao"
  | "desembolso"
  | "estado";

const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "pedidos", label: "Pedidos", icon: FileText },
  { key: "analise", label: "Análise", icon: Search },
  { key: "aprovacao", label: "Aprovação", icon: CheckSquare },
  { key: "autorizacao", label: "Autorização", icon: ShieldCheck },
  { key: "desembolso", label: "Desembolso", icon: Banknote },
  { key: "estado", label: "Estado do Crédito", icon: Activity },
];

export default function CreditsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") as TabKey | null;
  const validTab = requested && TABS.some((t) => t.key === requested) ? requested : "pedidos";
  const [tab, setTab] = useState<TabKey>(validTab);

  // Sincroniza a aba quando o menu navega com ?tab=... enquanto já estamos na página
  useEffect(() => {
    if (requested && TABS.some((t) => t.key === requested)) {
      setTab(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const handleTabChange = (value: string) => {
    const key = value as TabKey;
    setTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do módulo */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl shadow-lg">
          <CreditCard className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Crédito</h1>
          <p className="text-sm text-slate-500">
            Ciclo completo dos créditos: pedidos, análise, aprovação, autorização, desembolso e estado
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                <Icon className="w-4 h-4" />
                <span className="truncate">{t.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="pedidos" className="mt-6">
          <PedidosPage />
        </TabsContent>
        <TabsContent value="analise" className="mt-6">
          <AnalisePage />
        </TabsContent>
        <TabsContent value="aprovacao" className="mt-6">
          <AprovacaoPage />
        </TabsContent>
        <TabsContent value="autorizacao" className="mt-6">
          <AutorizacaoPage />
        </TabsContent>
        <TabsContent value="desembolso" className="mt-6">
          <DesembolsoPage />
        </TabsContent>
        <TabsContent value="estado" className="mt-6">
          <EstadoCreditoPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
