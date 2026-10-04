import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "./api";

export type ClientSummary = {
  id: number;
  name: string;
  type: "singular" | "grupo" | "empresa";
  nuit: string;
  phone: string;
  email: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  score: number;
  status: string;
  loans: number;
  debt: number;
  registrationDate: string;
  documentType: string;
  documentNumber: string;
  occupation: string;
  businessName: string;
  businessSector: string;
  groupName: string;
  employerName: string;
  carteiraId: number | null;
  carteiraNome: string;
  gestorName?: string;
  gestorUserId?: number | null;
};

type ClientsResponse = {
  stats: { total: number; singular: number; grupo: number; empresa: number };
  clients: ClientSummary[];
};

/**
 * Hook para buscar clientes reais do sistema.
 * Faz cache em memória para evitar múltiplas requisições.
 */
let cachedClients: ClientSummary[] | null = null;
let cachePromise: Promise<ClientSummary[]> | null = null;

export async function fetchClients(carteiraId?: number): Promise<ClientSummary[]> {
  const qs = carteiraId ? `?carteiraId=${carteiraId}` : "";
  cachePromise = (async () => {
    try {
      const data = await apiFetch<ClientsResponse>(`/clients${qs}`);
      const items = data.clients || [];
      if (!carteiraId) cachedClients = items;
      return items;
    } catch {
      return [];
    }
  })();
  return cachePromise;
}

export function invalidateClientsCache() {
  cachedClients = null;
  cachePromise = null;
}

export function useClients() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClients();
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { clients, loading, error, reload: load };
}

/**
 * Busca um cliente específico pelo ID.
 */
export async function fetchClientById(id: number): Promise<ClientSummary | null> {
  try {
    const data = await apiFetch<{ client: ClientSummary }>(`/clients/${id}`);
    return data.client || null;
  } catch {
    return null;
  }
}