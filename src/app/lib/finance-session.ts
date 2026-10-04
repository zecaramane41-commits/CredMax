import { apiFetch } from "./api";

export type FinanceDaySession = {
  id: number;
  businessDate: string;
  status: "open" | "closed" | "auto_closed";
  openedAt: string;
  openedByName: string;
  openingBalance: number;
  openingCapital: number;
  reinforcementTotal: number;
  notesOpen: string;
  closedAt: string | null;
  closedByName: string;
  closingBalance: number | null;
  closingDisbursements: number;
  closingReimbursements: number;
  closingExpenses: number;
  notesClose: string;
  createdAt: string;
  updatedAt: string;
};

export type FinanceSessionState = {
  currentBusinessDate: string;
  businessDate: string;
  isCurrentBusinessDate: boolean;
  previousClosingBalance: number;
  availableBalance: number;
  formula: string;
  todayFlows: {
    disbursements: number;
    reimbursements: number;
    expenses: number;
  };
  session: FinanceDaySession | null;
  requiresOpening: boolean;
  systemLocked: boolean;
};

export type FinanceSessionStateResponse = FinanceSessionState;

export type FinanceSessionAuditRecord = {
  id: number;
  sessionId: number | null;
  businessDate: string;
  actionType: "open" | "reopen" | "close" | "auto_close" | "reinforcement";
  actorUserId: number | null;
  actorName: string;
  note: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type FinanceSessionReopenAuditRecord = {
  id: number;
  sessionId: number;
  businessDate: string;
  previousStatus: string;
  previousClosedAt: string | null;
  previousClosedByName: string;
  previousClosingBalance: number | null;
  reopenedByUserId: number | null;
  reopenedByName: string;
  reopenReason: string;
  reopenedAt: string;
};

export async function fetchFinanceSessionState(date?: string) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<FinanceSessionStateResponse>(`/finance-session/state${qs}`);
}

export async function openFinanceDay(payload: {
  businessDate?: string;
  openingBalance?: number;
  openingCapital?: number;
  reinforcement?: number;
  notesOpen?: string;
  confirmReopen?: boolean;
  reopenReason?: string;
}) {
  return apiFetch<{ message: string; state: FinanceSessionStateResponse }>("/finance-session/open", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function closeFinanceDay(payload: { businessDate?: string; notesClose?: string }) {
  return apiFetch<{
    message: string;
    shouldLogout: boolean;
    businessDate: string;
    closedSession: FinanceDaySession;
    state: FinanceSessionStateResponse;
  }>("/finance-session/close", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function registerFinanceReinforcement(payload: { businessDate?: string; amount: number; note?: string }) {
  return apiFetch<{ message: string; state: FinanceSessionStateResponse }>("/finance-session/reinforcement", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchFinanceHistory(limit = 15) {
  const safeLimit = Number.isInteger(limit) ? Math.min(60, Math.max(1, limit)) : 15;
  return apiFetch<{ sessions: FinanceDaySession[] }>(`/finance-session/history?limit=${safeLimit}`);
}

export async function fetchFinanceAudit(limit = 30) {
  const safeLimit = Number.isInteger(limit) ? Math.min(120, Math.max(1, limit)) : 30;
  return apiFetch<{ records: FinanceSessionAuditRecord[] }>(`/finance-session/audit?limit=${safeLimit}`);
}

export async function fetchFinanceReopenAudit(limit = 30) {
  const safeLimit = Number.isInteger(limit) ? Math.min(120, Math.max(1, limit)) : 30;
  return apiFetch<{ records: FinanceSessionReopenAuditRecord[] }>(`/finance-session/reopen-audit?limit=${safeLimit}`);
}
