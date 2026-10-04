import {
  hasAnyPermission,
  hasPermission,
  resolveManagePermission,
  resolveUserPermissions,
} from "../../../shared/permissions.mjs";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const CREDIT_READ_PERMISSIONS = [
  "solicitar.credito",
  "analisar.credito",
  "aprovar.credito",
  "autorizar.credito",
  "desembolsar.credito",
  "registrar.pagamento",
  "registrar.mora",
  "reestruturar.credito",
  "consultar.risco",
];

const APPROVAL_DECISION_PERMISSIONS = [
  "analisar.credito",
  "aprovar.credito",
  "autorizar.credito",
];

function forbidden(res) {
  return res.status(403).json({ message: "Sem permissao para esta operacao." });
}

export function requirePermission(...keys) {
  return (req, res, next) => {
    const permissions = resolveUserPermissions(req.user);
    if (hasAnyPermission(permissions, keys)) return next();
    return forbidden(res);
  };
}

export function requireReadWrite(viewPermission, managePermission) {
  const manage = managePermission || resolveManagePermission(viewPermission);
  return (req, res, next) => {
    const permissions = resolveUserPermissions(req.user);
    const required = READ_METHODS.has(req.method) ? viewPermission : manage;
    if (hasPermission(permissions, required)) return next();
    return forbidden(res);
  };
}

/**
 * Resolves loan sub-routes to permission keys from shared/permissions.mjs.
 */
export function requireLoanPermission(req, res, next) {
  const path = req.path || "";
  const isRead = READ_METHODS.has(req.method);
  const permissions = resolveUserPermissions(req.user);

  if (/^\/approval\/requests\/\d+\/decision$/.test(path) && !isRead) {
    if (hasAnyPermission(permissions, APPROVAL_DECISION_PERMISSIONS)) return next();
    return forbidden(res);
  }

  /** @type {{ test: (p: string) => boolean, view: string | string[], manage?: string | string[] }[]} */
  const rules = [
    { test: (p) => p === "/simulate", view: "solicitar.credito", manage: "solicitar.credito" },
    {
      test: (p) => p === "/disbursements" || /\/disburse$/.test(p),
      view: "desembolsar.credito",
      manage: "desembolsar.credito",
    },
    {
      test: (p) => p.startsWith("/payments"),
      view: "registrar.pagamento",
      manage: "registrar.pagamento",
    },
    {
      test: (p) => p.startsWith("/collections"),
      view: "consultar.risco",
      manage: "registrar.mora",
    },
    {
      test: (p) => p.startsWith("/approval"),
      view: CREDIT_READ_PERMISSIONS,
      manage: "solicitar.credito",
    },
    {
      test: (p) => /\/financial-events/.test(p) || /\/promises/.test(p) || /\/renegotiations/.test(p),
      view: "reestruturar.credito",
      manage: "reestruturar.credito",
    },
    {
      test: (p) => /\/installments/.test(p),
      view: "registrar.pagamento",
      manage: "registrar.pagamento",
    },
    {
      test: (p) => p.startsWith("/documents") || /\/documents/.test(p),
      view: CREDIT_READ_PERMISSIONS,
      manage: "solicitar.credito",
    },
  ];

  for (const rule of rules) {
    if (!rule.test(path)) continue;
    const manage = rule.manage || resolveManagePermission(Array.isArray(rule.view) ? rule.view[0] : rule.view);
    const viewKeys = Array.isArray(rule.view) ? rule.view : [rule.view];
    const manageKeys = Array.isArray(manage) ? manage : [manage];
    const requiredKeys = isRead ? viewKeys : manageKeys;
    if (hasAnyPermission(permissions, requiredKeys)) return next();
    return forbidden(res);
  }

  if (isRead && hasAnyPermission(permissions, CREDIT_READ_PERMISSIONS)) return next();
  if (!isRead && hasPermission(permissions, "solicitar.credito")) return next();
  return forbidden(res);
}

export function requireFinanceSessionPermission(req, res, next) {
  const isRead = READ_METHODS.has(req.method);
  const permissions = resolveUserPermissions(req.user);
  const required = isRead ? "visualizar.financeiro" : "alterar.configuracoes.sistema";
  if (hasPermission(permissions, required)) return next();
  return forbidden(res);
}

export function requireUserRoutePermission(req, res, next) {
  const path = req.path || "";
  const isRead = READ_METHODS.has(req.method);
  const permissions = resolveUserPermissions(req.user);

  if (path.startsWith("/portfolios")) {
    const required = isRead ? "visualizar.carteiras" : "gerir.carteiras";
    if (hasPermission(permissions, required)) return next();
    return forbidden(res);
  }

  if (path === "/permissions/catalog") {
    if (hasPermission(permissions, "gerir.permissoes")) return next();
    return forbidden(res);
  }

  const required = isRead ? "editar.usuarios" : "criar.usuarios";
  if (hasPermission(permissions, required)) return next();
  if (isRead && hasPermission(permissions, "gerir.perfis")) return next();
  return forbidden(res);
}

export function requireAccountingPermission(req, res, next) {
  const path = req.path || "";
  const isRead = READ_METHODS.has(req.method);
  const permissions = resolveUserPermissions(req.user);
  const isCashFlow = path.startsWith("/cash-flow");
  const view = "visualizar.financeiro";
  const manage = isCashFlow ? "registrar.movimentos" : "registrar.movimentos";
  const required = isRead ? view : manage;
  if (hasPermission(permissions, required)) return next();
  if (!isRead && hasPermission(permissions, view)) return next();
  return forbidden(res);
}
