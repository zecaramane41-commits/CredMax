import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Building2, Plus, Edit, Trash2, LogIn, KeyRound } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/api";
import { getUser, setActiveCompanyId } from "../../lib/auth";
import {
  MOZAMBIQUE_DOCUMENT_OPTIONS,
  MOZAMBIQUE_PROVINCES,
  formatMozAddress,
  getMozDistrictsByProvince,
  getMozDocumentInputConfig,
  normalizeMozDocumentNumber,
  normalizeMozNuit,
  parseMozAddress,
  validateMozDocumentNumber,
  validateMozNuit,
} from "../../lib/mozambique";
import { useNavigate } from "react-router";

type Company = {
  id: number;
  name: string;
  legalName: string;
  accountingTemplateCode?: string;
  nuit: string;
  phone: string;
  email: string;
  address: string;
  ownerName: string;
  ownerNuit: string;
  ownerPhone: string;
  ownerEmail: string;
  ownerDocumentType: string;
  ownerDocumentNumber: string;
  ownerAddress: string;
  logoUrl: string;
  authEnforceMfa: boolean;
  authSessionTimeoutMin: number;
  authSessionTimeoutAdminMin?: number | null;
  authSessionTimeoutManagerMin?: number | null;
  authSessionTimeoutOperatorMin?: number | null;
  authPasswordMinLength?: number;
  authPasswordRequireUpper?: boolean;
  authPasswordRequireLower?: boolean;
  authPasswordRequireNumber?: boolean;
  authPasswordRequireSpecial?: boolean;
  authPasswordExpiryDays?: number;
  authMaxLoginAttempts?: number;
  authLockoutMinutes?: number;
  privacyMaskSensitiveData: boolean;
  privacyAllowCrossCompanyLookup: boolean;
  adminUserId?: number | null;
  adminFullName?: string;
  adminEmail?: string;
  authMfaCode?: string;
  isActive: boolean;
  usersCount: number;
  clientsCount: number;
  loansCount: number;
  createdAt: string;
};

const emptyCompanyForm = {
  name: "",
  legalName: "",
  accountingTemplateCode: "microcredito",
  nuit: "",
  phone: "",
  email: "",
  address: "",
  companyProvince: "",
  companyDistrict: "",
  companyNeighborhood: "",
  ownerName: "",
  ownerNuit: "",
  ownerPhone: "",
  ownerEmail: "",
  ownerDocumentType: "",
  ownerDocumentNumber: "",
  ownerAddress: "",
  ownerProvince: "",
  ownerDistrict: "",
  ownerNeighborhood: "",
  logoUrl: "",
  authEnforceMfa: false,
  authSessionTimeoutMin: 30,
  authSessionTimeoutAdminMin: 30,
  authSessionTimeoutManagerMin: 30,
  authSessionTimeoutOperatorMin: 30,
  authPasswordMinLength: 8,
  authPasswordRequireUpper: true,
  authPasswordRequireLower: true,
  authPasswordRequireNumber: true,
  authPasswordRequireSpecial: true,
  authPasswordExpiryDays: 90,
  authMaxLoginAttempts: 5,
  authLockoutMinutes: 15,
  authMfaCode: "",
  adminFullName: "",
  adminEmail: "",
  adminPassword: "",
  privacyMaskSensitiveData: false,
  privacyAllowCrossCompanyLookup: false,
  isActive: true,
};

const ACCOUNTING_TEMPLATE_OPTIONS = [
  { value: "microcredito", label: "Microcredito" },
  { value: "comercio", label: "Comercio" },
  { value: "servicos", label: "Servicos" },
  { value: "agricultura", label: "Agricultura" },
  { value: "transporte", label: "Transporte e Logistica" },
];

function getTemplateLabel(templateCode?: string) {
  const normalized = String(templateCode || "").trim().toLowerCase();
  const found = ACCOUNTING_TEMPLATE_OPTIONS.find((item) => item.value === normalized);
  return found?.label || "Microcredito";
}

