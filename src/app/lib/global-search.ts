import { apiFetch } from "./api";

export type GlobalSearchResult = {
  id: number;
  type: "client" | "loan" | "request" | "payment";
  title: string;
  subtitle: string;
  status: string | null;
  href: string | null;
};

export async function globalSearch(query: string, limit = 12) {
  return apiFetch<{ query: string; results: GlobalSearchResult[] }>(
    `/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}
