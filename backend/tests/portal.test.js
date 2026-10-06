import test from "node:test";
import assert from "node:assert/strict";
import { applicationSchema, loginSchema, registerSchema, simulateSchema } from "../src/validators/portal.js";
import { isPortalToken } from "../src/middleware/auth.js";
import { signToken, verifyToken } from "../src/utils/security.js";
import { buildInstallments } from "../src/routes/loan-routes.js";

const validRegister = {
  fullName: "Ana Banda",
  email: "Ana.Banda@Example.COM",
  phone: "841234567",
  documentNumber: "1101001234567",
  password: "Portal#2026",
  companyId: 1,
};

test("registerSchema aceita payload valido e normaliza email para minusculas", () => {
  const result = registerSchema.safeParse(validRegister);
  assert.equal(result.success, true);
  assert.equal(result.data.email, "ana.banda@example.com");
  assert.equal(result.data.companyId, 1);
});

test("registerSchema rejeita email invalido e empresa em falta", () => {
  assert.equal(registerSchema.safeParse({ ...validRegister, email: "nao-e-email" }).success, false);
  const missingCompany = { ...validRegister };
  delete missingCompany.companyId;
  assert.equal(registerSchema.safeParse(missingCompany).success, false);
  const shortPassword = { ...validRegister, password: "123" };
  assert.equal(registerSchema.safeParse(shortPassword).success, false);
});

test("loginSchema exige email e password e aceita empresa opcional", () => {
  assert.equal(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success, true);
  assert.equal(loginSchema.safeParse({ email: "a@b.co", password: "x", companyId: 2 }).success, true);
  assert.equal(loginSchema.safeParse({ email: "a@b.co" }).success, false);
  assert.equal(loginSchema.safeParse({ password: "x" }).success, false);
});

test("simulateSchema converte strings em numeros e define frequencia mensal por omissao", () => {
  const result = simulateSchema.safeParse({ companyId: "1", amount: "5000", periodMonths: "6" });
  assert.equal(result.success, true);
  assert.equal(result.data.amount, 5000);
  assert.equal(result.data.periodMonths, 6);
  assert.equal(result.data.paymentFrequency, "mensal");

  assert.equal(simulateSchema.safeParse({ companyId: 1, amount: 0, periodMonths: 6 }).success, false);
  assert.equal(simulateSchema.safeParse({ companyId: 1, amount: 1000, periodMonths: 0 }).success, false);
  assert.equal(
    simulateSchema.safeParse({ companyId: 1, amount: 1000, periodMonths: 3, paymentFrequency: "anual" })
      .success,
    false,
  );
});

test("applicationSchema aceita pedido valido com finalidade por omissao e valida limites", () => {
  const result = applicationSchema.safeParse({ amount: 10000, periodMonths: 12 });
  assert.equal(result.success, true);
  assert.equal(result.data.paymentFrequency, "mensal");
  assert.equal(result.data.purpose, "Capital de Giro");

  assert.equal(applicationSchema.safeParse({ amount: -1, periodMonths: 6 }).success, false);
  assert.equal(applicationSchema.safeParse({ amount: 5000, periodMonths: 1200 }).success, false);
});

test("isPortalToken reconhece tokens de portal e ignora tokens internos", () => {
  const portalPayload = { kind: "portal", portalId: 7, companyId: 1, clientId: 3 };
  assert.equal(isPortalToken(portalPayload), true);
  assert.equal(isPortalToken({ sub: 1, role: "admin" }), false);
  assert.equal(isPortalToken({ kind: "portal" }), false);
  assert.equal(isPortalToken(null), false);
});

test("token de portal verifica e não transporta credenciais internas (userId/id/sub)", () => {
  const token = signToken({ kind: "portal", portalId: 7, companyId: 1, clientId: 3 }, "7d");
  const decoded = verifyToken(token);
  assert.equal(decoded.kind, "portal");
  assert.equal(Number(decoded.portalId), 7);
  assert.equal(Number(decoded.companyId), 1);
  // requireAuth (interno) só aceita tokens com userId/id/sub — o token de portal é rejeitado.
  assert.equal(decoded.userId, undefined);
  assert.equal(decoded.id, undefined);
  assert.equal(decoded.sub, undefined);
  assert.equal(isPortalToken(decoded), true);
});

test("buildInstallments (exportado de loan-routes) gera cronograma mensal coerente", () => {
  const schedule = buildInstallments({
    amount: 10000,
    rate: 30,
    amortizationMethod: "price",
    paymentFrequency: "mensal",
    paymentDays: [],
    disbursed: "2026-10-05",
    maturity: "2027-10-05",
    nextPayment: "2026-11-05",
  });
  assert.equal(schedule.valid, true);
  const rows = schedule.rows;
  assert.ok(rows.length >= 12);
  assert.equal(rows[0].installmentNo, 1);
  const totalPayment = Math.round(rows.reduce((sum, row) => sum + row.paymentAmount, 0) * 100) / 100;
  const totalPrincipal = Math.round(rows.reduce((sum, row) => sum + row.principalAmount, 0) * 100) / 100;
  assert.equal(totalPrincipal, 10000);
  assert.ok(totalPayment > 10000, "total com juros deve superar o capital");
  assert.equal(rows[rows.length - 1].balanceAfter, 0);
});
