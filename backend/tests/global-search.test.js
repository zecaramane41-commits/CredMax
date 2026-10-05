import test from "node:test";
import assert from "node:assert/strict";
import { globalSearch } from "../src/services/global-search-service.js";

function fakeDb(rowsByTable) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push(params);
      if (/FROM clients/.test(sql)) return { rows: rowsByTable.clients || [] };
      if (/FROM loans l/.test(sql)) return { rows: rowsByTable.loans || [] };
      if (/loan_approval_requests/.test(sql)) return { rows: rowsByTable.requests || [] };
      if (/loan_documents/.test(sql)) return { rows: rowsByTable.contracts || [] };
      return { rows: rowsByTable.repayments || [] };
    },
  };
}

test("globalSearch rejeita termo curto sem tocar na base", async () => {
  let queries = 0;
  const result = await globalSearch(
    { companyId: 1, term: "a" },
    { query: async () => { queries += 1; return { rows: [] }; } },
  );
  assert.equal(queries, 0);
  assert.deepEqual(result, { clients: [], loans: [], requests: [], contracts: [], repayments: [] });
});

test("globalSearch isola por empresa e formata grupos", async () => {
  const db = fakeDb({
    clients: [{ id: 3, name: "Joao Manuel", document_number: "123", nuit: null, phone: "84", phone_alt: null, status: "active", score: 700 }],
    loans: [{ id: 9, contract_no: "CRD-1", client_id: 3, client_name: "Joao Manuel", product: "Normal", principal: 50000, balance: 35000, status: "active" }],
    requests: [],
    contracts: [],
    repayments: [],
  });
  const result = await globalSearch({ companyId: 7, term: "joao" }, db);
  assert.equal(db.calls.length, 5);
  assert.ok(db.calls.every((params) => params[0] === 7));
  assert.equal(result.clients[0].kind, "CLIENTE");
  assert.equal(result.clients[0].title, "Joao Manuel");
  assert.equal(result.loans[0].kind, "CREDITO");
  assert.equal(result.loans[0].meta.clientId, 3);
});
