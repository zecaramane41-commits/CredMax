import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Edit, Trash2, CheckCircle, XCircle, Shield, RefreshCw, Search, AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { PERMISSION_CATALOG, PERMISSION_LABELS } from "../../lib/permissions";
import { useNavigate } from "react-router";

type AdminUser = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  companyId: number | null;
  companyName: string;
  isActive: boolean;
  permissions: string[];
  createdAt: string;
};

type Company = {
  id: number;
  name: string;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador" },
  { value: "manager", label: "Gestor" },
  { value: "agent", label: "Agente" },
  { value: "operator", label: "Operador" },
  { value: "assistant", label: "Assistente" },
  { value: "accountant", label: "Contabilista" },
];

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

function roleColor(role: string) {
  const map: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800 border-purple-300",
    manager: "bg-blue-100 text-blue-800 border-blue-300",
    agent: "bg-amber-100 text-amber-800 border-amber-300",
    operator: "bg-slate-100 text-slate-800 border-slate-300",
    assistant: "bg-teal-100 text-teal-800 border-teal-300",
    accountant: "bg-emerald-100 text-emerald-800 border-emerald-300",
  };
  return map[role] || "bg-slate-100 text-slate-600";
}

function formatPtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-MZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const emptyForm = {
  fullName: "",
  email: "",
  password: "",
  role: "operator",
  companyId: "",
  isActive: true,
  permissions: [] as string[],
};

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const isCentralAdmin = Boolean(currentUser?.role === "admin" && !currentUser?.companyId);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Permission dialog
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [permUser, setPermUser] = useState<AdminUser | null>(null);
  const [permSelection, setPermSelection] = useState<string[]>([]);

  // Load users
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<{ users: AdminUser[] }>("/users?all=1");
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar utilizadores.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load companies for the form
  const loadCompanies = useCallback(async () => {
    try {
      const data = await apiFetch<{ companies: Company[] }>("/admin/companies");
      setCompanies(data.companies || []);
    } catch {
      // optional
    }
  }, []);

  useEffect(() => {
    if (!isCentralAdmin) {
      navigate("/", { replace: true });
      return;
    }
    void loadUsers();
    void loadCompanies();
  }, [isCentralAdmin, loadUsers, loadCompanies, navigate]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setForm({
      fullName: user.fullName,
      email: user.email,
      password: "",
      role: user.role,
      companyId: user.companyId ? String(user.companyId) : "",
      isActive: user.isActive,
      permissions: user.permissions,
    });
    setFormError("");
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setFormError("");
      const body: Record<string, unknown> = {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        isActive: form.isActive,
      };

      if (form.role !== "admin" && form.companyId) {
        body.companyId = Number(form.companyId);
      }

      if (editingId) {
        if (form.password) body.password = form.password;
        await apiFetch(`/users/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setMessage("Utilizador atualizado com sucesso.");
      } else {
        if (!form.password) {
          setFormError("Senha e obrigatoria para novo utilizador.");
          setSaving(false);
          return;
        }
        body.password = form.password;
        await apiFetch("/users", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setMessage("Utilizador criado com sucesso.");
      }

      resetForm();
      await loadUsers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar utilizador.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          isActive: !user.isActive,
          permissions: user.permissions,
        }),
      });
      setMessage(user.isActive ? "Conta desativada com sucesso." : "Conta ativada com sucesso.");
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao alterar estado.");
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!window.confirm(`Tem certeza que deseja remover o utilizador "${user.fullName}"?`)) return;
    try {
      await apiFetch(`/users/${user.id}`, { method: "DELETE" });
      setMessage("Utilizador removido com sucesso.");
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover utilizador.");
    }
  };

  // Open permission manager
  const openPermissions = (user: AdminUser) => {
    setPermUser(user);
    setPermSelection([...user.permissions]);
    setShowPermissionsDialog(true);
  };

  const togglePermission = (perm: string) => {
    setPermSelection((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const savePermissions = async () => {
    if (!permUser) return;
    try {
      setSaving(true);
      await apiFetch(`/users/${permUser.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: permUser.fullName,
          email: permUser.email,
          role: permUser.role,
          companyId: permUser.companyId,
          isActive: permUser.isActive,
          permissions: permSelection,
        }),
      });
      setMessage("Permissoes atualizadas com sucesso.");
      setShowPermissionsDialog(false);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar permissoes.");
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            Usuários do Sistema
          </h1>
          <p className="text-slate-500 mt-1">Gerencia os usuários administrativos da plataforma.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadUsers()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
          <Button onClick={openCreate} className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Novo Utilizador
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {message}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Pesquisar por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-slate-50 to-slate-100">
              <TableHead className="text-xs font-semibold text-slate-600 uppercase">Nome</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600 uppercase">Email</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600 uppercase">Perfil</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600 uppercase">Empresa</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600 uppercase">Estado</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600 uppercase">Criado em</TableHead>
              <TableHead className="text-right text-xs font-semibold text-slate-600 uppercase">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  A carregar utilizadores...
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                  Nenhum utilizador encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-900">{user.fullName}</TableCell>
                  <TableCell className="text-slate-600">{user.email}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleColor(user.role)}`}>
                      {roleLabel(user.role)}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-600">{user.companyName || "-"}</TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" /> Inactivo
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{formatPtDateTime(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openPermissions(user)} title="Permissões">
                        <Shield className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(user)} title="Editar">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleToggleActive(user)}
                        title={user.isActive ? "Desativar" : "Ativar"}
                      >
                        {user.isActive ? <XCircle className="w-4 h-4 text-amber-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void handleDelete(user)} title="Remover">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ─── Create/Edit User Dialog ─────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(open) => (!open ? resetForm() : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              {editingId ? "Editar Utilizador" : "Novo Utilizador"}
            </DialogTitle>
            <DialogDescription>
              {editingId ? "Altere os dados do utilizador." : "Crie um novo utilizador administrativo."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            {formError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{formError}</div>
            )}
            <div className="space-y-1">
              <Label>Nome Completo *</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))}
                placeholder="Nome do utilizador"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                placeholder="email@exemplo.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Senha {editingId ? "(deixe em branco para manter)" : "*"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                placeholder={editingId ? "Nova senha (opcional)" : "Senha"}
                required={!editingId}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Perfil *</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={form.role}
                  onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Empresa</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={form.companyId}
                  onChange={(e) => setForm((s) => ({ ...s, companyId: e.target.value }))}
                  disabled={form.role === "admin" && !form.companyId}
                >
                  <option value="">Central (Admin)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <Label htmlFor="isActive" className="mb-0">Conta activa</Label>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingId ? "Salvar Alterações" : "Criar Utilizador"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Permissions Dialog ──────────────────────────────────── */}
      <Dialog open={showPermissionsDialog} onOpenChange={(open) => (!open ? setShowPermissionsDialog(false) : null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Gerir Permissões
            </DialogTitle>
            <DialogDescription>
              Defina as permissões para <strong>{permUser?.fullName}</strong> ({roleLabel(permUser?.role || "")})
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto space-y-1">
            {PERMISSION_CATALOG.filter((p) => !p.startsWith("admin_") || permUser?.role === "admin").map((perm) => {
              const label = PERMISSION_LABELS[perm] || perm;
              const isSelected = permSelection.includes(perm);
              return (
                <label
                  key={perm}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                    isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePermission(perm)}
                    className="rounded border-slate-300"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500">{perm}</p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowPermissionsDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => void savePermissions()}
              disabled={saving}
              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Permissões
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}