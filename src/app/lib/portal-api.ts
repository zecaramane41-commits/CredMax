const PORTAL_TOKEN_KEY = "microcredit_portal_token";
const PORTAL_ACCOUNT_KEY = "microcredit_portal_account";
const PENDING_APPLICATION_KEY = "microcredit_portal_pending_application";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export type PortalAccount = {
  id: number;
  fullName: string;
  email: string;
  phone?: string;
  documentNumber?: string;
  companyId: number;
  clientId: number;
};

export type PortalCompany = { id: number; name: string; nuit?: string };

export type SimulationSummary = {
  installments: number;
  firstPayment: number;
  lastPayment: number;
  totalPayment: number;
  totalPrincipal: number;
  totalInterest: number;
};

export type ScheduleRow = {
  installmentNo: number;
  dueDate: string;
  paymentAmount: number;
  principalAmount: number;
  interestAmount: number;
  balanceAfter: number;
};

export type SimulationResult = {
  simulation: {
    companyId: number;
    amount: number;
    periodMonths: number;
    paymentFrequency: string;
    rate: number;
    dates: { disbursed: string; maturity: string; nextPayment: string };
    summary: SimulationSummary;
    schedule: ScheduleRow[];
  };
  disclaimer: string;
};

export type PortalRequest = {
  id: number;
  requestedAmount: number;
  status: string;
  riskLevel: string;
  periodMonths: number;
  paymentFrequency: string;
  rate: number;
  purpose: string;
  contractNo: string;
  processState: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalTimelineItem = {
  id: number;
  fromState: string | null;
  toState: string;
  reason: string | null;
  note: string | null;
  actorName: string | null;
  createdAt: string;
};

export type PendingApplication = {
  companyId: number;
  amount: number;
  periodMonths: number;
  paymentFrequency: string;
  monthlyRatePercent?: number;
};

export function getPortalToken(): string | null {
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function getPortalAccount(): PortalAccount | null {
  const raw = localStorage.getItem(PORTAL_ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortalAccount;
  } catch {
    return null;
  }
}

export function setPortalAuth(token: string, account: PortalAccount) {
  localStorage.setItem(PORTAL_TOKEN_KEY, token);
  localStorage.setItem(PORTAL_ACCOUNT_KEY, JSON.stringify(account));
}

export function clearPortalAuth() {
  localStorage.removeItem(PORTAL_TOKEN_KEY);
  localStorage.removeItem(PORTAL_ACCOUNT_KEY);
}

function readTokenExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isPortalAuthenticated(): boolean {
  const token = getPortalToken();
  if (!token) return false;
  const expiry = readTokenExpiry(token);
  if (expiry !== null && Date.now() >= expiry) {
    clearPortalAuth();
    return false;
  }
  return true;
}

// Pedido pendente guardado em sessionStorage: o cliente clica em
// "Solicitar este crédito", autentica-se e o simulador submete ao voltar.
export function setPendingApplication(value: PendingApplication) {
  sessionStorage.setItem(PENDING_APPLICATION_KEY, JSON.stringify(value));
}

export function getPendingApplication(): PendingApplication | null {
  const raw = sessionStorage.getItem(PENDING_APPLICATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingApplication;
  } catch {
    return null;
  }
}

export function clearPendingApplication() {
  sessionStorage.removeItem(PENDING_APPLICATION_KEY);
}

type PortalFetchOptions = RequestInit & { auth?: boolean };

export async function portalFetch<T>(path: string, options: PortalFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  const needsAuth = options.auth !== false;
  if (needsAuth) {
    const token = getPortalToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    if (response.status === 401 && needsAuth) clearPortalAuth();
    throw new Error(String(payload?.message || "Erro na comunicacao com o servidor."));
  }
  return payload as T;
}
