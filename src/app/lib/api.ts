import { clearAuth, getActiveCompanyId, getToken, setToken, setUser, shouldRefreshToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

type ApiOptions = RequestInit & {
  auth?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const currentToken = getToken();
  console.debug("[api] refreshAccessToken start", { hasCurrentToken: Boolean(currentToken) });
  if (!currentToken) return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.set("Authorization", `Bearer ${currentToken}`);
    const companyId = getActiveCompanyId();
    if (companyId) headers.set("x-company-id", String(companyId));

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    const text = await response.text();
    console.debug("[api] refreshAccessToken response", { status: response.status, body: text });
    if (!response.ok) {
      return null;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    if (!payload?.token) {
      return null;
    }

    setToken(String(payload.token));
    if (payload.user) {
      setUser(payload.user as any);
    }
    return String(payload.token);
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const runRequest = async (authToken?: string | null) => {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");
    if (options.auth !== false) {
      if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
      const companyId = getActiveCompanyId();
      if (companyId) headers.set("x-company-id", String(companyId));
    }
    return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  };

  let token = getToken();
  console.debug("[api] apiFetch start", { path, hasToken: Boolean(token), shouldRefresh: shouldRefreshToken(token || "") });
  if (options.auth !== false && token && shouldRefreshToken(token)) {
    token = (await refreshAccessToken()) || token;
  }

  let response = await runRequest(token);
  console.debug("[api] first response", { path, status: response.status, redirected: response.redirected });
  if (options.auth !== false && response.status === 401 && token) {
    const refreshedToken = await refreshAccessToken();
    console.debug("[api] retry after 401", { path, refreshed: Boolean(refreshedToken) });
    if (!refreshedToken) {
      clearAuth();
    } else {
      response = await runRequest(refreshedToken);
      console.debug("[api] retry response", { path, status: response.status });
      if (response.status === 401) {
        clearAuth();
      }
    }
  }

  const text = await response.text();
  console.debug("[api] final response body", { path, status: response.status, body: text });
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const rawMessage = payload?.message;
    const msg =
      typeof rawMessage === "string" && rawMessage.trim()
        ? rawMessage
        : "Erro na comunicacao com o servidor.";
    throw new Error(msg);
  }
  return payload as T;
}