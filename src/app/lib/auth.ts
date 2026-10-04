const TOKEN_KEY = "microcredit_token";
const USER_KEY = "microcredit_user";
const ACTIVE_COMPANY_KEY = "microcredit_active_company_id";
const AUTH_SCOPE_KEY = "microcredit_auth_scope";
const REFRESH_SKEW_SECONDS = 120;

export type AuthUser = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  companyId?: number | null;
  companyName?: string;
  permissions?: string[];
  isPortfolioOnly?: boolean;
};

type AuthScope = "local" | "session";

function getPreferredScope(): AuthScope {
  const inSession = sessionStorage.getItem(TOKEN_KEY);
  if (inSession) return "session";
  return "local";
}

function writeByScope(key: string, value: string, scope: AuthScope) {
  if (scope === "session") {
    sessionStorage.setItem(key, value);
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, value);
  sessionStorage.removeItem(key);
}

function readAuthValue(key: string): string | null {
  const inSession = sessionStorage.getItem(key);
  if (inSession !== null) return inSession;
  return localStorage.getItem(key);
}

export function setAuth(token: string, user: AuthUser, remember = true) {
  const scope: AuthScope = remember ? "local" : "session";
  localStorage.setItem(AUTH_SCOPE_KEY, scope);
  writeByScope(TOKEN_KEY, token, scope);
  writeByScope(USER_KEY, JSON.stringify(user), scope);
  if (typeof user.companyId === "number" && user.companyId > 0) {
    setActiveCompanyId(user.companyId);
  }
}

export function setToken(token: string) {
  writeByScope(TOKEN_KEY, token, getPreferredScope());
}

export function setUser(user: AuthUser) {
  writeByScope(USER_KEY, JSON.stringify(user), getPreferredScope());
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVE_COMPANY_KEY);
  localStorage.removeItem(AUTH_SCOPE_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(ACTIVE_COMPANY_KEY);
}

export function getToken() {
  return readAuthValue(TOKEN_KEY);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function getTokenExpiresAt(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp) || exp <= 0) return null;
  return exp * 1000;
}

export function isTokenExpired(token: string) {
  const expiresAt = getTokenExpiresAt(token);
  if (!expiresAt) return false;
  return Date.now() >= expiresAt;
}

export function shouldRefreshToken(token: string) {
  const expiresAt = getTokenExpiresAt(token);
  if (!expiresAt) return false;
  const refreshAt = expiresAt - REFRESH_SKEW_SECONDS * 1000;
  return Date.now() >= refreshAt;
}

export function getUser(): AuthUser | null {
  const raw = readAuthValue(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  const token = getToken();
  if (!token) return false;
  return !isTokenExpired(token);
}

export function setActiveCompanyId(companyId: number) {
  writeByScope(ACTIVE_COMPANY_KEY, String(companyId), getPreferredScope());
}

export function clearActiveCompanyId() {
  localStorage.removeItem(ACTIVE_COMPANY_KEY);
  sessionStorage.removeItem(ACTIVE_COMPANY_KEY);
}

export function getActiveCompanyId(): number | null {
  const raw = readAuthValue(ACTIVE_COMPANY_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
