import { query } from "../config/db.js";

/**
 * Máquinas de estado oficiais do CredMax (ver docs/CREDMAX_ARQUITETURA.md, secção 4).
 * Cada entrada lista os estados de destino permitidos a partir do estado de origem.
 */
export const PROCESS_STATE_MACHINES = {
  application: {
    DRAFT: ["SUBMITTED"],
    SUBMITTED: ["TRIAGE", "REJECTED"],
    TRIAGE: ["DOCUMENTATION", "ANALYSIS", "REJECTED"],
    DOCUMENTATION: ["ANALYSIS", "REJECTED"],
    ANALYSIS: ["EVALUATION", "APPROVAL", "REJECTED"],
    EVALUATION: ["APPROVAL", "REJECTED"],
    APPROVAL: ["APPROVED", "REJECTED"],
    APPROVED: ["CONTRACT"],
    CONTRACT: ["DISBURSEMENT"],
    DISBURSEMENT: ["ACTIVE"],
    ACTIVE: ["PAID", "DELINQUENT", "RESTRUCTURED"],
    DELINQUENT: ["ACTIVE", "PAID", "RESTRUCTURED"],
    RESTRUCTURED: ["ACTIVE", "PAID", "DELINQUENT"],
    PAID: [],
    // Reabertura (decision=reopen) volta o pedido à submissão para novo ciclo de análise.
    REJECTED: ["SUBMITTED"],
  },
  disbursement: {
    PENDING: ["VALIDATED"],
    VALIDATED: ["PROCESSED"],
    PROCESSED: ["CONFIRMED"],
    CONFIRMED: [],
  },
  consigned_discount: {
    AUTHORIZED: ["DISCOUNT_REQUESTED"],
    DISCOUNT_REQUESTED: ["PROCESSED"],
    PROCESSED: ["CONFIRMED"],
    CONFIRMED: ["RECONCILED"],
    RECONCILED: [],
  },
};

export const PROCESS_ENTITY_TYPES = Object.keys(PROCESS_STATE_MACHINES);

export function getAllowedTransitions(entityType, fromState) {
  const machine = PROCESS_STATE_MACHINES[entityType];
  if (!machine) return [];
  return machine[fromState] ? [...machine[fromState]] : [];
}

export function canTransition(entityType, fromState, toState) {
  return getAllowedTransitions(entityType, fromState).includes(toState);
}

/**
 * Valida uma transição. A primeira entrada de uma entidade (fromState nulo)
 * só é aceite para o estado inicial da máquina.
 */
export function assertTransition(entityType, fromState, toState) {
  const machine = PROCESS_STATE_MACHINES[entityType];
  if (!machine) {
    throw new Error(`Tipo de entidade de processo desconhecido: ${entityType}`);
  }
  if (!Object.prototype.hasOwnProperty.call(machine, toState)) {
    throw new Error(`Estado desconhecido para ${entityType}: ${toState}`);
  }
  if (fromState == null) {
    const initial = Object.keys(machine)[0];
    if (toState !== initial) {
      throw new Error(`Primeiro estado de ${entityType} deve ser ${initial}, recebido ${toState}`);
    }
    return;
  }
  if (!canTransition(entityType, fromState, toState)) {
    throw new Error(`Transição inválida em ${entityType}: ${fromState} -> ${toState}`);
  }
}

