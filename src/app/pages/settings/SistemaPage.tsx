import { useState, useEffect } from "react";
import {
  Type,
  Palette,
  Sliders,
  Monitor,
  Globe,
  Building2,
  Bell,
  Check,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  FONT_SIZES,
  THEME_COLORS,
  getSystemFontSize,
  setSystemFontSize,
  getSystemTheme,
  setSystemTheme,
  type SystemFontSize,
  type SystemThemeColor,
} from "../../lib/theme";

export default function SistemaPage() {
  const [currentFontSize, setCurrentFontSize] = useState<SystemFontSize>("normal");
  const [currentTheme, setCurrentTheme] = useState<SystemThemeColor>("emerald");

  // Preferências adicionais do sistema
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [tableDensity, setTableDensity] = useState<"compact" | "normal">("normal");
  const [autoRefreshSecs, setAutoRefreshSecs] = useState("30");

  useEffect(() => {
    setCurrentFontSize(getSystemFontSize());
    setCurrentTheme(getSystemTheme());
  }, []);

  const handleChangeFontSize = (size: SystemFontSize) => {
    setCurrentFontSize(size);
    setSystemFontSize(size);
    toast.success(`Tamanho de fonte alterado para "${FONT_SIZES.find((f) => f.id === size)?.label}".`);
  };

  const handleChangeTheme = (theme: SystemThemeColor) => {
    setCurrentTheme(theme);
    setSystemTheme(theme);
    toast.success(`Tema do sistema alterado para "${THEME_COLORS.find((t) => t.id === theme)?.label}".`);
  };

  const handleResetDefaults = () => {
    handleChangeFontSize("normal");
    handleChangeTheme("emerald");
    setSoundEnabled(true);
    setTableDensity("normal");
    setAutoRefreshSecs("30");
    toast.success("Configurações visuais restauradas para o padrão.");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-lg text-white">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Configurações do Sistema</h1>
            <p className="text-sm text-slate-500">
              Personalização visual global, tamanho de fontes, temas de cores e preferências gerais
            </p>
          </div>
        </div>
        <button
          onClick={handleResetDefaults}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors self-start sm:self-auto shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restaurar Padrões
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BLOCO 1: CONTROLE GLOBAL DO TAMANHO DAS FONTES (AFETA TODO O SISTEMA)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
            <Type className="w-5 h-5 text-indigo-600" />
            Tamanho da Fonte Global do Sistema
          </div>
          <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded-full border border-indigo-200">
            Tempo Real em Todas as Telas
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Escolha o tamanho de texto ideal para o seu ecrã. A alteração é instantânea e é mantida no seu navegador para todas as abas, relatórios e formulários.
        </p>

        {/* Grade de Seletores de Tamanho */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FONT_SIZES.map((fontSize) => {
            const isSelected = currentFontSize === fontSize.id;
            return (
              <button
                key={fontSize.id}
                type="button"
                onClick={() => handleChangeFontSize(fontSize.id)}
                className={`text-left p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/50 shadow-md ring-2 ring-indigo-200"
                    : "border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-900">{fontSize.label}</span>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mb-3">{fontSize.desc}</div>
                </div>

                <div className="pt-3 border-t border-slate-200/70 flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">Escala: {fontSize.scale}</span>
                  <span
                    className="font-bold text-indigo-900"
                    style={{
                      fontSize:
                        fontSize.id === "small"
                          ? "12px"
                          : fontSize.id === "normal"
                          ? "14px"
                          : fontSize.id === "large"
                          ? "16px"
                          : "18px",
                    }}
                  >
                    Exemplo Aa
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Caixa de Demonstração Interativa do Tamanho */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
          <div className="text-xs font-bold text-slate-700">Pré-visualização do Texto no Sistema:</div>
          <p className="text-slate-800 leading-relaxed">
            "O microcrédito promove o desenvolvimento económico e financeiro sustentável através da concessão responsável de crédito e acompanhamento contínuo de clientes."
          </p>
          <div className="text-[11px] text-slate-400">
            Tamanho atual aplicado: <b>{FONT_SIZES.find((f) => f.id === currentFontSize)?.label}</b> (
            {FONT_SIZES.find((f) => f.id === currentFontSize)?.px})
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BLOCO 2: TEMA DE CORES VISUAL DO SISTEMA
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
            <Palette className="w-5 h-5 text-indigo-600" />
            Tema de Cores e Identidade Visual
          </div>
          <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2.5 py-1 rounded-full">
            Aparência
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {THEME_COLORS.map((theme) => {
            const isSelected = currentTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleChangeTheme(theme.id)}
                className={`text-left p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/50 shadow-md ring-2 ring-indigo-200"
                    : "border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border border-black/10 shadow-sm"
                        style={{ backgroundColor: theme.primaryHex }}
                      />
                      <span className="text-sm font-bold text-slate-900">{theme.label}</span>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{theme.desc}</div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-200/70 flex gap-1.5">
                  <div
                    className="h-2 rounded-full flex-1"
                    style={{ backgroundColor: theme.primaryHex }}
                  />
                  <div className="h-2 rounded-full w-4 bg-slate-300" />
                  <div className="h-2 rounded-full w-2 bg-slate-200" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BLOCO 3: DADOS DA EMPRESA & PREFERÊNCIAS GERAIS
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Painel da Empresa */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Dados Cadastrais da Empresa
            </div>
            <p className="text-xs text-slate-500">
              Nome comercial, NUIT, endereço provincial, telefones de contacto e logótipo oficial para contratos e relatórios.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <Link
              to="/settings/empresa"
              className="inline-flex items-center justify-between w-full px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-200 transition-colors"
            >
              <span>Gerir Cadastro e Logótipo da Empresa</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Preferências Regionais e Localização */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <Globe className="w-5 h-5 text-indigo-600" />
            Padrões Regionais (Moçambique)
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-slate-500 font-medium">Moeda Oficial</div>
              <div className="font-bold text-slate-800 text-sm mt-0.5">MT (Metical)</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-slate-500 font-medium">Fuso Horário</div>
              <div className="font-bold text-slate-800 text-sm mt-0.5">CAT (Maputo / GMT+2)</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-slate-500 font-medium">Formato de Data</div>
              <div className="font-bold text-slate-800 text-sm mt-0.5">DD/MM/AAAA</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-slate-500 font-medium">Idioma do Sistema</div>
              <div className="font-bold text-slate-800 text-sm mt-0.5">Português (MZ)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}