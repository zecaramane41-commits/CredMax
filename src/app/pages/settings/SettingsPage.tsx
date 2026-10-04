import { useState, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router";
import {
  Settings,
  Building2,
  Sliders,
  Link as LinkIcon,
  HardDrive,
  Shield,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import EmpresaPage from "./EmpresaPage";
import SistemaPage from "./SistemaPage";
import IntegracoesPage from "./IntegracoesPage";
import BackupPage from "./BackupPage";
import SegurancaPage from "./SegurancaPage";

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const getInitialTab = () => {
    const qTab = searchParams.get("tab");
    if (qTab) return qTab;
    const path = location.pathname.toLowerCase();
    if (path.includes("empresa")) return "empresa";
    if (path.includes("integracoes")) return "integracoes";
    if (path.includes("backup")) return "backup";
    if (path.includes("seguranca")) return "seguranca";
    return "empresa";
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
        <div className="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configurações Gerais do Sistema</h1>
          <p className="text-sm text-slate-500">
            Perfil da empresa, parâmetros do sistema, integrações, backup e políticas de segurança.
          </p>
        </div>
      </div>

      {/* Navegação por Abas Lado a Lado */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl h-auto min-w-max border border-slate-200">
            <TabsTrigger
              value="empresa"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Building2 className="w-4 h-4 text-emerald-600" />
              Perfil da Empresa
            </TabsTrigger>

            <TabsTrigger
              value="sistema"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Sliders className="w-4 h-4 text-blue-600" />
              Sistema & Aparência
            </TabsTrigger>

            <TabsTrigger
              value="integracoes"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <LinkIcon className="w-4 h-4 text-purple-600" />
              Integrações
            </TabsTrigger>

            <TabsTrigger
              value="backup"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-amber-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <HardDrive className="w-4 h-4 text-amber-600" />
              Backup & Dados
            </TabsTrigger>

            <TabsTrigger
              value="seguranca"
              className="py-2.5 px-4 gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-red-700 data-[state=active]:shadow-sm rounded-lg"
            >
              <Shield className="w-4 h-4 text-red-600" />
              Segurança
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Conteúdo de Cada Módulo */}
        <TabsContent value="empresa" className="mt-0">
          <EmpresaPage />
        </TabsContent>

        <TabsContent value="sistema" className="mt-0">
          <SistemaPage />
        </TabsContent>

        <TabsContent value="integracoes" className="mt-0">
          <IntegracoesPage />
        </TabsContent>

        <TabsContent value="backup" className="mt-0">
          <BackupPage />
        </TabsContent>

        <TabsContent value="seguranca" className="mt-0">
          <SegurancaPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