function toSafeIdList(values) {
  if (!Array.isArray(values)) return [];
  return values.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

export async function getCurrentState({ companyId, entityType, entityId }, db = { query }) {
  const result = await db.query(
    `
    SELECT to_state
    FROM process_log
    WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3
    ORDER BY id DESC
    LIMIT 1
    `,
    [companyId, entityType, entityId],
  );
  return result.rows[0]?.to_state ?? null;
}

/**
 * Regista uma mudança de estado, validando-a contra a máquina de estados.
 * O estado anterior é sempre lido da própria trilha (não confiado ao chamador).
 */
export async function recordTransition(
  { companyId, entityType, entityId, clientId = null, toState, reason = null, note = null, documentIds = [], actor = {} },
  db = { query },
) {
  const fromState = await getCurrentState({ companyId, entityType, entityId }, db);
  assertTransition(entityType, fromState, toState);

  const result = await db.query(
    `
    INSERT INTO process_log (
      company_id, entity_type, entity_id, client_id, from_state, to_state,
      reason, note, document_ids, actor_user_id, actor_name
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::bigint[],$10,$11)
    RETURNING id, created_at
    `,
    [
      companyId,
      entityType,
      entityId,
      clientId,
      fromState,
      toState,
      reason,
      note,
      toSafeIdList(documentIds),
      actor.userId ?? null,
      actor.name ?? null,
    ],
  );
  return { id: result.rows[0].id, createdAt: result.rows[0].created_at, fromState, toState };
}

function findTransitionPath(machine, fromState, toState) {
  if (fromState === toState) return [fromState];
  const queue = [[fromState]];
  const seen = new Set([fromState]);
  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];
    for (const next of machine[last] || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      const candidate = [...path, next];
      if (next === toState) return candidate;
      queue.push(candidate);
    }
  }
  return null;
}

/**
 * Avança uma entidade para o estado alvo, registando cada passo na trilha.
 * - Se a entidade ainda não tem trilha (registos antigos), semeia o estado inicial
 *   e avança até ao alvo com marcação "Avanço automático".
 * - Cada transição individual continua a ser validada pela máquina de estados
 *   (nunca escreve transições inválidas).
 * - No-ops se a entidade já está no estado alvo.
 */
export async function advanceToState(
  { companyId, entityType, entityId, clientId = null, toState, reason = null, note = null, documentIds = [], actor = {} },
  db = { query },
) {
  const machine = PROCESS_STATE_MACHINES[entityType];
  if (!machine) {
    throw new Error(`Tipo de entidade de processo desconhecido: ${entityType}`);
  }
  if (!Object.prototype.hasOwnProperty.call(machine, toState)) {
    throw new Error(`Estado desconhecido para ${entityType}: ${toState}`);
  }

  const steps = [];
  let fromState = await getCurrentState({ companyId, entityType, entityId }, db);
  if (fromState === toState) {
    return { changed: false, steps };
  }

  if (fromState == null) {
    const initial = Object.keys(machine)[0];
    if (toState === initial) {
      const step = await recordTransition(
        { companyId, entityType, entityId, clientId, toState, reason, note, documentIds, actor },
        db,
      );
      return { changed: true, steps: [step] };
    }
    steps.push(
      await recordTransition(
        {
          companyId,
          entityType,
          entityId,
          clientId,
          toState: initial,
          reason: "Trilha iniciada",
          note: "Estado inicial registado retroativamente pelo sistema.",
          actor,
        },
        db,
      ),
    );
    fromState = initial;
  }

  const path = findTransitionPath(machine, fromState, toState);
  if (!path) {
    throw new Error(`Sem caminho em ${entityType}: ${fromState} -> ${toState}`);
  }
  for (const state of path.slice(1)) {
    const isTarget = state === toState;
    steps.push(
      await recordTransition(
        {
          companyId,
          entityType,
          entityId,
          clientId,
          toState: state,
          reason: isTarget ? reason : "Avanço automático",
          note: isTarget ? note : "Etapa intermediária registada automaticamente pelo sistema.",
          documentIds: isTarget ? documentIds : [],
          actor,
        },
        db,
      ),
    );
  }
  return { changed: true, steps };
}

export async function listTimeline({ companyId, entityType = null, entityId = null, clientId = null, limit = 200 }, db = { query }) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
  const result = await db.query(
    `
    SELECT id, entity_type, entity_id, client_id, from_state, to_state, reason, note,
           document_ids, actor_user_id, actor_name, created_at
    FROM process_log
    WHERE company_id = $1
      AND ($2::text IS NULL OR entity_type = $2)
      AND ($3::bigint IS NULL OR entity_id = $3)
      AND ($4::int IS NULL OR client_id = $4)
    ORDER BY created_at ASC, id ASC
    LIMIT $5
    `,
    [companyId, entityType, entityId, clientId, safeLimit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: Number(row.entity_id),
    clientId: row.client_id,
    fromState: row.from_state,
    toState: row.to_state,
    reason: row.reason,
    note: row.note,
    documentIds: (row.document_ids || []).map(Number),
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }));
}
