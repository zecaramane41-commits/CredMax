import test from "node:test";
import assert from "node:assert/strict";
import {
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
