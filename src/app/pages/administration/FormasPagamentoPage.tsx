import { useState, useEffect } from "react";
import {
  Landmark,
  Smartphone,
  Coins,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Building2,
  Star,
  ShieldCheck,
  RefreshCw,
  Search,
  FileText,
  Phone,
  CreditCard,
  Layers,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { toast } from "sonner";
import {
  fetchPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  type PaymentMethod,
  type PaymentMethodType,
} from "../../lib/payment-methods";

const MOZ_BANKS = [
  "BCI (Banco Comercial e de Investimentos)",
  "Millennium BIM",
  "Standard Bank Mo�ambique",
  "Moza Banco",
  "Absa Bank Mo�ambique",
  "Nedbank Mo�ambique",
  "Access Bank Mo�ambique",
  "First Capital Bank",
  "Banco Mais",
  "Ecobank Mo�ambique",
  "FNB Mo�ambique",
  "Soci�t� G�n�rale Mo�ambique",
  "Outro Banco",
];

const MOZ_WALLETS = [
  { id: "M-Pesa", name: "M-Pesa (Vodacom)", code: "Vodacom" },
  { id: "E-Mola", name: "E-Mola (Movitel)", code: "Movitel" },
  { id: "M-Kesh", name: "M-Kesh (Tmcel)", code: "Tmcel" },
];

export default function FormasPagamentoPage() {
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PaymentMethod | null>(null);

  // Form states
  const [formType, setFormType] = useState<PaymentMethodType>("banco");
  const [formName, setFormName] = useState("");
  const [formBankName, setFormBankName] = useState(MOZ_BANKS[0]);
  const [formCustomBank, setFormCustomBank] = useState("");
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formNibIban, setFormNibIban] = useState("");
  const [formAccountHolder, setFormAccountHolder] = useState("");
  const [formBranch, setFormBranch] = useState("");

  const [formProvider, setFormProvider] = useState("M-Pesa");
  const [formPhoneNumber, setFormPhoneNumber] = useState("");
  const [formAgentCode, setFormAgentCode] = useState("");

  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentMethods(false);
      setItems(data);
    } catch {
      toast.error("Erro ao carregar formas de pagamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openNewModal = () => {
    setEditingItem(null);
    setFormType("banco");
    setFormName("");
    setFormBankName(MOZ_BANKS[0]);
    setFormCustomBank("");
    setFormAccountNumber("");
    setFormNibIban("");
    setFormAccountHolder("");
    setFormBranch("");
    setFormProvider("M-Pesa");
    setFormPhoneNumber("");
    setFormAgentCode("");
    setFormIsDefault(items.length === 0);
    setFormIsActive(true);
    setFormNotes("");
    setShowModal(true);
  };

  const openEditModal = (item: PaymentMethod) => {
    setEditingItem(item);
    setFormType(item.type);
    setFormName(item.name || "");
    if (MOZ_BANKS.some((b) => b.includes(item.bankName || ""))) {
      const match = MOZ_BANKS.find((b) => b.includes(item.bankName || ""));
      setFormBankName(match || MOZ_BANKS[0]);
      setFormCustomBank("");
    } else {
      setFormBankName("Outro Banco");
      setFormCustomBank(item.bankName || "");
    }
    setFormAccountNumber(item.accountNumber || "");
    setFormNibIban(item.nibIban || "");
    setFormAccountHolder(item.accountHolder || "");
    setFormBranch(item.branch || "");
    setFormProvider(item.provider || "M-Pesa");
    setFormPhoneNumber(item.phoneNumber || "");
    setFormAgentCode(item.agentCode || "");
    setFormIsDefault(item.isDefault);
    setFormIsActive(item.isActive);
    setFormNotes(item.notes || "");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("Informe a identificacao da conta.");
      return;
    }

    const finalBankName = formType === "banco"
      ? (formBankName === "Outro Banco" ? formCustomBank.trim() : formBankName)
      : undefined;

    if (formType === "banco") {
      if (!finalBankName) {
        toast.error("Informe o Banco.");
        return;
      }
      if (!formAccountNumber.trim()) {
        toast.error("Informe o numero da conta bancaria.");
        return;
      }
    }

    if (formType === "carteira_movel") {
      if (!formPhoneNumber.trim() && !formAccountNumber.trim()) {
        toast.error("Informe o numero de telefone da carteira movel.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Partial<PaymentMethod> = {
        type: formType,
        name: formName.trim(),
        bankName: formType === "banco" ? finalBankName : null,
        accountNumber: formType === "banco" ? formAccountNumber.trim() : (formPhoneNumber.trim() || formAccountNumber.trim()),
        nibIban: formType === "banco" ? formNibIban.trim() : null,
        accountHolder: formAccountHolder.trim() || null,
        branch: formType === "banco" ? formBranch.trim() : null,
        provider: formType === "carteira_movel" ? formProvider : null,
        phoneNumber: formType === "carteira_movel" ? formPhoneNumber.trim() : null,
        agentCode: formType === "carteira_movel" ? formAgentCode.trim() : null,
        isDefault: formIsDefault,
        isActive: formIsActive,
        notes: formNotes.trim() || null,
      };

      if (editingItem) {
        await updatePaymentMethod(editingItem.id, payload);
        toast.success("Forma de pagamento atualizada com sucesso.");
      } else {
        await createPaymentMethod(payload);
        toast.success("Forma de pagamento criada com sucesso.");
      }

      setShowModal(false);
      void loadData();
    } catch (err: any) {
      toast.error(err.message || "Falha ao salvar forma de pagamento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: PaymentMethod) => {
    if (!window.confirm(`Deseja realmente eliminar a forma de pagamento "${item.name}"?`)) {
      return;
    }
    try {
      await deletePaymentMethod(item.id);
      toast.success("Forma de pagamento eliminada.");
      void loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao eliminar.");
    }
  };

  const handleSetDefault = async (item: PaymentMethod) => {
    try {
      await updatePaymentMethod(item.id, { isDefault: true, isActive: true });
      toast.success(`"${item.name}" definida como conta padrao.`);
      void loadData();
    } catch {
      toast.error("Erro ao atualizar conta padrao.");
    }
  };

  const filteredItems = items.filter((it) => {
    if (filterType !== "all" && it.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = it.name?.toLowerCase().includes(q);
      const matchBank = it.bankName?.toLowerCase().includes(q);
      const matchAcc = it.accountNumber?.toLowerCase().includes(q);
      const matchHolder = it.accountHolder?.toLowerCase().includes(q);
      const matchProv = it.provider?.toLowerCase().includes(q);
      const matchPhone = it.phoneNumber?.toLowerCase().includes(q);
      return matchName || matchBank || matchAcc || matchHolder || matchProv || matchPhone;
    }
    return true;
  });

  const countBancos = items.filter((i) => i.type === "banco").length;
  const countCarteiras = items.filter((i) => i.type === "carteira_movel").length;
  const countAtivas = items.filter((i) => i.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Landmark className="w-7 h-7 text-emerald-600" />
            Formas de Pagamento & Contas da Empresa
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Cadastre e gerencie as contas bancarias e carteiras moveis (M-Pesa, E-Mola) que constarao nos reembolsos e relatorios oficiais.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={openNewModal} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-medium shadow-sm">
            <Plus className="w-4 h-4" />
            Nova Forma de Pagamento
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Total de Formas</span>
            <p className="text-xl font-bold text-slate-800">{items.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Contas Bancarias</span>
            <p className="text-xl font-bold text-blue-700">{countBancos}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Carteiras Moveis</span>
            <p className="text-xl font-bold text-purple-700">{countCarteiras}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600 font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium">Contas Ativas</span>
            <p className="text-xl font-bold text-green-700">{countAtivas}</p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <Input
            placeholder="Pesquisar por banco, conta, titular, telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-10 px-3 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="all">Todos os Tipos</option>
            <option value="banco">Apenas Bancos</option>
            <option value="carteira_movel">Apenas Carteiras Moveis</option>
            <option value="caixa">Apenas Caixa Geral</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-slate-700 font-bold">Tipo</TableHead>
              <TableHead className="text-slate-700 font-bold">Identificacao da Conta</TableHead>
              <TableHead className="text-slate-700 font-bold">Instituicao / Provedor</TableHead>
              <TableHead className="text-slate-700 font-bold">Dados da Conta / NIB / Telefone</TableHead>
              <TableHead className="text-slate-700 font-bold">Titular da Conta</TableHead>
              <TableHead className="text-center text-slate-700 font-bold">Padrao</TableHead>
              <TableHead className="text-center text-slate-700 font-bold">Status</TableHead>
              <TableHead className="text-right text-slate-700 font-bold">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                  Nenhuma forma de pagamento encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id} className={!item.isActive ? "bg-slate-50/60 opacity-60" : ""}>
                  <TableCell>
                    {item.type === "banco" && (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 gap-1 text-xs">
                        <Building2 className="w-3 h-3" /> Banco
                      </Badge>
                    )}
                    {item.type === "carteira_movel" && (
                      <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100 gap-1 text-xs">
                        <Smartphone className="w-3 h-3" /> Carteira Movel
                      </Badge>
                    )}
                    {item.type === "caixa" && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 gap-1 text-xs">
                        <Coins className="w-3 h-3" /> Caixa Geral
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <span>{item.name}</span>
                      {item.isDefault && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0">
                          Padrao
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-700 font-medium">
                    {item.type === "banco" ? item.bankName || "Banco" : item.type === "carteira_movel" ? item.provider || "Carteira Movel" : "Tesouraria"}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-0.5">
                      {item.type === "banco" && (
                        <>
                          <div className="font-mono text-slate-800 font-medium">Conta: {item.accountNumber || "-"}</div>
                          {item.nibIban && <div className="text-slate-500 font-mono text-[11px]">NIB: {item.nibIban}</div>}
                          {item.branch && <div className="text-slate-500 text-[11px]">Balcao: {item.branch}</div>}
                        </>
                      )}
                      {item.type === "carteira_movel" && (
                        <>
                          <div className="font-mono text-slate-800 font-medium">Tel: {item.phoneNumber || item.accountNumber || "-"}</div>
                          {item.agentCode && <div className="text-slate-500 text-[11px]">Cod. Agente / Till: {item.agentCode}</div>}
                        </>
                      )}
                      {item.type === "caixa" && (
                        <div className="text-slate-600">{item.branch || "Balcao Central / Sede"}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-800 font-medium">
                    {item.accountHolder || "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {item.isDefault ? (
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500 mx-auto" />
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSetDefault(item)}
                        title="Tornar conta padrao para reembolsos"
                        className="h-7 px-2 text-[11px] text-slate-500 hover:text-amber-600"
                      >
                        Definir
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {item.isActive ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                        Ativa
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-300 text-xs">
                        Inativa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditModal(item)}
                        className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(item)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal de Criacao / Edicao de Forma de Pagamento */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[92vh] overflow-y-auto p-6">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <Landmark className="w-5 h-5" />
              <DialogTitle className="text-lg font-bold text-slate-900">
                {editingItem ? "Editar Forma de Pagamento" : "Nova Forma de Pagamento"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Configure os dados da conta bancaria ou carteira movel para exibicao nos formularios e relatorios.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Escolha do Tipo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tipo de Meio / Canal *</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={formType === "banco" ? "default" : "outline"}
                  onClick={() => setFormType("banco")}
                  className={formType === "banco" ? "bg-blue-600 hover:bg-blue-700 text-white text-xs h-10 gap-1.5" : "text-xs h-10 gap-1.5"}
                >
                  <Building2 className="w-4 h-4" /> Conta Bancaria
                </Button>
                <Button
                  type="button"
                  variant={formType === "carteira_movel" ? "default" : "outline"}
                  onClick={() => setFormType("carteira_movel")}
                  className={formType === "carteira_movel" ? "bg-purple-600 hover:bg-purple-700 text-white text-xs h-10 gap-1.5" : "text-xs h-10 gap-1.5"}
                >
                  <Smartphone className="w-4 h-4" /> Carteira Movel
                </Button>
                <Button
                  type="button"
                  variant={formType === "caixa" ? "default" : "outline"}
                  onClick={() => setFormType("caixa")}
                  className={formType === "caixa" ? "bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-10 gap-1.5" : "text-xs h-10 gap-1.5"}
                >
                  <Coins className="w-4 h-4" /> Caixa Geral
                </Button>
              </div>
            </div>

            {/* Identificacao Geral */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Nome / Identificacao da Conta *</Label>
              <Input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={
                  formType === "banco"
                    ? "Ex: Conta BCI Principal - Operacoes"
                    : formType === "carteira_movel"
                    ? "Ex: M-Pesa Negocios - Balcao Central"
                    : "Ex: Caixa Geral (Numerario)"
                }
                className="h-10 text-xs"
                required
              />
            </div>

            {/* Campos Condicionais para BANCO */}
            {formType === "banco" && (
              <div className="p-3.5 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" /> Dados da Conta Bancaria
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Instituicao Bancaria *</Label>
                    <select
                      value={formBankName}
                      onChange={(e) => setFormBankName(e.target.value)}
                      className="w-full h-9 px-2.5 border border-slate-300 rounded text-xs bg-white"
                      required
                    >
                      {MOZ_BANKS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  {formBankName === "Outro Banco" && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-700">Nome do Banco *</Label>
                      <Input
                        type="text"
                        value={formCustomBank}
                        onChange={(e) => setFormCustomBank(e.target.value)}
                        placeholder="Nome da instituicao"
                        className="h-9 text-xs"
                        required
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Numero da Conta *</Label>
                    <Input
                      type="text"
                      value={formAccountNumber}
                      onChange={(e) => setFormAccountNumber(e.target.value)}
                      placeholder="Ex: 20192837401"
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">NIB (21 digitos) / IBAN</Label>
                    <Input
                      type="text"
                      value={formNibIban}
                      onChange={(e) => setFormNibIban(e.target.value)}
                      placeholder="000800002019283740112"
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Titular da Conta</Label>
                    <Input
                      type="text"
                      value={formAccountHolder}
                      onChange={(e) => setFormAccountHolder(e.target.value)}
                      placeholder="Nome da empresa titular"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Agencia / Balcao</Label>
                    <Input
                      type="text"
                      value={formBranch}
                      onChange={(e) => setFormBranch(e.target.value)}
                      placeholder="Ex: Balcao Central Maputo"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Campos Condicionais para CARTEIRA MOVEL */}
            {formType === "carteira_movel" && (
              <div className="p-3.5 bg-purple-50/50 border border-purple-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-purple-600" /> Dados da Carteira Movel
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Provedor *</Label>
                    <select
                      value={formProvider}
                      onChange={(e) => setFormProvider(e.target.value)}
                      className="w-full h-9 px-2.5 border border-slate-300 rounded text-xs bg-white"
                      required
                    >
                      {MOZ_WALLETS.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Numero de Celular / Conta Movel *</Label>
                    <Input
                      type="text"
                      value={formPhoneNumber}
                      onChange={(e) => setFormPhoneNumber(e.target.value)}
                      placeholder="Ex: 841234567 ou 861234567"
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Nome do Titular / Conta Agente</Label>
                    <Input
                      type="text"
                      value={formAccountHolder}
                      onChange={(e) => setFormAccountHolder(e.target.value)}
                      placeholder="Nome registado no servico"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Codigo de Agente / Till / Entidade</Label>
                    <Input
                      type="text"
                      value={formAgentCode}
                      onChange={(e) => setFormAgentCode(e.target.value)}
                      placeholder="Ex: Till 12345 / Entidade 98765"
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Campos Condicionais para CAIXA GERAL */}
            {formType === "caixa" && (
              <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Responsavel pela Caixa</Label>
                    <Input
                      type="text"
                      value={formAccountHolder}
                      onChange={(e) => setFormAccountHolder(e.target.value)}
                      placeholder="Ex: Tesouraria Geral / Operador de Caixa"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Localizacao / Balcao</Label>
                    <Input
                      type="text"
                      value={formBranch}
                      onChange={(e) => setFormBranch(e.target.value)}
                      placeholder="Ex: Sede Central"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Observacoes & Opcoes */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Observacoes / Notas</Label>
                <Input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Informacoes adicionais para recibos e relatorios..."
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-semibold text-slate-800">Definir como Conta Padrao para Recebimentos</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-semibold text-slate-800">Conta Ativa</span>
                </label>
              </div>
            </div>

            {/* Botoes */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                {submitting ? "A guardar..." : editingItem ? "Salvar Alteracoes" : "Criar Forma de Pagamento"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
