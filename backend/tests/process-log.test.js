import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceToState,
  assertTransition,
  canTransition,
  getAllowedTransitions,
  recordTransition,
} from "../src/services/process-log-service.js";

test("canTransition segue o ciclo do pedido", () => {
  assert.equal(canTransition("application", "SUBMITTED", "TRIAGE"), true);
  assert.equal(canTransition("application", "APPROVAL", "APPROVED"), true);
  assert.equal(canTransition("application", "SUBMITTED", "APPROVED"), false);
  assert.equal(canTransition("application", "PAID", "ACTIVE"), false);
  assert.equal(canTransition("application", "REJECTED", "SUBMITTED"), true); // reabertura
});

test("getAllowedTransitions devolve lista vazia para estado final ou desconhecido", () => {
  assert.deepEqual(getAllowedTransitions("disbursement", "CONFIRMED"), []);
  assert.deepEqual(getAllowedTransitions("application", "XYZ"), []);
  assert.deepEqual(getAllowedTransitions("inexistente", "A"), []);
});

test("assertTransition exige estado inicial na primeira entrada", () => {
  assert.doesNotThrow(() => assertTransition("application", null, "DRAFT"));
  assert.throws(() => assertTransition("application", null, "APPROVED"), /Primeiro estado/);
});

test("assertTransition rejeita transição inválida e estado desconhecido", () => {
  assert.throws(() => assertTransition("disbursement", "PENDING", "CONFIRMED"), /Transição inválida/);
  assert.throws(() => assertTransition("disbursement", "PENDING", "NOPE"), /Estado desconhecido/);
  assert.throws(() => assertTransition("foo", null, "A"), /desconhecido/);
});

test("recordTransition lê estado anterior da trilha e grava", async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT to_state/.test(sql)) return { rows: [{ to_state: "SUBMITTED" }] };
      return { rows: [{ id: 7, created_at: new Date("2026-10-05T10:00:00Z") }] };
    },
  };
  const result = await recordTransition(
    {
      companyId: 1,
      entityType: "application",
      entityId: 10,
      toState: "TRIAGE",
      documentIds: [3, "x", -1, 5],
      actor: { userId: 2, name: "Ana" },
    },
    db,
  );
  assert.equal(result.fromState, "SUBMITTED");
  assert.equal(result.toState, "TRIAGE");
  const insert = calls[1];
  assert.equal(insert.params[4], "SUBMITTED");
  assert.deepEqual(insert.params[8], [3, 5]);
});

test("recordTransition não grava quando a transição é inválida", async () => {
  let inserts = 0;
  const db = {
    query: async (sql) => {
      if (/SELECT to_state/.test(sql)) return { rows: [{ to_state: "SUBMITTED" }] };
      inserts += 1;
      return { rows: [] };
    },
  };
  await assert.rejects(
    recordTransition({ companyId: 1, entityType: "application", entityId: 10, toState: "ACTIVE" }, db),
    /Transição inválida/,
  );
  assert.equal(inserts, 0);
});

function createTrailDb(getState) {
  const inserts = [];
  const db = {
    query: async (sql, params) => {
      if (/SELECT to_state/.test(sql)) {
        const state = getState();
        return { rows: state ? [{ to_state: state }] : [] };
      }
      if (/INSERT INTO process_log/.test(sql)) {
        inserts.push({ from: params[4], to: params[5], reason: params[6] });
        return { rows: [{ id: inserts.length, created_at: new Date("2026-10-05T10:00:00Z") }] };
      }
      return { rows: [] };
    },
  };
  return { db, inserts };
}

test("advanceToState semeia trilha legada e avança por etapas válidas até ao alvo", async () => {
  let state = null;
  const { db, inserts } = createTrailDb(() => state);
  const setState = () => {
    state = inserts.length ? inserts[inserts.length - 1].to : null;
  };
  const dbWithState = {
    query: async (sql, params) => {
      const result = await db.query(sql, params);
      setState();
      return result;
    },
  };

  const result = await advanceToState(
    {
      companyId: 1,
      entityType: "application",
      entityId: 10,
      clientId: 4,
      toState: "APPROVAL",
      reason: "Aprovado na etapa anterior",
      actor: { userId: 2, name: "Ana" },
    },
    dbWithState,
  );

  assert.equal(result.changed, true);
  assert.equal(inserts[0].from, null);
  assert.equal(inserts[0].to, "DRAFT");
  assert.equal(inserts[0].reason, "Trilha iniciada");
  const last = inserts[inserts.length - 1];
  assert.equal(last.to, "APPROVAL");
  assert.equal(last.reason, "Aprovado na etapa anterior");
  assert.ok(
    inserts.slice(1, -1).every((step) => step.reason === "Avanço automático"),
    "etapas intermédias marcadas como avanço automático",
  );
  for (let i = 1; i < inserts.length; i++) {
    assert.ok(
      canTransition("application", inserts[i].from, inserts[i].to),
      `transição inválida: ${inserts[i].from} -> ${inserts[i].to}`,
    );
  }

  const before = inserts.length;
  const again = await advanceToState(
    { companyId: 1, entityType: "application", entityId: 10, toState: "APPROVAL" },
    dbWithState,
  );
  assert.equal(again.changed, false);
  assert.equal(inserts.length, before);
});

test("advanceToState reabre pedido rejeitado para a submissão", async () => {
  const state = "REJECTED";
  const { db, inserts } = createTrailDb(() => state);

  const result = await advanceToState(
    {
      companyId: 1,
      entityType: "application",
      entityId: 10,
      toState: "SUBMITTED",
      reason: "Pedido reaberto",
      actor: { userId: 2, name: "Ana" },
    },
    db,
  );

  assert.equal(result.changed, true);
  assert.deepEqual(inserts, [{ from: "REJECTED", to: "SUBMITTED", reason: "Pedido reaberto" }]);
});
