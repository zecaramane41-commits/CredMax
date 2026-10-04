import test from "node:test";
import assert from "node:assert/strict";
import {
  autoMatchTransactions,
  normalizeExternalTransactions,
  normalizeRepayments,
} from "../src/services/reconciliation-service.js";

test("normaliza transacoes e pagamentos", () => {
  const ext = normalizeExternalTransactions([{ id: "1", external_ref: "RC-1", amount: "100", posted_at: "2026-02-20T10:00:00Z" }]);
  const rep = normalizeRepayments([{ id: "2", receipt_no: "RC-1", amount_received: "100", payment_date: "2026-02-20" }]);
  assert.equal(ext[0].id, 1);
  assert.equal(ext[0].postedAt, "2026-02-20");
  assert.equal(rep[0].id, 2);
});

test("concilia por recibo e valor", () => {
  const result = autoMatchTransactions(
    [{ id: 10, externalRef: "RC-2026-0001", amount: 100, postedAt: "2026-02-20" }],
    [{ id: 99, receiptNo: "RC-2026-0001", amountReceived: 100, paymentDate: "2026-02-20" }],
    0.5,
  );
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].matchType, "receipt");
  assert.equal(result.unmatched.length, 0);
});

test("mantem sem match quando valor fora da tolerancia", () => {
  const result = autoMatchTransactions(
    [{ id: 10, externalRef: "X-1", amount: 100, postedAt: "2026-02-20" }],
    [{ id: 99, receiptNo: "X-1", amountReceived: 103, paymentDate: "2026-02-20" }],
    1,
  );
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatched, [10]);
});

