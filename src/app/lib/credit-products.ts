import { apiFetch } from "./api";

export type CreditProduct = {
  id: number;
  companyId: number;
  code: string;
  name: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  minTermMonths: number;
  maxTermMonths: number;
  interestRate: number;
  administrativeFeeRate: number;
  dailyPenaltyRate: number;
  paymentFrequency: "diario" | "semanal" | "quinzenal" | "mensal";
  amortizationMethod: "price" | "sac" | "americano";
  requiresGuarantee: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreditProductInput = Omit<
  CreditProduct,
  "id" | "companyId" | "createdAt" | "updatedAt"
>;

export const creditProductsApi = {
  list: () => apiFetch<{ products: CreditProduct[] }>("/credit-products"),
  create: (payload: CreditProductInput) =>
    apiFetch<{ product: CreditProduct }>("/credit-products", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: CreditProductInput) =>
    apiFetch<{ product: CreditProduct }>(`/credit-products/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deactivate: (id: number) =>
    apiFetch<{ success: boolean }>(`/credit-products/${id}`, {
      method: "DELETE",
    }),
};
