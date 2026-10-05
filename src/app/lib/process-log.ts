import { apiFetch } from "./api";

export type ProcessTimelineItem = {
  id: number;
  entityType: string;
  entityId: number;
  clientId: number | null;
  fromState: string | null;
  toState: string;
  reason: string | null;
  note: string | null;
  actorUserId: number | null;
  actorName: string | null;
  createdAt: string;
};

export function fetchProcessTimeline(params: { clientId?: number; entityType?: string; entityId?: number }) {
  const qs = new URLSearchParams();
  if (params.clientId != null) qs.set("clientId", String(params.clientId));
  if (params.entityType) qs.set("entityType", params.entityType);
  if (params.entityId != null) qs.set("entityId", String(params.entityId));
  return apiFetch<{ items: ProcessTimelineItem[] }>(`/process-log/timeline?${qs.toString()}`);
}
