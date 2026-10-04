import { useState, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router";
import {
  SlidersHorizontal,
  Package,
  Percent,
  AlertTriangle,
  Gauge,
  Calendar,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import ProdutosCreditoPage from "./ProdutosCreditoPage";
import TaxasPage from "./TaxasPage";
import PenalizacoesPage from "./PenalizacoesPage";
import LimitesPage from "./LimitesPage";
import CalendarioFinanceiroPage from "./CalendarioFinanceiroPage";

export default function ParametrizationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const getInitialTab = () => {
    const qTab = searchParams.get("tab");
    if (qTab) return qTab;
    const path = location.pathname.toLowerCase();
    if (path.includes("taxas")) return "taxas";
    if (path.includes("penalizacoes")) return "penalizacoes";
    if (path.includes("limites")) return "limites";
    if (path.includes("calendario")) return "calendario";
    return "produtos";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    setActiveTab(getInitialTab());
  }, [searchParams, location.pathname]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setSearchParams({ tab: val });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Principal */}
      <div className="flex items-center gap-3.5 pb-2 border-b border-slate-200">
        <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700">
          <SlidersHorizontal className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Módulo de Parametrização</h1>
          <p className="text-sm text-slate-500">
            Configuração de produtos de microcrédito, taxas de juro, penalizações de mora, limites e calendário.
          </p>
        </div>
      </div>

      {/* Navegação por Abas Lado a Lado */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl h-auto min-w-max border border-slate-200">
            <TabsTrigger
              value="produtos"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Package className="w-4 h-4 text-amber-600" />
              Produtos de Crédito
            </TabsTrigger>

            <TabsTrigger
              value="taxas"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Percent className="w-4 h-4 text-blue-600" />
              Taxas & Juros
            </TabsTrigger>

            <TabsTrigger
              value="penalizacoes"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-red-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Penalizações & Mora
            </TabsTrigger>

            <TabsTrigger
              value="limites"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Gauge className="w-4 h-4 text-purple-600" />
              Limites Operacionais
            </TabsTrigger>

            <TabsTrigger
              value="calendario"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Calendar className="w-4 h-4 text-emerald-600" />
              Calendário Financeiro
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Conteúdo de Cada Módulo */}
        <TabsContent value="produtos" className="mt-0">
          <ProdutosCreditoPage />
        </TabsContent>

        <TabsContent value="taxas" className="mt-0">
          <TaxasPage />
        </TabsContent>

        <TabsContent value="penalizacoes" className="mt-0">
          <PenalizacoesPage />
        </TabsContent>

        <TabsContent value="limites" className="mt-0">
          <LimitesPage />
        </TabsContent>

        <TabsContent value="calendario" className="mt-0">
          <CalendarioFinanceiroPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
