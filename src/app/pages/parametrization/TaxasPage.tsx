import { useState, useEffect, useCallback } from "react";
import {
  Percent,
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Calendar,
  DollarSign,
  Shield,
  Loader2,
  RefreshCw,
  Info,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { formatCurrencyMT } from "../../lib/format";
import {
  fetchCompanyCharges,
  createCompanyCharge,
  updateCompanyCharge,
  deleteCompanyCharge,
  fetchApprovalPolicy,
  updateApprovalPolicy,
  type CompanyCharge,
  type ApprovalPolicy,
} from "../../lib/charges";

export default function TaxasPage() {
  const user = getUser();
  const canManage = hasPermission(user, "alterar.parametros.negocio") || user?.role === "admin";

  // Estados de Política Financeira
  const [policy, setPolicy] = useState<ApprovalPolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [formCustosAdminRate, setFormCustosAdminRate] = useState("2.0");
  const [formInterestRate, setFormInterestRate] = useState("30.0");
  const [formMaxTermMonths, setFormMaxTermMonths] = useState("24");
  const [formDailyPenaltyRate, setFormDailyPenaltyRate] = useState("2.0");

  // Estados de Encargos
  const [charges, setCharges] = useState<CompanyCharge[]>([]);
  const [loadingCharges, setLoadingCharges] = useState(true);
  const [searchCharge, setSearchCharge] = useState("");

  // Modal de Encargo
  const [modalChargeOpen, setModalChargeOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<CompanyCharge | null>(null);
  const [chargeName, setChargeName] = useState("");
  const [chargeType, setChargeType] = useState<"fixed" | "percentage">("fixed");
  const [chargeDefaultValue, setChargeDefaultValue] = useState("");
  const [chargeIsRequired, setChargeIsRequired] = useState(false);
  const [chargeIsActive, setChargeIsActive] = useState(true);
  const [savingCharge, setSavingCharge] = useState(false);

  // Carregar dados
  const loadData = useCallback(async () => {
    try {
      setLoadingPolicy(true);
      setLoadingCharges(true);

      const [policyData, chargesData] = await Promise.all([
        fetchApprovalPolicy().catch(() => null),
        fetchCompanyCharges().catch(() => []),
      ]);

      if (policyData) {
        setPolicy(policyData);
        setFormCustosAdminRate(String(policyData.defaultAdministrativeFeeRate ?? 2.0));
        setFormInterestRate(String(policyData.defaultInterestRate ?? 30.0));
        setFormMaxTermMonths(String(policyData.maxLoanTermMonths ?? 24));
        setFormDailyPenaltyRate(String(policyData.defaultDailyPenaltyRate ?? 2.0));
      }

      setCharges(chargesData);
    } catch (err) {
      toast.error("Erro ao carregar parâmetros e encargos.");
    } finally {
      setLoadingPolicy(false);
      setLoadingCharges(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Salvar Parâmetros Financeiros
  const handleSavePolicy = async () => {
    if (!policy) return;
    setSavingPolicy(true);
    try {
      const updated = await updateApprovalPolicy({
        ...policy,
        defaultAdministrativeFeeRate: Number(formCustosAdminRate) || 2.0,
        defaultInterestRate: Number(formInterestRate) || 30.0,
        maxLoanTermMonths: Number(formMaxTermMonths) || 24,
        defaultDailyPenaltyRate: Number(formDailyPenaltyRate) || 2.0,
      });
      setPolicy(updated);
      toast.success("Parâmetros financeiros e taxas atualizados com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar parâmetros.");
    } finally {
      setSavingPolicy(false);
    }
  };

  // Abrir Modal para Novo ou Editar Encargo
  const handleOpenNewCharge = () => {
    setEditingCharge(null);
    setChargeName("");
    setChargeType("fixed");
    setChargeDefaultValue("");
    setChargeIsRequired(false);
    setChargeIsActive(true);
    setModalChargeOpen(true);
  };

  const handleOpenEditCharge = (charge: CompanyCharge) => {
    setEditingCharge(charge);
    setChargeName(charge.name);
    setChargeType(charge.type);
    setChargeDefaultValue(String(charge.defaultValue || 0));
    setChargeIsRequired(charge.isRequired);
    setChargeIsActive(charge.isActive);
    setModalChargeOpen(true);
  };

  // Salvar Encargo
  const handleSaveCharge = async () => {
    if (!chargeName.trim()) {
      toast.error("O nome do encargo é obrigatório.");
      return;
    }
    setSavingCharge(true);
    try {
      const val = Number(chargeDefaultValue) || 0;
      if (editingCharge) {
        const updated = await updateCompanyCharge(editingCharge.id, {
          name: chargeName.trim(),
          type: chargeType,
          defaultValue: val,
          isRequired: chargeIsRequired,
          isActive: chargeIsActive,
        });
        setCharges((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success("Encargo atualizado com sucesso.");
      } else {
        const created = await createCompanyCharge({
          name: chargeName.trim(),
          type: chargeType,
          defaultValue: val,
          isRequired: chargeIsRequired,
          isActive: chargeIsActive,
        });
        setCharges((prev) => [created, ...prev]);
        toast.success("Novo encargo cadastrado com sucesso.");
      }
      setModalChargeOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar encargo.");
    } finally {
      setSavingCharge(false);
    }
  };

  // Alternar Ativação de Encargo
  const handleToggleChargeActive = async (charge: CompanyCharge) => {
    try {
      const updated = await updateCompanyCharge(charge.id, {
        name: charge.name,
        type: charge.type,
        defaultValue: charge.defaultValue,
        isRequired: charge.isRequired,
        isActive: !charge.isActive,
      });
      setCharges((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`Encargo ${updated.isActive ? "ativado" : "desativado"}.`);
    } catch (err) {
      toast.error("Erro ao alterar status do encargo.");
    }
  };

  // Excluir Encargo
  const handleDeleteCharge = async (id: number) => {
    if (!window.confirm("Deseja realmente remover este encargo?")) return;
    try {
      await deleteCompanyCharge(id);
      setCharges((prev) => prev.filter((c) => c.id !== id));
      toast.success("Encargo removido com sucesso.");
    } catch (err) {
      toast.error("Erro ao remover encargo.");
    }
  };

  const filteredCharges = charges.filter((c) =>
    c.name.toLowerCase().includes(searchCharge.toLowerCase()),
  );

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>Apenas administradores podem gerir taxas e encargos do sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl shadow-lg text-white">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Taxas, Custos e Encargos</h1>
            <p className="text-sm text-slate-500">
              Parametrização central das taxas de crédito, custos administrativos e tabela de encargos
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar Dados
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PARTE 1: PARÂMETROS FINANCEIROS CENTRAIS DO CRÉDITO
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <Percent className="w-5 h-5 text-indigo-600" />
            Parâmetros Gerais de Concessão de Crédito
          </div>
          <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded-full border border-indigo-200">
            Políticas Padrão
          </span>
        </div>

        {loadingPolicy ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Taxa de Custo Administrativo */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Taxa de Custo Administrativo (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={100}
                    value={formCustosAdminRate}
                    onChange={(e) => setFormCustosAdminRate(e.target.value)}
                    className="w-full h-10 px-3 pr-8 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[11px] text-slate-500">
                  Percentagem calculada no pedido e abatida no desembolso (Padrão: 2.0%).
                </p>
              </div>

              {/* Taxa Padrão de Juros */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Taxa Padrão de Juros (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={100}
                    value={formInterestRate}
                    onChange={(e) => setFormInterestRate(e.target.value)}
                    className="w-full h-10 px-3 pr-8 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[11px] text-slate-500">
                  Taxa de juro sugerida para novos contratos (Padrão: 30.0% a.m.).
                </p>
              </div>

              {/* Prazo Máximo de Concessão */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Prazo Máximo (Meses)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={formMaxTermMonths}
                    onChange={(e) => setFormMaxTermMonths(e.target.value)}
                    className="w-full h-10 px-3 pr-10 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[11px] text-slate-500">
                  Limite máximo de amortização permitido para os créditos (ex: 24 meses).
                </p>
              </div>

              {/* Penalização Diária por Mora */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Taxa de Mora Diária (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={100}
                    value={formDailyPenaltyRate}
                    onChange={(e) => setFormDailyPenaltyRate(e.target.value)}
                    className="w-full h-10 px-3 pr-8 rounded-lg border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[11px] text-slate-500">
                  Penalização por atraso aplicada sobre o saldo em mora (Padrão: 2.0%/dia).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Info className="w-4 h-4 text-indigo-500" />
                As alterações nestas taxas influenciarão automaticamente os novos formulários de pedido de crédito.
              </div>
              <button
                onClick={handleSavePolicy}
                disabled={savingPolicy}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {savingPolicy && <Loader2 className="w-4 h-4 animate-spin" />}
                {savingPolicy ? "A Guardar..." : "Guardar Parâmetros de Crédito"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PARTE 2: GESTÃO DE ENCARGOS DO SISTEMA
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <Tag className="w-5 h-5 text-indigo-600" />
              Tabela de Encargos do Sistema
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Encargos listados no formulário de pedido de crédito para dedução direta no desembolso
            </p>
          </div>
          <button
            onClick={handleOpenNewCharge}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            + Novo Encargo
          </button>
        </div>

        {/* Barra de Pesquisa */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar encargo..."
            value={searchCharge}
            onChange={(e) => setSearchCharge(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>

        {/* Tabela de Encargos */}
        {loadingCharges ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>
        ) : filteredCharges.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
            <Tag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">Nenhum encargo encontrado</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
              Cadastre taxas de abertura, vistorias ou seguros para aparecerem no pedido.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-4 py-3 text-left">Nome do Encargo</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Valor Padrão</th>
                  <th className="px-4 py-3 text-center">Obrigatório</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCharges.map((charge) => (
                  <tr key={charge.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{charge.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          charge.type === "percentage"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {charge.type === "percentage" ? "Percentual (%)" : "Valor Fixo (MT)"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {charge.type === "percentage"
                        ? `${charge.defaultValue}%`
                        : formatCurrencyMT(charge.defaultValue)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          charge.isRequired
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {charge.isRequired ? "Sim" : "Opcional"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          charge.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {charge.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        onClick={() => handleToggleChargeActive(charge)}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      >
                        {charge.isActive ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        onClick={() => handleOpenEditCharge(charge)}
                        className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors inline-flex items-center justify-center"
                        title="Editar encargo"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCharge(charge.id)}
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors inline-flex items-center justify-center"
                        title="Remover encargo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: CRIAR / EDITAR ENCARGO
      ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalChargeOpen} onOpenChange={setModalChargeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCharge ? "Editar Encargo" : "Novo Encargo de Crédito"}</DialogTitle>
            <DialogDescription>
              Configure o nome, modalidade e valor padrão do encargo para utilização no sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-sm">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Encargo *</label>
              <input
                type="text"
                value={chargeName}
                onChange={(e) => setChargeName(e.target.value)}
                placeholder="Ex: Taxa de Abertura / Seguro de Vida"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Cálculo</label>
                <select
                  value={chargeType}
                  onChange={(e) => setChargeType(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="fixed">Valor Fixo (MT)</option>
                  <option value="percentage">Percentagem (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Valor Padrão {chargeType === "percentage" ? "(%)" : "(MT)"}
                </label>
                <input
                  type="number"
                  step={chargeType === "percentage" ? 0.1 : 10}
                  value={chargeDefaultValue}
                  onChange={(e) => setChargeDefaultValue(e.target.value)}
                  placeholder={chargeType === "percentage" ? "1.5" : "500.00"}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="text-xs font-bold text-slate-800">Obrigatório no Pedido?</div>
                <div className="text-[11px] text-slate-500">
                  Se marcado, será pré-selecionado em todos os novos pedidos.
                </div>
              </div>
              <input
                type="checkbox"
                checked={chargeIsRequired}
                onChange={(e) => setChargeIsRequired(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="text-xs font-bold text-slate-800">Ativo no Sistema?</div>
                <div className="text-[11px] text-slate-500">
                  Disponível para seleção pelos operadores e gestores.
                </div>
              </div>
              <input
                type="checkbox"
                checked={chargeIsActive}
                onChange={(e) => setChargeIsActive(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalChargeOpen(false)}
              className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-xl hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveCharge}
              disabled={savingCharge}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {savingCharge && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {savingCharge ? "A Salvar..." : "Salvar Encargo"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}