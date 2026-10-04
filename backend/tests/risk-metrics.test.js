import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutomaticAlerts,
  buildRecoveryRate,
  buildRiskRatios,
} from "../src/services/risk-metrics-service.js";

test("buildRiskRatios calcula PAR30 e NPL90", () => {
  const ratios = buildRiskRatios({
    outstandingBalance: 1000,
    overdueBalance30: 120,
    overdueBalance90: 60,
  });
  assert.equal(ratios.par30, 12);
  assert.equal(ratios.npl90, 6);
});

test("buildRecoveryRate calcula percentual de recuperacao", () => {
  const recovery = buildRecoveryRate({ disbursedPrincipal: 800, recoveredPrincipal: 520 });
  assert.equal(recovery, 65);
});

test("buildAutomaticAlerts gera alertas por limite", () => {
  const alerts = buildAutomaticAlerts({
    par30: 18,
    npl90: 8,
    recoveryRate: 62,
    managerRows: [{ managerName: "Gestor A", par30: 16 }],
  });
  assert.ok(alerts.find((item) => item.code === "PAR30_HIGH"));
  assert.ok(alerts.find((item) => item.code === "NPL90_HIGH"));
  assert.ok(alerts.find((item) => item.code === "RECOVERY_LOW"));
  assert.ok(alerts.find((item) => item.code === "MANAGER_PAR30_HIGH"));
});

