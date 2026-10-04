import { useEffect, useRef } from "react";
import { getActiveCompanyId, getToken } from "./auth";

export type RealtimeEvent<T = Record<string, unknown>> = {
  companyId: number | null;
  type: string;
  data: T;
  timestamp: string;
};

type EventCallback = (event: RealtimeEvent) => void;

class RealtimeClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectTimer: number | null = null;
  private isConnecting = false;

  private getBaseUrl(): string {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
    return apiBase.replace(/\/$/, "");
  }

  public connect() {
    if (this.eventSource || this.isConnecting) return;
    const token = getToken();
    if (!token) return;

    this.isConnecting = true;
    const companyId = getActiveCompanyId();
    const companyQuery = companyId ? `&companyId=${companyId}` : "";
    const streamUrl = `${this.getBaseUrl()}/eventos/stream?token=${encodeURIComponent(token)}${companyQuery}`;

    try {
      const es = new EventSource(streamUrl);
      this.eventSource = es;

      es.onopen = () => {
        this.isConnecting = false;
        console.debug("[Realtime] Conectado ao stream de eventos em tempo real.");
      };

      es.onmessage = (messageEvent) => {
        if (!messageEvent.data) return;
        try {
          const event: RealtimeEvent = JSON.parse(messageEvent.data);
          this.dispatch(event);
        } catch {
          // Keepalive ou ping
        }
      };

      es.onerror = () => {
        this.isConnecting = false;
        this.disconnect();
        // Reconexão com backoff de 4 segundos
        if (!this.reconnectTimer) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 4000);
        }
      };
    } catch {
      this.isConnecting = false;
    }
  }

  public disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public subscribe(eventType: string, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Conecta automaticamente se ainda não estiver conectado
    this.connect();

    return () => {
      const set = this.listeners.get(eventType);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  private dispatch(event: RealtimeEvent) {
    // Dispara para ouvintes do tipo específico
    const specific = this.listeners.get(event.type);
    if (specific) {
      specific.forEach((cb) => {
        try {
          cb(event);
        } catch (err) {
          console.error("[Realtime] Erro no listener:", err);
        }
      });
    }

    // Dispara para ouvintes de todos os eventos "*"
    const wildcard = this.listeners.get("*");
    if (wildcard) {
      wildcard.forEach((cb) => {
        try {
          cb(event);
        } catch (err) {
          console.error("[Realtime] Erro no listener global:", err);
        }
      });
    }
  }
}

export const realtimeClient = new RealtimeClient();

/**
 * Hook React para assinar eventos em tempo real
 */
export function useRealtimeSubscription(
  eventTypes: string | string[],
  callback: (event: RealtimeEvent) => void,
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    const unsubs = types.map((type) =>
      realtimeClient.subscribe(type, (evt) => cbRef.current(evt)),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [JSON.stringify(eventTypes)]);
}
