import { useState, useEffect, useCallback } from "react";
import { Building2, Save, Loader2, Lock, Unlock, Upload } from "lucide-react";
import { hasPermission } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";
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

type CompanyData = {
  id: number;
  name: string;
  legalName: string;
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
  accountingTemplateCode: string;
  createdAt: string;
};

const emptyForm = {
  name: "",
  legalName: "",
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
};

export default function EmpresaPage() {
  const user = getUser();
  const canEdit = hasPermission(user, "alterar.configuracoes.sistema");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [originalData, setOriginalData] = useState<CompanyData | null>(null);

  const loadEmpresa = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<{ company: CompanyData }>("/company/profile");
      const company = data.company;
      setOriginalData(company);

      const companyAddress = parseMozAddress(company.address);
      const ownerAddress = parseMozAddress(company.ownerAddress);

      const ownerDocumentType = MOZAMBIQUE_DOCUMENT_OPTIONS.some(
        (opt) => opt.value === company.ownerDocumentType
      )
        ? company.ownerDocumentType
        : "";

      setForm({
        name: company.name || "",
        legalName: company.legalName || "",
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
        ownerDocumentNumber: normalizeMozDocumentNumber(
          company.ownerDocumentNumber || "",
          ownerDocumentType
        ),
        ownerAddress: company.ownerAddress || "",
        ownerProvince: ownerAddress.province,
        ownerDistrict: ownerAddress.district,
        ownerNeighborhood: ownerAddress.neighborhood,
        logoUrl: company.logoUrl || "",
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao carregar dados da empresa."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmpresa();
  }, [loadEmpresa]);

  const hasChanges = () => {
    if (!originalData) return false;
    const companyAddress = formatMozAddress(
      form.companyProvince,
      form.companyDistrict,
      form.companyNeighborhood
    );
    const ownerAddress = formatMozAddress(
      form.ownerProvince,
      form.ownerDistrict,
      form.ownerNeighborhood
    );
    return (
      form.name !== originalData.name ||
      form.legalName !== originalData.legalName ||
      normalizeMozNuit(form.nuit) !== normalizeMozNuit(originalData.nuit) ||
      form.phone !== originalData.phone ||
      form.email !== originalData.email ||
      companyAddress !== originalData.address ||
      form.ownerName !== originalData.ownerName ||
      normalizeMozNuit(form.ownerNuit) !== normalizeMozNuit(originalData.ownerNuit) ||
      form.ownerPhone !== originalData.ownerPhone ||
      form.ownerEmail !== originalData.ownerEmail ||
      form.ownerDocumentType !== originalData.ownerDocumentType ||
      normalizeMozDocumentNumber(
        form.ownerDocumentNumber,
        form.ownerDocumentType
      ) !== normalizeMozDocumentNumber(
        originalData.ownerDocumentNumber,
        originalData.ownerDocumentType
      ) ||
      ownerAddress !== originalData.ownerAddress ||
      form.logoUrl !== originalData.logoUrl
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const normalizedCompanyNuit = normalizeMozNuit(form.nuit);
      const normalizedOwnerNuit = normalizeMozNuit(form.ownerNuit);
      const normalizedOwnerDocumentNumber = normalizeMozDocumentNumber(
        form.ownerDocumentNumber,
        form.ownerDocumentType
      );

      const companyNuitError = validateMozNuit(normalizedCompanyNuit);
      if (companyNuitError) {
        setError(`NUIT da empresa: ${companyNuitError}`);
        setSaving(false);
        return;
      }

      const ownerNuitError = validateMozNuit(normalizedOwnerNuit);
      if (ownerNuitError) {
        setError(`NUIT do proprietario: ${ownerNuitError}`);
        setSaving(false);
        return;
      }

      const ownerDocumentError = validateMozDocumentNumber(
        normalizedOwnerDocumentNumber,
        form.ownerDocumentType
      );
      if (ownerDocumentError) {
        setError(ownerDocumentError);
        setSaving(false);
        return;
      }

      const companyAddress = formatMozAddress(
        form.companyProvince,
        form.companyDistrict,
        form.companyNeighborhood
      );
      const ownerAddress = formatMozAddress(
        form.ownerProvince,
        form.ownerDistrict,
        form.ownerNeighborhood
      );

      const result = await apiFetch<{ message: string; company: CompanyData }>(
        "/company/profile",
        {
          method: "PUT",
          body: JSON.stringify({
            name: form.name,
            legalName: form.legalName,
            nuit: normalizedCompanyNuit,
            phone: form.phone,
            email: form.email,
            address: companyAddress,
            ownerName: form.ownerName,
            ownerNuit: normalizedOwnerNuit,
            ownerPhone: form.ownerPhone,
            ownerEmail: form.ownerEmail,
            ownerDocumentType: form.ownerDocumentType,
            ownerDocumentNumber: normalizedOwnerDocumentNumber,
            ownerAddress: ownerAddress,
            logoUrl: form.logoUrl,
          }),
        }
      );

      setSuccess(result.message || "Dados da empresa atualizados com sucesso.");
      // Update original data to reflect saved state
      setOriginalData((prev) =>
        prev
          ? {
              ...prev,
              name: form.name,
              legalName: form.legalName,
              nuit: normalizedCompanyNuit,
              phone: form.phone,
              email: form.email,
              address: companyAddress,
              ownerName: form.ownerName,
              ownerNuit: normalizedOwnerNuit,
              ownerPhone: form.ownerPhone,
              ownerEmail: form.ownerEmail,
              ownerDocumentType: form.ownerDocumentType,
              ownerDocumentNumber: normalizedOwnerDocumentNumber,
              ownerAddress: ownerAddress,
              logoUrl: form.logoUrl,
            }
          : null
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao salvar dados da empresa."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setForm((s) => ({ ...s, logoUrl: value }));
    };
    reader.readAsDataURL(file);
  };

  const companyDistrictOptions = getMozDistrictsByProvince(form.companyProvince);
  const ownerDistrictOptions = getMozDistrictsByProvince(form.ownerProvince);
  const ownerDocumentInput = getMozDocumentInputConfig(form.ownerDocumentType);
  const companyNuitLiveError = form.nuit ? validateMozNuit(form.nuit) : null;
  const ownerNuitLiveError = form.ownerNuit
    ? validateMozNuit(form.ownerNuit)
    : null;
  const ownerDocumentLiveError = form.ownerDocumentNumber
    ? validateMozDocumentNumber(form.ownerDocumentNumber, form.ownerDocumentType)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Empresa</h1>
            <p className="text-sm text-slate-500">
              Dados institucionais da empresa — mesmos dados cadastrados na
              Central de Empresas
            </p>
          </div>
        </div>
        {canEdit ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
            <Unlock className="w-3 h-3" />
            Modo edicao ativo
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
            <Lock className="w-3 h-3" />
            Apenas administradores podem editar
          </span>
        )}
      </div>

      {/* Messages */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
          {success}
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {/* Dados da Empresa */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Dados da Empresa
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="space-y-1 md:col-span-6">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nome da empresa
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, name: e.target.value }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                required
              />
            </div>
            <div className="space-y-1 md:col-span-6">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Razao social
              </label>
              <input
                type="text"
                value={form.legalName}
                onChange={(e) =>
                  setForm((s) => ({ ...s, legalName: e.target.value }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div className="space-y-1 md:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                NUIT da empresa
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={9}
                placeholder="Ex: 400123456"
                value={form.nuit}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    nuit: normalizeMozNuit(e.target.value),
                  }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
              {companyNuitLiveError ? (
                <p className="text-xs text-red-700">{companyNuitLiveError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  NUIT deve ter 9 digitos.
                </p>
              )}
            </div>
            <div className="space-y-1 md:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Telefone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) =>
                  setForm((s) => ({ ...s, phone: e.target.value }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div className="space-y-1 md:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((s) => ({ ...s, email: e.target.value }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div className="space-y-1 md:col-span-12">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Provincia da empresa
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                value={form.companyProvince}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    companyProvince: e.target.value,
                    companyDistrict: "",
                  }))
                }
                disabled={!canEdit}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Distrito da empresa
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                value={form.companyDistrict}
                onChange={(e) =>
                  setForm((s) => ({ ...s, companyDistrict: e.target.value }))
                }
                disabled={!canEdit || !form.companyProvince}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Bairro da empresa
              </label>
              <input
                type="text"
                placeholder="Ex: Central / Alto Mae"
                value={form.companyNeighborhood}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    companyNeighborhood: e.target.value,
                  }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>
        </div>

        {/* Dados do Proprietario */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Dados do Proprietario / Representante
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="space-y-1 md:col-span-6">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nome do proprietario
              </label>
              <input
                type="text"
                value={form.ownerName}
                onChange={(e) =>
                  setForm((s) => ({ ...s, ownerName: e.target.value }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                NUIT do proprietario
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={9}
                placeholder="Ex: 123456789"
                value={form.ownerNuit}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    ownerNuit: normalizeMozNuit(e.target.value),
                  }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
              {ownerNuitLiveError ? (
                <p className="text-xs text-red-700">{ownerNuitLiveError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  NUIT deve ter 9 digitos.
                </p>
              )}
            </div>
            <div className="space-y-1 md:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Telefone do proprietario
              </label>
              <input
                type="text"
                value={form.ownerPhone}
                onChange={(e) =>
                  setForm((s) => ({ ...s, ownerPhone: e.target.value }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div className="space-y-1 md:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Documento (tipo)
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                value={form.ownerDocumentType}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    ownerDocumentType: e.target.value,
                    ownerDocumentNumber: normalizeMozDocumentNumber(
                      s.ownerDocumentNumber,
                      e.target.value
                    ),
                  }))
                }
                disabled={!canEdit}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Documento (numero)
              </label>
              <input
                type="text"
                placeholder={ownerDocumentInput.placeholder}
                value={form.ownerDocumentNumber}
                maxLength={ownerDocumentInput.maxLength}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    ownerDocumentNumber: normalizeMozDocumentNumber(
                      e.target.value,
                      s.ownerDocumentType
                    ),
                  }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
              {ownerDocumentLiveError ? (
                <p className="text-xs text-red-700">
                  {ownerDocumentLiveError}
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  {ownerDocumentInput.hint}
                </p>
              )}
            </div>
            <div className="space-y-1 md:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Email do proprietario
              </label>
              <input
                type="email"
                value={form.ownerEmail}
                onChange={(e) =>
                  setForm((s) => ({ ...s, ownerEmail: e.target.value }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div className="space-y-1 md:col-span-12">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Provincia de residencia do proprietario
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                value={form.ownerProvince}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    ownerProvince: e.target.value,
                    ownerDistrict: "",
                  }))
                }
                disabled={!canEdit}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Distrito de residencia
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                value={form.ownerDistrict}
                onChange={(e) =>
                  setForm((s) => ({ ...s, ownerDistrict: e.target.value }))
                }
                disabled={!canEdit || !form.ownerProvince}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Bairro de residencia
              </label>
              <input
                type="text"
                placeholder="Ex: Patrice Lumumba"
                value={form.ownerNeighborhood}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    ownerNeighborhood: e.target.value,
                  }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>
        </div>

        {/* Logotipo */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Marca da Empresa
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="space-y-1 md:col-span-8">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                URL do logotipo
              </label>
              <input
                type="text"
                placeholder="https://..."
                value={form.logoUrl}
                onChange={(e) =>
                  setForm((s) => ({ ...s, logoUrl: e.target.value }))
                }
                disabled={!canEdit}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            {canEdit && (
              <div className="space-y-1 md:col-span-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Selecionar do computador
                </label>
                <label className="flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 cursor-pointer hover:bg-slate-100">
                  <Upload className="w-4 h-4" />
                  Escolher ficheiro
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoFileChange}
                  />
                </label>
              </div>
            )}
            {form.logoUrl && (
              <div className="md:col-span-12 flex items-center gap-3 p-2 rounded border border-slate-200 bg-slate-50">
                <img
                  src={form.logoUrl}
                  alt="Preview logotipo"
                  className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                />
                <p className="text-xs text-slate-600">
                  Pre-visualizacao do logotipo da empresa.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !hasChanges()}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  A salvar...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar alteracoes
                </>
              )}
            </button>
            {!hasChanges() && form.name && (
              <p className="text-xs text-slate-400">
                Nenhuma alteracao para salvar.
              </p>
            )}
          </div>
        )}

        {/* Info footer */}
        <div className="text-xs text-slate-400 border-t border-slate-200 pt-4">
          <p>
            Estes dados sao os mesmos cadastrados na Central de Empresas.
            Qualquer alteracao feita aqui reflete em todo o sistema. Apenas
            administradores com permissao "alterar.configuracoes.sistema" podem
            editar.
          </p>
        </div>
      </form>
    </div>
  );
}