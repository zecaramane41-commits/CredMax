function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function ratioPct(numerator, denominator) {
  const num = safeNumber(numerator);
  const den = safeNumber(denominator);
  if (den <= 0) return 0;
  return round2((num / den) * 100);
}

export function buildRiskRatios({ outstandingBalance, overdueBalance30, overdueBalance90 }) {
  const outstanding = safeNumber(outstandingBalance);
  const par30 = ratioPct(overdueBalance30, outstanding);
  const npl90 = ratioPct(overdueBalance90, outstanding);
  return { par30, npl90 };
}

export function buildRecoveryRate({ disbursedPrincipal, recoveredPrincipal }) {
  return ratioPct(recoveredPrincipal, disbursedPrincipal);
}

export function buildAutomaticAlerts({ par30, npl90, recoveryRate, managerRows = [] }) {
  const alerts = [];
  if (par30 >= 10) {
    alerts.push({
      severity: par30 >= 20 ? "critical" : "high",
      code: "PAR30_HIGH",
      message: `PAR30 em ${par30.toFixed(2)}%, acima do limite operacional.`,
    });
  }
  if (npl90 >= 5) {
    alerts.push({
      severity: npl90 >= 10 ? "critical" : "high",
      code: "NPL90_HIGH",
      message: `NPL90 em ${npl90.toFixed(2)}%, acima do limite prudencial.`,
    });
  }
  if (recoveryRate < 70) {
    alerts.push({
      severity: recoveryRate < 55 ? "high" : "medium",
      code: "RECOVERY_LOW",
      message: `Taxa de recuperacao em ${recoveryRate.toFixed(2)}%, abaixo do objetivo.`,
    });
  }

  for (const row of managerRows) {
    const managerPar30 = safeNumber(row.par30);
    if (managerPar30 >= 15) {
      alerts.push({
        severity: managerPar30 >= 25 ? "critical" : "high",
        code: "MANAGER_PAR30_HIGH",
        manager: row.managerName,
        message: `Gestor ${row.managerName}: PAR30 em ${managerPar30.toFixed(2)}%.`,
      });
    }
  }
  return alerts;
}

