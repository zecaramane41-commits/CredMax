import { apiFetch } from "./api";

export type CompanyCharge = {
  id: number;
  companyId: number;
  name: string;
  type: "fixed" | "percentage";
  defaultValue: number;
  isRequired: boolean;
  isActive: boolean;
  createdAt?: string;
};

export type ApprovalPolicy = {
  analystLimit: number;
  managerLimit: number;
  finalLimit: number;
  minScore: number;
  maxDebt: number;
  defaultDailyPenaltyRate: number;
  defaultAdministrativeFeeRate: number;
  defaultInterestRate: number;
  maxLoanTermMonths: number;
  moraMonthlyEnabled: boolean;
  moraWeeklyEnabled: boolean;
  moraDailyEnabled: boolean;
  blockAlertStatus: boolean;
};

export async function fetchCompanyCharges(): Promise<CompanyCharge[]> {
  const data = await apiFetch<{ charges: CompanyCharge[] }>("/loans/charges");
  return data.charges || [];
}

export async function createCompanyCharge(payload: {
  name: string;
  type: "fixed" | "percentage";
  defaultValue: number;
  isRequired?: boolean;
  isActive?: boolean;
}): Promise<CompanyCharge> {
  const data = await apiFetch<{ charge: CompanyCharge }>("/loans/charges", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.charge;
}

export async function updateCompanyCharge(
  id: number,
  payload: {
    name: string;
    type: "fixed" | "percentage";
    defaultValue: number;
    isRequired?: boolean;
    isActive?: boolean;
  },
): Promise<CompanyCharge> {
  const data = await apiFetch<{ charge: CompanyCharge }>(`/loans/charges/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return data.charge;
}

export async function deleteCompanyCharge(id: number): Promise<void> {
  await apiFetch(`/loans/charges/${id}`, { method: "DELETE" });
}

export async function fetchApprovalPolicy(): Promise<ApprovalPolicy> {
  const data = await apiFetch<{ policy: ApprovalPolicy }>("/loans/approval/policy");
  return data.policy;
}

export async function updateApprovalPolicy(policy: ApprovalPolicy): Promise<ApprovalPolicy> {
  const data = await apiFetch<{ policy: ApprovalPolicy }>("/loans/approval/policy", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
  return data.policy;
}
