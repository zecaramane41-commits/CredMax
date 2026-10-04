import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Search,
  Plus,
  Lock,
  Unlock,
  Edit3,
  Loader2,
  Trash2,
  Shield,
  KeyRound,
  CheckCircle2,
  X,
  UserCheck,
  Building2,
  Eye,
  EyeOff,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { hasPermission, defaultPermissionsForRole, PERMISSION_CATALOG, PERMISSION_LABELS } from "../../lib/permissions";
import { getUser } from "../../lib/auth";
import { apiFetch } from "../../lib/api";

type UsuarioSistema = {
  id: number;
  fullName: string;
  email: string;
  role: "admin" | "manager" | "operator" | "accountant" | "assistant" | "agent";
  isActive: boolean;
  isPortfolioOnly?: boolean;
  permissions: string[];
  createdAt: string;
};

const ROLES = [
  { value: "admin", label: "Administrador da Empresa", desc: "Acesso integral de gestão à empresa" },
  { value: "manager", label: "Gestor de Crédito / Carteiras", desc: "Gestão operacional e análise/aprovação" },
  { value: "operator", label: "Operador de Crédito / Agente", desc: "Registo de pedidos, clientes e cobranças" },
  { value: "accountant", label: "Contabilista / Tesouraria", desc: "Acesso a fluxos financeiros e relatórios" },
  { value: "assistant", label: "Assistente Administrativo(a)", desc: "Apoio administrativo e consultas" },
];

const PERMISSION_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: "Crédito & Esteira",
    keys: ["solicitar.credito", "analisar.credito", "aprovar.credito", "autorizar.credito", "desembolsar.credito"],
  },
  {
    title: "Clientes & Carteiras",
    keys: ["clients.view", "clients.manage", "visualizar.carteiras", "gerir.carteiras"],
  },
  {
    title: "Operações de Cobrança",
    keys: ["registrar.pagamento", "registrar.mora", "executar.extorno", "reestruturar.credito"],
  },
  {
    title: "Central de Risco",
    keys: ["consultar.risco", "gerir.regras.risco"],
  },
  {
    title: "Financeiro & Contabilidade",
    keys: ["visualizar.financeiro", "registrar.movimentos", "conciliar.operacoes"],
  },
  {
    title: "Relatórios & Notificações",
    keys: ["visualizar.relatorios", "exportar.relatorios", "enviar.notificacoes", "gerir.modelos"],
  },
  {
    title: "Administração & Parâmetros",
    keys: ["criar.usuarios", "editar.usuarios", "gerir.perfis", "gerir.permissoes", "alterar.parametros.negocio", "alterar.configuracoes.sistema", "consultar.auditoria"],
  },
];

