import { apiFetch } from "./api";

export type FinancialCalendarDay = {
  id: number;
  date: string;
  description: string;
  type: "feriado" | "nao_util" | "dia_util";
  isWorkingDay: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type FinancialCalendarInput = {
  date: string;
  description: string;
  type: FinancialCalendarDay["type"];
};

export const financialCalendarApi = {
  async list(params: { from?: string; to?: string } = {}) {
    const search = new URLSearchParams();
    if (params.from) search.set("from", params.from);
    if (params.to) search.set("to", params.to);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    const response = await apiFetch<{ days: FinancialCalendarDay[] }>(`/financial-calendar${suffix}`);
    return response.days;
  },
  async create(input: FinancialCalendarInput) {
    const response = await apiFetch<{ day: FinancialCalendarDay }>("/financial-calendar", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.day;
  },
  async update(id: number, input: FinancialCalendarInput) {
    const response = await apiFetch<{ day: FinancialCalendarDay }>(`/financial-calendar/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
    return response.day;
  },
  async remove(id: number) {
    await apiFetch<{ message: string }>(`/financial-calendar/${id}`, { method: "DELETE" });
  },
};
