import { apiFetch } from "./api";

export async function getCredit360(creditId: number | string) {
  return apiFetch<any>(`/loans/${creditId}/360`);
}
