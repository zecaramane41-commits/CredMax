import { apiFetch } from "./api";

export type Client360Profile = {
  client: {
    id: number; name: string; type: string; nuit: string; phone: string; phoneAlt?: string;
    email?: string; documentType?: string; documentNumber?: string; birthDate?: string;
    gender?: string; maritalStatus?: string; nationality?: string; province?: string;
    city?: string; district?: string; neighborhood?: string; addressLine?: string;
    occupation?: string; employerName?: string; monthlyIncome: number; monthlyExpenses: number;
    businessName?: string; businessSector?: string; registrationDate?: string; notes?: string;
    groupName?: string; score: number; status: string;
    carteira: { id: number; code: string; name: string; gestorName?: string } | null;
    createdAt: string; updatedAt?: string;
  };
  summary: {
    activeLoans: number; totalLoans: number; totalDisbursed: number; totalDebt: number;
    totalPaid: number; overdueInstallments: number; overdueAmount: number;
    guaranteesCount: number; documentsCount: number; evaluationsCount: number;
    approvalRequestsCount: number; nextDueDate: string | null;
  };
  documents: Array<Record<string, unknown>>;
  evaluations: Array<Record<string, unknown>>;
  guarantees: { guarantors: Array<Record<string, unknown>>; collaterals: Array<Record<string, unknown>> };
  loans: Array<Record<string, unknown>>;
  repayments: Array<Record<string, unknown>>;
  installments: Array<Record<string, unknown>>;
  approvalRequests: Array<Record<string, unknown>>;
  promises: Array<Record<string, unknown>>;
  renegotiations: Array<Record<string, unknown>>;
  portfolioTransfers: Array<Record<string, unknown>>;
  financialEvents: Array<Record<string, unknown>>;
  contractAudits: Array<Record<string, unknown>>;
};

export function fetchClient360(clientId: number) {
  return apiFetch<Client360Profile>(`/clients/${clientId}/360`);
}
