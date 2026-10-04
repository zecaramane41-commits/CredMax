/** @typedef {string} PermissionKey */

/** @type {readonly PermissionKey[]} */
export const PERMISSION_CATALOG = Object.freeze([
  // Dashboard
  "dashboard.view",

  // Clientes
  "clients.view",
  "clients.manage",

  // Créditos
  "solicitar.credito",
  "analisar.credito",
  "aprovar.credito",
  "autorizar.credito",
  "desembolsar.credito",

  // Operações
  "registrar.pagamento",
  "registrar.mora",
  "executar.extorno",
  "reestruturar.credito",

  // Central de Risco
  "consultar.risco",
  "gerir.regras.risco",

  // Carteiras
  "visualizar.carteiras",
  "gerir.carteiras",

  // Financeiro
  "visualizar.financeiro",
  "registrar.movimentos",
  "conciliar.operacoes",

  // Relatórios
  "visualizar.relatorios",
  "exportar.relatorios",

  // Notificações
  "enviar.notificacoes",
  "gerir.modelos",

  // Auditoria
  "consultar.auditoria",

  // Administração
  "criar.usuarios",
  "editar.usuarios",
  "gerir.perfis",
  "gerir.permissoes",

  // Parametrização
  "alterar.parametros.negocio",

  // Configurações
  "alterar.configuracoes.sistema",

  // Central Admin
  "admin_dashboard.view",
  "admin_companies.view",
  "admin_companies.manage",
  "admin_users.view",
  "admin_users.manage",
  "admin_support.view",
  "admin_support.manage",
  "admin_financeiro.view",
  "admin_financeiro.manage",
  "admin_monitoring.view",
  "admin_notifications.view",
  "admin_notifications.manage",
  "admin_reports.view",
  "admin_audit.view",
  "admin_security.view",
  "admin_security.manage",
]);

const PERMISSION_SET = new Set(PERMISSION_CATALOG);

/** @type {Record<string, string[]>} */
export const ROLE_DEFAULTS = {
  admin: ["*"],
  manager: [
    "dashboard.view",
    "clients.view",
    "clients.manage",
    "solicitar.credito",
    "analisar.credito",
    "aprovar.credito",
    "desembolsar.credito",
    "registrar.pagamento",
    "registrar.mora",
    "executar.extorno",
    "reestruturar.credito",
    "consultar.risco",
    "gerir.regras.risco",
    "visualizar.carteiras",
    "gerir.carteiras",
    "visualizar.financeiro",
    "registrar.movimentos",
    "conciliar.operacoes",
    "visualizar.relatorios",
    "exportar.relatorios",
    "enviar.notificacoes",
    "gerir.modelos",
    "consultar.auditoria",
  ],
  agent: [
    "dashboard.view",
    "clients.view",
    "solicitar.credito",
    "registrar.pagamento",
    "registrar.mora",
    "consultar.risco",
    "visualizar.carteiras",
    "visualizar.relatorios",
  ],
  operator: [
    "dashboard.view",
    "clients.view",
    "clients.manage",
    "solicitar.credito",
    "registrar.pagamento",
    "registrar.mora",
    "consultar.risco",
    "visualizar.carteiras",
    "visualizar.relatorios",
  ],
  assistant: [
    "dashboard.view",
    "clients.view",
    "clients.manage",
    "solicitar.credito",
    "registrar.pagamento",
    "visualizar.financeiro",
    "visualizar.relatorios",
    "enviar.notificacoes",
  ],
  accountant: [
    "dashboard.view",
    "clients.view",
    "registrar.pagamento",
    "visualizar.financeiro",
    "registrar.movimentos",
    "conciliar.operacoes",
    "visualizar.relatorios",
    "exportar.relatorios",
  ],
};

export function permissionCatalog() {
  return [...PERMISSION_CATALOG];
}

export function defaultPermissionsForRole(role, { centralAdmin = false } = {}) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (normalizedRole === "admin" && centralAdmin) return ["*"];
  return [...(ROLE_DEFAULTS[normalizedRole] || ROLE_DEFAULTS.operator)];
}

export function normalizePermissions(input, { role = "operator", centralAdmin = false } = {}) {
  if (!Array.isArray(input) || input.length === 0) {
    return defaultPermissionsForRole(role, { centralAdmin });
  }
  const normalizedRole = String(role || "").trim().toLowerCase();
  const values = Array.from(
    new Set(
      input
        .map((entry) => String(entry || "").trim())
        .filter(Boolean),
    ),
  );
  if (values.includes("*")) {
    return normalizedRole === "admin" ? ["*"] : defaultPermissionsForRole(normalizedRole, { centralAdmin });
  }
  const filtered = values.filter((value) => PERMISSION_SET.has(value));
  if (filtered.length === 0) {
    return defaultPermissionsForRole(normalizedRole, { centralAdmin });
  }
  return filtered;
}

export function hasPermission(permissions, key) {
  const safe = Array.isArray(permissions) ? permissions : [];
  if (safe.includes("*")) return true;
  return safe.includes(key);
}

export function hasAnyPermission(permissions, keys) {
  return keys.some((key) => hasPermission(permissions, key));
}

export function resolveManagePermission(viewKey) {
  const manageKey = String(viewKey).replace(/\.view$/, ".manage");
  return PERMISSION_SET.has(manageKey) ? manageKey : viewKey;
}

export function resolveUserPermissions(user) {
  if (!user) return [];
  return normalizePermissions(user.permissions, {
    role: user.role,
    centralAdmin: user.role === "admin" && !user.companyId,
  });
}