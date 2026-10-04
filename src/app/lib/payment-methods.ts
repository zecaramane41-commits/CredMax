import { apiFetch } from "./api";

export type PaymentMethodType = "banco" | "carteira_movel" | "caixa";

export type PaymentMethod = {
  id: number;
  companyId: number;
  type: PaymentMethodType;
  name: string;
  bankName?: string | null;
  accountNumber?: string | null;
  nibIban?: string | null;
  accountHolder?: string | null;
  branch?: string | null;
  provider?: string | null;
  phoneNumber?: string | null;
  agentCode?: string | null;
  isDefault: boolean;
  isActive: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const STORAGE_KEY = "microcredit_payment_methods_cache";

export async function fetchPaymentMethods(activeOnly = false): Promise<PaymentMethod[]> {
  try {
    const res = await apiFetch<{ items: PaymentMethod[] }>(`/payment-methods?activeOnly=${activeOnly}`);
    if (res && Array.isArray(res.items)) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(res.items));
      } catch {}
      return res.items;
    }
  } catch (err) {
    console.warn("Falha ao carregar formas de pagamento do backend, usando cache:", err);
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return activeOnly ? parsed.filter((p: PaymentMethod) => p.isActive) : parsed;
      }
    }
  } catch {}

  // Fallback seguro padrão de Moçambique
  return [
    {
      id: 1,
      companyId: 1,
      type: "caixa",
      name: "Caixa Geral (Numerário)",
      accountNumber: "CX-01",
      accountHolder: "Tesouraria Principal",
      isDefault: true,
      isActive: true,
    },
    {
      id: 2,
      companyId: 1,
      type: "banco",
      name: "Conta BCI Principal",
      bankName: "BCI",
      accountNumber: "20192837401",
      nibIban: "000800002019283740112",
      accountHolder: "Microcrédito MSU",
      branch: "Balcão Central Maputo",
      isDefault: false,
      isActive: true,
    },
    {
      id: 3,
      companyId: 1,
      type: "banco",
      name: "Conta Millennium BIM",
      bankName: "Millennium BIM",
      accountNumber: "19283746501",
      nibIban: "000100001928374650145",
      accountHolder: "Microcrédito MSU",
      branch: "Balcão 24 de Julho",
      isDefault: false,
      isActive: true,
    },
    {
      id: 4,
      companyId: 1,
      type: "carteira_movel",
      name: "M-Pesa Negócios",
      provider: "M-Pesa",
      phoneNumber: "841234567",
      agentCode: "987654",
      accountHolder: "Microcrédito MSU",
      isDefault: false,
      isActive: true,
    },
    {
      id: 5,
      companyId: 1,
      type: "carteira_movel",
      name: "E-Mola Pagamentos",
      provider: "E-Mola",
      phoneNumber: "861234567",
      agentCode: "123456",
      accountHolder: "Microcrédito MSU",
      isDefault: false,
      isActive: true,
    },
  ];
}

export async function createPaymentMethod(data: Partial<PaymentMethod>): Promise<PaymentMethod> {
  const res = await apiFetch<{ message: string; item: PaymentMethod }>("/payment-methods", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.item;
}

export async function updatePaymentMethod(id: number, data: Partial<PaymentMethod>): Promise<PaymentMethod> {
  const res = await apiFetch<{ message: string; item: PaymentMethod }>(`/payment-methods/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.item;
}

export async function deletePaymentMethod(id: number): Promise<void> {
  await apiFetch(`/payment-methods/${id}`, {
    method: "DELETE",
  });
}
