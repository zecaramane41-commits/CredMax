import { apiFetch } from "./api";

export type Carteira = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  parent_id?: number | null;
  parent_name?: string | null;
  gestor_name?: string | null;
  gestor_user_id?: number | null;
  gestor_user_name?: string | null;
  gestor_user_email?: string | null;
  is_active?: boolean;
  created_at?: string;
  client_count?: number;
  active_loans?: number;
  outstanding_balance?: string | number;
  total_disbursed?: string | number;
  children?: Carteira[];
};

export type Gestor = { id: number; fullName: string; email: string; role: string };

export type Transfer = {
  id: number;
  client_id: number;
  client_name?: string;
  origin_portfolio_id?: number | null;
  origin_portfolio_name?: string | null;
  dest_portfolio_id: number;
  dest_portfolio_name?: string | null;
  reason?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_by_name?: string | null;
  approved_by_name?: string | null;
  created_at: string;
};

export type StatRow = {
  carteira_id: number;
  carteira_code: string;
  carteira_name: string;
  parent_id?: number | null;
  gestor_name?: string | null;
  gestor_user_name?: string | null;
  total_clientes: number;
  total_creditos: number;
  creditos_activos: number;
  total_desembolsado: string;
  saldo_devido: string;
  saldo_activo: string;
  total_reembolsado: string;
  total_reembolsos?: number | string;
  clientes_novos_mes?: number | string;
  mora_acumulada?: string | number;
};

export function listCarteiras(gestorId?: number) {
  const qs = gestorId ? `?gestorId=${gestorId}` : "";
  return apiFetch<{ carteiras: Carteira[] }>(`/carteiras${qs}`);
}

export function listGestores() {
  return apiFetch<{ gestores: Gestor[] }>("/carteiras?include=gestores");
}

export function getCarteira(id: number) {
  return apiFetch<{ carteira: Carteira }>(`/carteiras/${id}`);
}

export function createCarteira(input: { name: string; gestorUserId?: number | null; gestorName?: string; parentId?: number | null; description?: string; subGestores?: number[] }) {
  return apiFetch<{ carteira: Carteira }>("/carteiras", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCarteira(id: number, input: Partial<{ name: string; description: string; isActive: boolean; gestorUserId: number | null; gestorName: string }>) {
  return apiFetch<{ carteira: Carteira }>(`/carteiras/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteCarteira(id: number) {
  return apiFetch<{ ok: boolean }>(`/carteiras/${id}`, { method: "DELETE" });
}

export function listTransfers(params: { clientId?: number; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.clientId) qs.set("clientId", String(params.clientId));
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<{ transfers: Transfer[] }>(`/carteiras/transfers${suffix}`);
}

export function requestTransfer(input: { clientId: number; destPortfolioId: number; reason?: string; autoApprove?: boolean }) {
  return apiFetch<{ transfer: Transfer }>("/carteiras/transfers", { method: "POST", body: JSON.stringify(input) });
}

export function decideTransfer(transferId: number, decision: "approve" | "reject") {
  return apiFetch<{ transfer: Transfer }>(`/carteiras/transfers/${transferId}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export function getCarteiraStats(params: { gestorId?: number; carteiraId?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.gestorId) qs.set("gestorId", String(params.gestorId));
  if (params.carteiraId) qs.set("carteiraId", String(params.carteiraId));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<{ stats: StatRow[] }>(`/carteiras/stats${suffix}`);
}

// ── Relatórios Fase 5 ──────────────────────────────────────────────────────────
export type ExtratoPayload = {
  carteira: { id: number; code: string; name: string; gestorName: string; gestorUserId: number | null };
  periodo: { from: string | null; to: string | null };
  extrato: {
    desembolsos: { total: number; valor: number };
    reembolsos: { total: number; valor: number };
    mora: number;
    saldoFinal: number;
    saldoInicial: number;
    creditoTotal: number;
    creditosMora30: number;
    clientesNovos: number;
    taxaMora: number;
  };
  assinatura: { gestor: string; data: string };
};

export function getCarteiraExtrato(params: { carteiraId: number; from?: string; to?: string }) {
  const qs = new URLSearchParams();
  qs.set("carteiraId", String(params.carteiraId));
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return apiFetch<ExtratoPayload>(`/carteiras/extrato?${qs.toString()}`);
}

export type ConsolidadoItem = {
  carteiraId: number;
  code: string;
  name: string;
  parentId: number | null;
  gestorName: string;
  totalClientes: number;
  clientesNovos: number;
  desembolsos: number;
  desembolsadoValor: number;
  reembolsos: number;
  reembolsadoValor: number;
  saldoAtual: number;
  mora: number;
  taxaMora: number;
};

export function getCarteirasConsolidado(params: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<{
    periodo: { from: string | null; to: string | null };
    totals: {
      totalClientes: number; clientesNovos: number; desembolsos: number; desembolsadoValor: number;
      reembolsos: number; reembolsadoValor: number; saldoAtual: number; mora: number; taxaMora: number;
    };
    carteiras: ConsolidadoItem[];
  }>(`/carteiras/consolidado${suffix}`);
}

export type RiscoCarteira = {
  carteiraId: number;
  carteiraName: string;
  gestorName: string;
  outstanding: number;
  par30: number;
  npl90: number;
  recoveryRate: number;
  mora: number;
  taxaMora: number;
};

export function getCarteirasRisco(params: { from?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<{
    items: RiscoCarteira[];
    alerts: Array<{ severity: string; code: string; message: string; manager?: string }>;
  }>(`/carteiras/risco${suffix}`);
}
