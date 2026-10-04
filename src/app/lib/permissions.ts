import type { AuthUser } from "./auth";
import {
  defaultPermissionsForRole as sharedDefaultPermissionsForRole,
  hasPermission as sharedHasPermission,
  normalizePermissions as sharedNormalizePermissions,
  PERMISSION_CATALOG as SHARED_CATALOG,
} from "../../../shared/permissions.mjs";

export const PERMISSION_CATALOG = SHARED_CATALOG;
export type PermissionKey = (typeof PERMISSION_CATALOG)[number];

export const PERMISSION_LABELS: Record<string, string> = {
  "dashboard.view": "Dashboard",
  "clients.view": "Clientes (ver)",
  "clients.manage": "Clientes (gerir)",
  "solicitar.credito": "Solicitar Crédito",
  "analisar.credito": "Analisar Crédito",
  "aprovar.credito": "Aprovar Crédito",
  "autorizar.credito": "Autorizar Crédito",
  "desembolsar.credito": "Desembolsar Crédito",
  "registrar.pagamento": "Registrar Pagamento",
  "registrar.mora": "Registrar Mora",
  "executar.extorno": "Executar Extorno",
  "reestruturar.credito": "Reestruturar Crédito",
  "consultar.risco": "Consultar Risco",
  "gerir.regras.risco": "Gerir Regras de Risco",
  "visualizar.carteiras": "Visualizar Carteiras",
  "gerir.carteiras": "Gerir Carteiras",
  "visualizar.financeiro": "Visualizar Financeiro",
  "registrar.movimentos": "Registrar Movimentos",
  "conciliar.operacoes": "Conciliar Operações",
  "visualizar.relatorios": "Visualizar Relatórios",
  "exportar.relatorios": "Exportar Relatórios",
  "enviar.notificacoes": "Enviar Notificações",
  "gerir.modelos": "Gerir Modelos",
  "consultar.auditoria": "Consultar Auditoria",
  "criar.usuarios": "Criar Usuários",
  "editar.usuarios": "Editar Usuários",
  "gerir.perfis": "Gerir Perfis",
  "gerir.permissoes": "Gerir Permissões",
  "alterar.parametros.negocio": "Alterar Parâmetros de Negócio",
  "alterar.configuracoes.sistema": "Alterar Configurações do Sistema",
};

export function defaultPermissionsForRole(role: string, { centralAdmin = false } = {}) {
  return sharedDefaultPermissionsForRole(role, { centralAdmin });
}

export function normalizePermissions(input: unknown, role: string, { centralAdmin = false } = {}) {
  return sharedNormalizePermissions(input, { role, centralAdmin });
}

export function hasPermission(user: AuthUser | null | undefined, permission: string) {
  if (!user) return false;
  const normalized = normalizePermissions(user.permissions || [], user.role || "operator", {
    centralAdmin: user.role === "admin" && !user.companyId,
  });
  return sharedHasPermission(normalized, permission);
}