import { apiFetch } from "./api";

export type SystemNotification = {
  id: number;
  category: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: number | null;
  isRead: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type NotificationSettings = {
  companyId: number;
  smsEnabled: boolean;
  smsProvider: string;
  smsApiKey: string | null;
  smsSenderId: string;
  dueReminderDays: number;
  notifyPaymentSms: boolean;
  notifyDueReminderSms: boolean;
  notifyCaixaAlerts: boolean;
};

export type ClientCreditProfile = {
  client: {
    id: number;
    name: string;
    nuit: string;
    phone: string;
    phoneAlt: string | null;
    email: string | null;
    score: number;
    status: string;
    type: string;
    monthlyIncome: number;
    monthlyExpenses: number;
  };
  summary: {
    totalDebt: number;
    totalPaid: number;
    activeLoans: number;
    overdueInstallments: number;
    nextDueDate: string | null;
    nextDueAmount: number;
  };
  loans: Array<{
    id: number;
    contractNo: string;
    product: string;
    principal: number;
    balance: number;
    status: string;
    disbursedOn: string | null;
    maturityDate: string | null;
    paymentFrequency: string;
    daysOverdue: number;
    managerName: string | null;
    interestRate: number;
  }>;
  repayments: Array<{
    id: number;
    receiptNo: string | null;
    paymentDate: string;
    amountReceived: number;
    amountApplied: number;
    principalApplied: number;
    interestApplied: number;
    moraApplied: number;
    loanId: number | null;
    contractNo: string | null;
  }>;
  pendingInstallments: Array<{
    id: number;
    loanId: number;
    contractNo: string;
    installmentNo: number;
    dueDate: string;
    paymentAmount: number;
    principalAmount: number;
    interestAmount: number;
    status: string;
    paidAt: string | null;
  }>;
  smsHistory: Array<{
    id: number;
    messageType: string;
    messageBody: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
  }>;
  evaluations: Array<{
    id: number;
    finalScore: number;
    decision: string;
    analystName: string;
    createdAt: string;
    note: string | null;
  }>;
};

export async function fetchNotifications(unreadOnly = false) {
  return apiFetch<{ notifications: SystemNotification[]; unreadCount: number }>(
    `/notifications?unreadOnly=${unreadOnly ? "true" : "false"}&limit=50`,
  );
}

export async function markNotificationsRead(ids?: number[]) {
  return apiFetch<{ message: string; unreadCount: number }>("/notifications/mark-read", {
    method: "POST",
    body: JSON.stringify(ids ? { ids } : {}),
  });
}

export async function fetchNotificationSettings() {
  const data = await apiFetch<{ settings: NotificationSettings }>("/notifications/settings");
  return data.settings;
}

export async function saveNotificationSettings(settings: Partial<NotificationSettings>) {
  return apiFetch<{ message: string; settings: NotificationSettings }>("/notifications/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function fetchClientCreditProfile(clientId: number) {
  return apiFetch<ClientCreditProfile>(`/notifications/client-credit/${clientId}`);
}