export default function AdminCompaniesPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyCompanyForm);

  const loadCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setPageError("");
      const data = await apiFetch<{ companies: Company[] }>("/admin/companies");
      setCompanies(data.companies || []);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Falha ao carregar empresas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) {
      navigate("/", { replace: true });
      return;
    }
    void loadCompanies();
  }, [isCentralAdmin, loadCompanies, navigate]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyCompanyForm);
    setFormError("");
    setShowForm(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyCompanyForm);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (company: Company) => {
    const companyAddress = parseMozAddress(company.address);
    const ownerAddress = parseMozAddress(company.ownerAddress);
    setFormError("");
    const ownerDocumentType = MOZAMBIQUE_DOCUMENT_OPTIONS.some((option) => option.value === company.ownerDocumentType)
      ? company.ownerDocumentType
      : "";
    setEditingId(company.id);
    setForm({
      name: company.name || "",
      legalName: company.legalName || "",
      accountingTemplateCode: company.accountingTemplateCode || "microcredito",
      nuit: normalizeMozNuit(company.nuit || ""),
      phone: company.phone || "",
      email: company.email || "",
      address: company.address || "",
      companyProvince: companyAddress.province,
      companyDistrict: companyAddress.district,
      companyNeighborhood: companyAddress.neighborhood,
      ownerName: company.ownerName || "",
      ownerNuit: normalizeMozNuit(company.ownerNuit || ""),
      ownerPhone: company.ownerPhone || "",
      ownerEmail: company.ownerEmail || "",
      ownerDocumentType,
      ownerDocumentNumber: normalizeMozDocumentNumber(company.ownerDocumentNumber || "", ownerDocumentType),
      ownerAddress: company.ownerAddress || "",
      ownerProvince: ownerAddress.province,
      ownerDistrict: ownerAddress.district,
      ownerNeighborhood: ownerAddress.neighborhood,
      logoUrl: company.logoUrl || "",
      authEnforceMfa: Boolean(company.authEnforceMfa),
      authSessionTimeoutMin: Number(company.authSessionTimeoutMin || 30),
      authSessionTimeoutAdminMin: company.authSessionTimeoutAdminMin ? Number(company.authSessionTimeoutAdminMin) : 30,
      authSessionTimeoutManagerMin: company.authSessionTimeoutManagerMin ? Number(company.authSessionTimeoutManagerMin) : 30,
      authSessionTimeoutOperatorMin: company.authSessionTimeoutOperatorMin ? Number(company.authSessionTimeoutOperatorMin) : 30,
      authPasswordMinLength: Number(company.authPasswordMinLength || 8),
      authPasswordRequireUpper: company.authPasswordRequireUpper !== false,
      authPasswordRequireLower: company.authPasswordRequireLower !== false,
      authPasswordRequireNumber: company.authPasswordRequireNumber !== false,
      authPasswordRequireSpecial: company.authPasswordRequireSpecial !== false,
      authPasswordExpiryDays: Number(company.authPasswordExpiryDays || 90),
      authMaxLoginAttempts: Number(company.authMaxLoginAttempts || 5),
      authLockoutMinutes: Number(company.authLockoutMinutes || 15),
      privacyMaskSensitiveData: Boolean(company.privacyMaskSensitiveData),
      privacyAllowCrossCompanyLookup: Boolean(company.privacyAllowCrossCompanyLookup),
      authMfaCode: "",
      adminFullName: company.adminFullName || "",
      adminEmail: company.adminEmail || "",
      adminPassword: "",
      isActive: company.isActive,
    });
    setShowForm(true);
  };

  const submitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setFormError("");
      setMessage("");
      const normalizedCompanyNuit = normalizeMozNuit(form.nuit);
      const normalizedOwnerNuit = normalizeMozNuit(form.ownerNuit);
      const normalizedOwnerDocumentNumber = normalizeMozDocumentNumber(form.ownerDocumentNumber, form.ownerDocumentType);

      const companyNuitError = validateMozNuit(normalizedCompanyNuit);
      if (companyNuitError) {
        setFormError(`NUIT da empresa: ${companyNuitError}`);
        return;
      }

      const ownerNuitError = validateMozNuit(normalizedOwnerNuit);
      if (ownerNuitError) {
        setFormError(`NUIT do proprietario: ${ownerNuitError}`);
        return;
      }

      const ownerDocumentError = validateMozDocumentNumber(normalizedOwnerDocumentNumber, form.ownerDocumentType);
      if (ownerDocumentError) {
        setFormError(ownerDocumentError);
        return;
      }

      if (!form.companyProvince || !form.companyDistrict) {
        setFormError("Selecione provincia e distrito da empresa.");
        return;
      }

      const hasOwnerAddressData = Boolean(form.ownerName || form.ownerNuit || form.ownerPhone || form.ownerEmail || form.ownerNeighborhood || form.ownerProvince || form.ownerDistrict);
      if (hasOwnerAddressData && (!form.ownerProvince || !form.ownerDistrict)) {
        setFormError("Selecione provincia e distrito da morada do proprietario.");
        return;
      }

      const {
        companyProvince,
        companyDistrict,
        companyNeighborhood,
        ownerProvince,
        ownerDistrict,
        ownerNeighborhood,
        ...basePayload
      } = form;

      const payload = {
        ...basePayload,
        nuit: normalizedCompanyNuit,
        ownerNuit: normalizedOwnerNuit,
        ownerDocumentNumber: normalizedOwnerDocumentNumber,
        address: formatMozAddress(companyProvince, companyDistrict, companyNeighborhood),
        ownerAddress: formatMozAddress(ownerProvince, ownerDistrict, ownerNeighborhood),
      };

      await apiFetch(editingId ? `/admin/companies/${editingId}` : "/admin/companies", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setMessage(editingId ? "Empresa atualizada com sucesso." : "Empresa criada com sucesso.");
      resetForm();
      await loadCompanies();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Falha ao salvar empresa.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setForm((s) => ({ ...s, logoUrl: value }));
    };
    reader.readAsDataURL(file);
  };

  const deleteCompany = async (id: number) => {
    const ok = window.confirm("Deseja remover esta empresa?");
    if (!ok) return;
    try {
      setPageError("");
      setMessage("");
      await apiFetch(`/admin/companies/${id}`, { method: "DELETE" });
      setMessage("Empresa removida com sucesso.");
      await loadCompanies();
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Falha ao remover empresa.");
    }
  };

  const resetAdminPassword = async (company: Company) => {
    const newPassword = window.prompt(`Nova senha para o admin da empresa ${company.name}:`);
    if (!newPassword) return;
    try {
      setPageError("");
      setMessage("");
      await apiFetch(`/admin/companies/${company.id}/admin/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      setMessage(`Senha do admin da empresa ${company.name} atualizada com sucesso.`);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Falha ao atualizar senha do admin.");
    }
  };

  const enterCompany = (company: Company) => {
    setActiveCompanyId(company.id);
    navigate("/");
  };

  const companyDistrictOptions = getMozDistrictsByProvince(form.companyProvince);
  const ownerDistrictOptions = getMozDistrictsByProvince(form.ownerProvince);
  const ownerDocumentInput = getMozDocumentInputConfig(form.ownerDocumentType);
  const companyNuitLiveError = form.nuit ? validateMozNuit(form.nuit) : null;
  const ownerNuitLiveError = form.ownerNuit ? validateMozNuit(form.ownerNuit) : null;
  const ownerDocumentLiveError = form.ownerDocumentNumber
    ? validateMozDocumentNumber(form.ownerDocumentNumber, form.ownerDocumentType)
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Central de Empresas</h1>
          <p className="text-slate-600 mt-1">Hub central do administrador: criar, editar e gerir todas as empresas do sistema.</p>
        </div>
        <Button onClick={openCreate} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Nova Empresa
        </Button>
      </div>

      {pageError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{pageError}</p>}
      <Dialog open={showForm} onOpenChange={(open) => (!open ? resetForm() : setShowForm(true))}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
            <DialogDescription>Preencha os dados da empresa para gestao central.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCompany} className="space-y-4">
            {formError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}
            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Dados da Empresa</h4>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="space-y-1 md:col-span-6">
                  <Label>Nome da empresa</Label>
                  <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Razao social</Label>
                  <Input value={form.legalName} onChange={(e) => setForm((s) => ({ ...s, legalName: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Plano contabil</Label>
                  <select
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={form.accountingTemplateCode}
                    onChange={(e) => setForm((s) => ({ ...s, accountingTemplateCode: e.target.value }))}
                  >
                    {ACCOUNTING_TEMPLATE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>NUIT da empresa</Label>
                  <Input
                    value={form.nuit}
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="Ex: 400123456"
                    onChange={(e) => setForm((s) => ({ ...s, nuit: normalizeMozNuit(e.target.value) }))}
                  />
                  {companyNuitLiveError ? (
                    <p className="text-xs text-red-700">{companyNuitLiveError}</p>
                  ) : (
                    <p className="text-xs text-slate-500">NUIT deve ter 9 digitos.</p>
                  )}
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-12">
                  <Label>Provincia da empresa</Label>
                  <select
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={form.companyProvince}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        companyProvince: e.target.value,
                        companyDistrict: "",
                      }))
                    }
                    required
                  >
                    <option value="">Selecione a provincia</option>
                    {MOZAMBIQUE_PROVINCES.map((province) => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-6">
                  <Label>Distrito da empresa</Label>
                  <select
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                    value={form.companyDistrict}
                    onChange={(e) => setForm((s) => ({ ...s, companyDistrict: e.target.value }))}
                    disabled={!form.companyProvince}
                    required
                  >
                    <option value="">Selecione o distrito</option>
                    {companyDistrictOptions.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-6">
                  <Label>Bairro da empresa</Label>
                  <Input
                    placeholder="Ex: Central / Alto Mae"
                    value={form.companyNeighborhood}
                    onChange={(e) => setForm((s) => ({ ...s, companyNeighborhood: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Dados do Proprietario / Representante</h4>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="space-y-1 md:col-span-6">
                  <Label>Nome do proprietario</Label>
                  <Input value={form.ownerName} onChange={(e) => setForm((s) => ({ ...s, ownerName: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>NUIT do proprietario</Label>
                  <Input
                    value={form.ownerNuit}
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="Ex: 123456789"
                    onChange={(e) => setForm((s) => ({ ...s, ownerNuit: normalizeMozNuit(e.target.value) }))}
                  />
                  {ownerNuitLiveError ? (
                    <p className="text-xs text-red-700">{ownerNuitLiveError}</p>
                  ) : (
                    <p className="text-xs text-slate-500">NUIT deve ter 9 digitos.</p>
                  )}
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>Telefone do proprietario</Label>
                  <Input value={form.ownerPhone} onChange={(e) => setForm((s) => ({ ...s, ownerPhone: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Documento (tipo)</Label>
                  <select
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={form.ownerDocumentType}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        ownerDocumentType: e.target.value,
                        ownerDocumentNumber: normalizeMozDocumentNumber(s.ownerDocumentNumber, e.target.value),
                      }))
                    }
                  >
                    <option value="">Selecione o tipo</option>
                    {MOZAMBIQUE_DOCUMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Documento (numero)</Label>
                  <Input
                    placeholder={ownerDocumentInput.placeholder}
                    value={form.ownerDocumentNumber}
                    maxLength={ownerDocumentInput.maxLength}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        ownerDocumentNumber: normalizeMozDocumentNumber(e.target.value, s.ownerDocumentType),
                      }))
                    }
                  />
                  {ownerDocumentLiveError ? (
                    <p className="text-xs text-red-700">{ownerDocumentLiveError}</p>
                  ) : (
                    <p className="text-xs text-slate-500">{ownerDocumentInput.hint}</p>
                  )}
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Email do proprietario</Label>
                  <Input type="email" value={form.ownerEmail} onChange={(e) => setForm((s) => ({ ...s, ownerEmail: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-12">
                  <Label>Provincia de residencia do proprietario</Label>
                  <select
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={form.ownerProvince}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        ownerProvince: e.target.value,
                        ownerDistrict: "",
                      }))
                    }
                  >
                    <option value="">Selecione a provincia</option>
                    {MOZAMBIQUE_PROVINCES.map((province) => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-6">
                  <Label>Distrito de residencia</Label>
                  <select
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                    value={form.ownerDistrict}
                    onChange={(e) => setForm((s) => ({ ...s, ownerDistrict: e.target.value }))}
                    disabled={!form.ownerProvince}
                  >
                    <option value="">Selecione o distrito</option>
                    {ownerDistrictOptions.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-6">
                  <Label>Bairro de residencia</Label>
                  <Input
                    placeholder="Ex: Patrice Lumumba"
                    value={form.ownerNeighborhood}
                    onChange={(e) => setForm((s) => ({ ...s, ownerNeighborhood: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Marca da Empresa</h4>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="space-y-1 md:col-span-8">
                  <Label>URL do logotipo</Label>
                  <Input placeholder="https://..." value={form.logoUrl} onChange={(e) => setForm((s) => ({ ...s, logoUrl: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Selecionar logotipo do computador</Label>
                  <Input type="file" accept="image/*" onChange={handleLogoFileChange} />
                </div>
                {form.logoUrl && (
                  <div className="md:col-span-12 flex items-center gap-3 p-2 rounded border border-slate-200 bg-slate-50">
                    <img src={form.logoUrl} alt="Preview logotipo" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                    <p className="text-xs text-slate-600">Pré-visualização do logotipo da empresa.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Administrador da Empresa</h4>
              <p className="text-xs text-slate-600">Cada empresa possui apenas 1 admin com acesso total local.</p>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="space-y-1 md:col-span-4">
                  <Label>Nome do admin</Label>
                  <Input
                    value={form.adminFullName}
                    onChange={(e) => setForm((s) => ({ ...s, adminFullName: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Email do admin</Label>
                  <Input
                    type="email"
                    value={form.adminEmail}
                    onChange={(e) => setForm((s) => ({ ...s, adminEmail: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>{editingId ? "Nova senha do admin (opcional)" : "Senha do admin"}</Label>
                  <Input
                    type="password"
                    value={form.adminPassword}
                    onChange={(e) => setForm((s) => ({ ...s, adminPassword: e.target.value }))}
                    required={!editingId}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Autenticacao por Empresa</h4>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <label className="md:col-span-6 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.authEnforceMfa}
                    onChange={(e) => setForm((s) => ({ ...s, authEnforceMfa: e.target.checked }))}
                  />
                  Exigir MFA para todos os usuarios da empresa
                </label>
                <div className="space-y-1 md:col-span-3">
                  <Label>Codigo MFA (6 digitos)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={editingId ? "Digite para alterar" : "Ex: 123456"}
                    value={form.authMfaCode || ""}
                    onChange={(e) => setForm((s) => ({ ...s, authMfaCode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>Timeout base da sessao (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={form.authSessionTimeoutMin}
                    onChange={(e) => setForm((s) => ({ ...s, authSessionTimeoutMin: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Timeout admin (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={form.authSessionTimeoutAdminMin || 30}
                    onChange={(e) => setForm((s) => ({ ...s, authSessionTimeoutAdminMin: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Timeout manager (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={form.authSessionTimeoutManagerMin || 30}
                    onChange={(e) => setForm((s) => ({ ...s, authSessionTimeoutManagerMin: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-4">
                  <Label>Timeout operador (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={form.authSessionTimeoutOperatorMin || 30}
                    onChange={(e) => setForm((s) => ({ ...s, authSessionTimeoutOperatorMin: Number(e.target.value) }))}
                  />
                </div>

                <div className="space-y-1 md:col-span-3">
                  <Label>Minimo de caracteres (senha)</Label>
                  <Input
                    type="number"
                    min={6}
                    max={64}
                    value={form.authPasswordMinLength || 8}
                    onChange={(e) => setForm((s) => ({ ...s, authPasswordMinLength: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>Expiracao da senha (dias)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={3650}
                    value={form.authPasswordExpiryDays || 90}
                    onChange={(e) => setForm((s) => ({ ...s, authPasswordExpiryDays: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>Tentativas maximas</Label>
                  <Input
                    type="number"
                    min={3}
                    max={20}
                    value={form.authMaxLoginAttempts || 5}
                    onChange={(e) => setForm((s) => ({ ...s, authMaxLoginAttempts: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>Bloqueio apos falha (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.authLockoutMinutes || 15}
                    onChange={(e) => setForm((s) => ({ ...s, authLockoutMinutes: Number(e.target.value) }))}
                  />
                </div>

                <label className="md:col-span-3 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(form.authPasswordRequireUpper)}
                    onChange={(e) => setForm((s) => ({ ...s, authPasswordRequireUpper: e.target.checked }))}
                  />
                  Exigir maiuscula
                </label>
                <label className="md:col-span-3 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(form.authPasswordRequireLower)}
                    onChange={(e) => setForm((s) => ({ ...s, authPasswordRequireLower: e.target.checked }))}
                  />
                  Exigir minuscula
                </label>
                <label className="md:col-span-3 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(form.authPasswordRequireNumber)}
                    onChange={(e) => setForm((s) => ({ ...s, authPasswordRequireNumber: e.target.checked }))}
                  />
                  Exigir numero
                </label>
                <label className="md:col-span-3 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(form.authPasswordRequireSpecial)}
                    onChange={(e) => setForm((s) => ({ ...s, authPasswordRequireSpecial: e.target.checked }))}
                  />
                  Exigir simbolo
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Privacidade por Empresa</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.privacyMaskSensitiveData}
                    onChange={(e) => setForm((s) => ({ ...s, privacyMaskSensitiveData: e.target.checked }))}
                  />
                  Mascarar dados sensiveis (BI, NUIT parcial, telefone parcial)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.privacyAllowCrossCompanyLookup}
                    onChange={(e) => setForm((s) => ({ ...s, privacyAllowCrossCompanyLookup: e.target.checked }))}
                  />
                  Permitir consulta central entre empresas (somente contexto central)
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))} />
                Empresa ativa
              </label>
              <div className="flex gap-2">
                <Button disabled={saving} type="submit">{editingId ? "Atualizar Empresa" : "Criar Empresa"}</Button>
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Empresa</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Utilizadores</TableHead>
              <TableHead>Clientes</TableHead>
              <TableHead>Creditos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8}>A carregar empresas...</TableCell>
              </TableRow>
            ) : companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>Nenhuma empresa encontrada.</TableCell>
              </TableRow>
            ) : (
              companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-500" />
                      <div>
                        <p className="font-medium">{company.name}</p>
                        <p className="text-xs text-slate-500">{company.nuit || "NUIT nao informado"}</p>
                        <p className="text-xs text-slate-500">Plano: {getTemplateLabel(company.accountingTemplateCode)}</p>
                        {company.ownerName && <p className="text-xs text-slate-500">Prop.: {company.ownerName}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{company.email || "-"}</p>
                      <p className="text-slate-500">{company.phone || "-"}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{company.adminFullName || "-"}</p>
                      <p className="text-slate-500">{company.adminEmail || "Sem admin"}</p>
                    </div>
                  </TableCell>
                  <TableCell>{company.usersCount}</TableCell>
                  <TableCell>{company.clientsCount}</TableCell>
                  <TableCell>{company.loansCount}</TableCell>
                  <TableCell>{company.isActive ? "Ativa" : "Inativa"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => enterCompany(company)}>
                        <LogIn className="w-4 h-4 mr-1" />
                        Entrar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resetAdminPassword(company)}
                        title="Resetar senha do admin"
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(company)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteCompany(company.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