export default function UtilizadoresPage() {
  const currentUser = getUser();
  const canManage = hasPermission(currentUser, "criar.usuarios") || currentUser?.role === "admin";

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal de Criação / Edição
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UsuarioSistema | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<"admin" | "manager" | "operator" | "accountant" | "assistant" | "agent">("operator");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loadUsuarios = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<{ users: any[] }>("/users");
      setUsuarios(
        data.users.map((u) => ({
          id: Number(u.id),
          fullName: u.fullName || u.name,
          email: u.email,
          role: u.role || "operator",
          isActive: Boolean(u.isActive),
          isPortfolioOnly: Boolean(u.isPortfolioOnly),
          permissions: Array.isArray(u.permissions) ? u.permissions : [],
          createdAt: u.createdAt,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar utilizadores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsuarios();
  }, [loadUsuarios]);

  // Ao trocar o perfil base no formulário, inicializa com as permissões padrão daquele perfil
  const handleRoleChange = (newRole: "admin" | "manager" | "operator" | "accountant" | "assistant" | "agent") => {
    setFormRole(newRole);
    const defaults = defaultPermissionsForRole(newRole);
    setFormPermissions(defaults);
  };

  // Alternar permissão individual
  const handleTogglePermission = (permKey: string) => {
    setFormPermissions((prev) =>
      prev.includes(permKey) ? prev.filter((p) => p !== permKey) : [...prev, permKey],
    );
  };

  // Marcar todas / desmarcar todas as permissões
  const handleSelectAllPermissions = () => {
    setFormPermissions([...PERMISSION_CATALOG]);
  };

  const handleClearAllPermissions = () => {
    setFormPermissions([]);
  };

  // Abrir Modal de Novo Utilizador
  const handleOpenNewUser = () => {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("operator");
    setFormIsActive(true);
    setFormPermissions(defaultPermissionsForRole("operator"));
    setShowPassword(false);
    setModalOpen(true);
  };

  // Abrir Modal de Edição
  const handleOpenEditUser = (user: UsuarioSistema) => {
    setEditingUser(user);
    setFormName(user.fullName);
    setFormEmail(user.email);
    setFormPassword("");
    setFormRole(user.role);
    setFormIsActive(user.isActive);
    setFormPermissions(
      user.permissions && user.permissions.length > 0
        ? user.permissions
        : defaultPermissionsForRole(user.role),
    );
    setShowPassword(false);
    setModalOpen(true);
  };

  // Salvar Utilizador (POST / PUT)
  const handleSaveUser = async () => {
    if (!formName.trim() || !formEmail.trim()) {
      toast.error("Nome e e-mail são obrigatórios.");
      return;
    }
    if (!editingUser && !formPassword.trim()) {
      toast.error("Informe a palavra-passe inicial para o novo utilizador.");
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const body: any = {
          fullName: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          role: formRole,
          isActive: formIsActive,
          permissions: formPermissions,
        };
        if (formPassword.trim()) {
          body.password = formPassword.trim();
        }
        await apiFetch(`/users/${editingUser.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success("Utilizador e permissões atualizados com sucesso!");
      } else {
        await apiFetch("/users", {
          method: "POST",
          body: JSON.stringify({
            fullName: formName.trim(),
            email: formEmail.trim().toLowerCase(),
            password: formPassword.trim(),
            role: formRole,
            isActive: formIsActive,
            permissions: formPermissions,
          }),
        });
        toast.success("Novo utilizador criado com sucesso!");
      }
      setModalOpen(false);
      void loadUsuarios();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar utilizador.");
    } finally {
      setSaving(false);
    }
  };

  // Alternar Bloqueio / Desbloqueio
  const toggleBlock = async (id: number) => {
    try {
      const usuario = usuarios.find((u) => u.id === id);
      if (!usuario) return;
      const nextStatus = !usuario.isActive;
      await apiFetch(`/users/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: nextStatus }),
      });
      setUsuarios((prev) =>
        prev.map((u) => (u.id === id ? { ...u, isActive: nextStatus } : u)),
      );
      toast.success(`Utilizador ${nextStatus ? "desbloqueado" : "bloqueado"}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar status.");
    }
  };

  // Remover Utilizador
  const handleDeleteUser = async (id: number) => {
    if (!window.confirm("Deseja realmente remover este utilizador do sistema?")) return;
    try {
      await apiFetch(`/users/${id}`, { method: "DELETE" });
      setUsuarios((prev) => prev.filter((u) => u.id !== id));
      toast.success("Utilizador removido com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover utilizador.");
    }
  };

  const filtered = usuarios.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>Apenas administradores podem gerir utilizadores e permissões.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl shadow-lg text-white">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Utilizadores do Sistema</h1>
            <p className="text-sm text-slate-500">
              Criação de utilizadores, atribuição de perfis e personalização de permissões de acesso
            </p>
          </div>
        </div>
        <button
          onClick={handleOpenNewUser}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Novo Utilizador
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>

        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-10 px-3 pr-8 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="all">Todos os Perfis</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {/* Tabela de Utilizadores */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <th className="px-5 py-3.5 text-left">Utilizador</th>
                <th className="px-5 py-3.5 text-left">Perfil Base</th>
                <th className="px-5 py-3.5 text-center">Permissões Ativas</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                    Nenhum utilizador encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800">{u.fullName}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                          u.role === "admin"
                            ? "bg-purple-100 text-purple-700"
                            : u.role === "manager"
                            ? "bg-blue-100 text-blue-700"
                            : u.role === "accountant"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {ROLES.find((r) => r.value === u.role)?.label || u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
                        {u.permissions.length} permissões
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          u.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {u.isActive ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-1.5">
                      <button
                        onClick={() => toggleBlock(u.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          u.isActive
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {u.isActive ? (
                          <>
                            <Lock className="w-3 h-3 inline mr-1" />
                            Bloquear
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3 inline mr-1" />
                            Desbloquear
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleOpenEditUser(u)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                      >
                        <Edit3 className="w-3 h-3 inline mr-1" />
                        Editar & Permissões
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-1.5 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors inline-flex items-center"
                        title="Remover utilizador"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: CRIAR / EDITAR UTILIZADOR COM GRELHA DE PERMISSÕES
      ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-600" />
              {editingUser ? `Editar Utilizador: ${editingUser.fullName}` : "Cadastrar Novo Utilizador"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Defina os dados de acesso, perfil padrão e adicione ou remova permissões específicas conforme a necessidade.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-6 text-sm">
            {/* DADOS BÁSICOS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail de Login *</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {editingUser ? "Nova Palavra-passe (opcional)" : "Palavra-passe Inicial *"}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={editingUser ? "Deixe em branco para manter a atual" : "Mínimo 8 caracteres"}
                    className="w-full h-10 px-3 pr-10 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Perfil Base do Sistema</label>
                <select
                  value={formRole}
                  onChange={(e) => handleRoleChange(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {ROLES.find((r) => r.value === formRole)?.desc}
                </p>
              </div>
            </div>

            {/* STATUS DO UTILIZADOR */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="text-xs font-bold text-slate-800">Conta Ativa</div>
                <div className="text-[11px] text-slate-500">
                  Permite que o utilizador autentique e utilize as funcionalidades atribuídas.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
            </div>

            {/* GRELHA DE PERMISSÕES GRANULARES */}
            <div className="space-y-4 pt-2 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    Permissões Granulares ({formPermissions.length} selecionadas)
                  </h3>
                  <p className="text-xs text-slate-500">
                    O Administrador pode marcar ou desmarcar qualquer permissão individualmente para este utilizador.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllPermissions}
                    className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200"
                  >
                    Marcar Todas
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllPermissions}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PERMISSION_GROUPS.map((grp) => (
                  <div key={grp.title} className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5">
                    <div className="text-xs font-bold text-indigo-900 border-b border-slate-200 pb-1.5">
                      {grp.title}
                    </div>
                    <div className="space-y-2">
                      {grp.keys.map((k) => {
                        const isChecked = formPermissions.includes(k);
                        return (
                          <label
                            key={k}
                            className={`flex items-center gap-2 text-xs font-medium cursor-pointer select-none p-1 rounded transition-colors ${
                              isChecked ? "text-indigo-900 font-semibold" : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePermission(k)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                            />
                            <span>{PERMISSION_LABELS[k] || k}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveUser}
              disabled={saving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "A Guardar..." : editingUser ? "Salvar Alterações" : "Criar Utilizador"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}