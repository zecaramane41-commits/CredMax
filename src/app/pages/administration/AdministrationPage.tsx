import { useState, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router";
import {
  Building2,
  Users,
  UserCheck,
  Shield,
  Lock,
  Landmark,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import UtilizadoresPage from "./UtilizadoresPage";
import GestoresPage from "./GestoresPage";
import PerfisPage from "./PerfisPage";
import PermissoesPage from "./PermissoesPage";
import DepartamentosPage from "./DepartamentosPage";
import FormasPagamentoPage from "./FormasPagamentoPage";

export default function AdministrationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Detecta tab pela URL (query param ou sub-rota)
  const getInitialTab = () => {
    const qTab = searchParams.get("tab");
    if (qTab) return qTab;
    const path = location.pathname.toLowerCase();
    if (path.includes("gestores")) return "gestores";
    if (path.includes("perfis")) return "perfis";
    if (path.includes("permissoes")) return "permissoes";
    if (path.includes("departamentos")) return "departamentos";
    if (path.includes("formas-pagamento") || path.includes("contas")) return "formas-pagamento";
    return "utilizadores";
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
        <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Módulo de Administração</h1>
          <p className="text-sm text-slate-500">
            Gestão unificada de utilizadores, gestores, perfis, permissões, departamentos e formas de pagamento.
          </p>
        </div>
      </div>

      {/* Navegação por Abas Lado a Lado */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl h-auto min-w-max border border-slate-200">
            <TabsTrigger
              value="utilizadores"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Users className="w-4 h-4 text-blue-600" />
              Utilizadores
            </TabsTrigger>

            <TabsTrigger
              value="gestores"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <UserCheck className="w-4 h-4 text-indigo-600" />
              Gestores de Carteiras
            </TabsTrigger>

            <TabsTrigger
              value="perfis"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Shield className="w-4 h-4 text-purple-600" />
              Perfis
            </TabsTrigger>

            <TabsTrigger
              value="permissoes"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Lock className="w-4 h-4 text-amber-600" />
              Permissões
            </TabsTrigger>

            <TabsTrigger
              value="departamentos"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm rounded-lg"
            >
              <Building2 className="w-4 h-4 text-slate-600" />
              Departamentos
            </TabsTrigger>

            <TabsTrigger
              value="formas-pagamento"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Landmark className="w-4 h-4 text-emerald-600" />
              Formas de Pagamento
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Conteúdo de Cada Módulo */}
        <TabsContent value="utilizadores" className="mt-0">
          <UtilizadoresPage />
        </TabsContent>

        <TabsContent value="gestores" className="mt-0">
          <GestoresPage />
        </TabsContent>

        <TabsContent value="perfis" className="mt-0">
          <PerfisPage />
        </TabsContent>

        <TabsContent value="permissoes" className="mt-0">
          <PermissoesPage />
        </TabsContent>

        <TabsContent value="departamentos" className="mt-0">
          <DepartamentosPage />
        </TabsContent>

        <TabsContent value="formas-pagamento" className="mt-0">
          <FormasPagamentoPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
