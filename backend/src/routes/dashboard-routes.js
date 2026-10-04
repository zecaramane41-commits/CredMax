import express from "express";
import { query } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { buildAutomaticAlerts, buildRecoveryRate, buildRiskRatios } from "../services/risk-metrics-service.js";

export const dashboardRouter = express.Router();

dashboardRouter.use(requireAuth);
dashboardRouter.use(requirePermission("dashboard.view"));

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

dashboardRouter.get("/summary", async (_req, res, next) => {
  try {
    const scope = resolveCompanyScope(_req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para visualizar o dashboard." });
    }

    const summaryResult = await query(
      `
      WITH loans_base AS (
        SELECT *
        FROM loans
        WHERE company_id = $1
          AND disbursement_status = 'disbursed'
      ),
      disbursements AS (
        SELECT
          COALESCE(SUM(disbursement_net_amount), 0)::NUMERIC(14,2) AS disbursed_net,
          COALESCE(SUM(principal), 0)::NUMERIC(14,2) AS disbursed_principal
        FROM loans_base
      ),
      repayments AS (
        SELECT
          COALESCE(SUM(amount_received), 0)::NUMERIC(14,2) AS reimbursed_total,
          COALESCE(SUM(principal_applied), 0)::NUMERIC(14,2) AS principal_received,
          COALESCE(SUM(interest_applied), 0)::NUMERIC(14,2) AS interest_received,
          COALESCE(SUM(mora_applied), 0)::NUMERIC(14,2) AS mora_received
        FROM loan_repayments
        WHERE company_id = $1
      ),
      expenses AS (
        SELECT
          COALESCE(SUM(amount), 0)::NUMERIC(14,2) AS expenses_total
        FROM cash_expenses
        WHERE company_id = $1
          AND workflow_status = 'executed'
      ),
      portfolio AS (
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0)::INT AS active_loans,
          COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0 AND days_overdue > 0)::INT AS delayed_loans,
          COUNT(DISTINCT client_id) FILTER (WHERE COALESCE(balance, 0) > 0 AND days_overdue > 0)::INT AS delinquent_clients,
          COALESCE(SUM(balance) FILTER (WHERE COALESCE(balance, 0) > 0), 0)::NUMERIC(14,2) AS outstanding_balance,
          COALESCE(SUM(balance) FILTER (WHERE COALESCE(balance, 0) > 0 AND days_overdue > 0), 0)::NUMERIC(14,2) AS delayed_balance
        FROM loans_base
      ),
      capital_movements AS (
        SELECT
          e.id,
          e.entry_date,
          COALESCE(SUM(l.credit - l.debit), 0)::NUMERIC(14,2) AS capital_delta
        FROM accounting_entries e
        JOIN accounting_entry_lines l ON l.entry_id = e.id
        WHERE e.company_id = $1
          AND l.account_code = '3110'
        GROUP BY e.id, e.entry_date
        HAVING COALESCE(SUM(l.credit - l.debit), 0) > 0
      ),
      capital_ranked AS (
        SELECT
          capital_delta,
          ROW_NUMBER() OVER (ORDER BY entry_date ASC, id ASC) AS rn
        FROM capital_movements
      ),
      capital_breakdown AS (
        SELECT
          COALESCE(SUM(CASE WHEN rn = 1 THEN capital_delta ELSE 0 END), 0)::NUMERIC(14,2) AS initial_capital,
          COALESCE(SUM(CASE WHEN rn > 1 THEN capital_delta ELSE 0 END), 0)::NUMERIC(14,2) AS reinforcements_total
        FROM capital_ranked
      )
      SELECT
        disbursements.disbursed_net,
        disbursements.disbursed_principal,
        repayments.reimbursed_total,
        repayments.principal_received,
        repayments.interest_received,
        repayments.mora_received,
        expenses.expenses_total,
        portfolio.active_loans,
        portfolio.delayed_loans,
        portfolio.delinquent_clients,
        portfolio.outstanding_balance,
        portfolio.delayed_balance,
        capital_breakdown.initial_capital,
        capital_breakdown.reinforcements_total
      FROM disbursements
      CROSS JOIN repayments
      CROSS JOIN expenses
      CROSS JOIN portfolio
      CROSS JOIN capital_breakdown
      `,
      [scope.companyId],
    );

    const monthlyResult = await query(
      `
      WITH months AS (
        SELECT generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
          DATE_TRUNC('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date AS month_start
      ),
      disbursements AS (
        SELECT
          DATE_TRUNC('month', disbursed_on)::date AS month_start,
          COALESCE(SUM(disbursement_net_amount), 0)::NUMERIC(14,2) AS disbursed
        FROM loans
        WHERE company_id = $1
          AND disbursement_status = 'disbursed'
          AND disbursed_on >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
        GROUP BY DATE_TRUNC('month', disbursed_on)
      ),
      reimbursements AS (
        SELECT
          DATE_TRUNC('month', payment_date)::date AS month_start,
          COALESCE(SUM(amount_received), 0)::NUMERIC(14,2) AS reimbursed
        FROM loan_repayments
        WHERE company_id = $1
          AND payment_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
        GROUP BY DATE_TRUNC('month', payment_date)
      ),
      expenses AS (
        SELECT
          DATE_TRUNC('month', expense_date)::date AS month_start,
          COALESCE(SUM(amount), 0)::NUMERIC(14,2) AS expenses
        FROM cash_expenses
        WHERE company_id = $1
          AND workflow_status = 'executed'
          AND expense_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
        GROUP BY DATE_TRUNC('month', expense_date)
      )
      SELECT
        TO_CHAR(m.month_start, 'YYYY-MM') AS period,
        COALESCE(d.disbursed, 0)::NUMERIC(14,2) AS disbursed,
        COALESCE(r.reimbursed, 0)::NUMERIC(14,2) AS reimbursed,
        COALESCE(x.expenses, 0)::NUMERIC(14,2) AS expenses
      FROM months m
      LEFT JOIN disbursements d ON d.month_start = m.month_start
      LEFT JOIN reimbursements r ON r.month_start = m.month_start
      LEFT JOIN expenses x ON x.month_start = m.month_start
      ORDER BY m.month_start ASC
      `,
      [scope.companyId],
    );

    const portfolioResult = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0 AND days_overdue = 0)::INT AS on_time,
        COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0 AND days_overdue BETWEEN 1 AND 30)::INT AS d1_30,
        COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0 AND days_overdue BETWEEN 31 AND 60)::INT AS d31_60,
        COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0 AND days_overdue BETWEEN 61 AND 90)::INT AS d61_90,
        COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0 AND days_overdue > 90)::INT AS d90_plus,
        COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0)::INT AS total
      FROM loans
      WHERE company_id = $1
        AND disbursement_status = 'disbursed'
      `,
      [scope.companyId],
    );

    const row = summaryResult.rows[0] || {};
    const portfolio = portfolioResult.rows[0] || {};
    const activeLoans = Number(row.active_loans || 0);
    const delayedLoans = Number(row.delayed_loans || 0);
    const delayedBalance = Number(row.delayed_balance || 0);
    const outstandingBalance = Number(row.outstanding_balance || 0);
    const disbursedTotal = Number(row.disbursed_net || 0);
    const reimbursedTotal = Number(row.reimbursed_total || 0);
    const expensesTotal = Number(row.expenses_total || 0);
    const initialCapital = Number(row.initial_capital || 0);
    const reinforcementsTotal = Number(row.reinforcements_total || 0);

    const portfolioBalance = round2(initialCapital + reimbursedTotal + reinforcementsTotal - disbursedTotal - expensesTotal);
    const recoveryRate = buildRecoveryRate({
      disbursedPrincipal: row.disbursed_principal,
      recoveredPrincipal: row.principal_received,
    });
    const portfolioHealthPct = activeLoans > 0 ? round2(((activeLoans - delayedLoans) / activeLoans) * 100) : 100;
    const delinquencyRatePct = activeLoans > 0 ? round2((delayedLoans / activeLoans) * 100) : 0;
    const growthRatePct = initialCapital > 0 ? round2(((portfolioBalance - initialCapital) / initialCapital) * 100) : null;

    let runningPortfolio = round2(initialCapital + reinforcementsTotal);
    const monthly = monthlyResult.rows.map((periodRow) => {
      const disbursed = Number(periodRow.disbursed || 0);
      const reimbursed = Number(periodRow.reimbursed || 0);
      const expenses = Number(periodRow.expenses || 0);
      const netFlow = round2(reimbursed - disbursed - expenses);
      runningPortfolio = round2(runningPortfolio + netFlow);
      return {
        period: periodRow.period,
        disbursed,
        reimbursed,
        recovered: reimbursed,
        expenses,
        delayed: 0,
        netFlow,
        projectedPortfolioBalance: runningPortfolio,
      };
    });

    const total = Math.max(1, Number(portfolio.total || 0));

    return res.json({
      kpis: {
        totalLoans: activeLoans,
        totalBalance: outstandingBalance,
        delayedLoans,
        delayedBalance,
        recoveryRate,
        activeLoans,
        delinquentClients: Number(row.delinquent_clients || 0),
        disbursedTotal: round2(disbursedTotal),
        reimbursedTotal: round2(reimbursedTotal),
        expensesTotal: round2(expensesTotal),
        initialCapital: round2(initialCapital),
        reinforcementsTotal: round2(reinforcementsTotal),
        portfolioBalance,
        portfolioHealthPct,
        delinquencyRatePct,
        growthRatePct,
      },
      monthly,
      portfolio: [
        { name: "Em Dia", value: Number(((Number(portfolio.on_time || 0) / total) * 100).toFixed(1)), count: Number(portfolio.on_time || 0), color: "#16a34a" },
        { name: "Atraso 1-30", value: Number(((Number(portfolio.d1_30 || 0) / total) * 100).toFixed(1)), count: Number(portfolio.d1_30 || 0), color: "#eab308" },
        { name: "Atraso 31-60", value: Number(((Number(portfolio.d31_60 || 0) / total) * 100).toFixed(1)), count: Number(portfolio.d31_60 || 0), color: "#f97316" },
        { name: "Atraso 61-90", value: Number(((Number(portfolio.d61_90 || 0) / total) * 100).toFixed(1)), count: Number(portfolio.d61_90 || 0), color: "#ef4444" },
        { name: "Atraso >90", value: Number(((Number(portfolio.d90_plus || 0) / total) * 100).toFixed(1)), count: Number(portfolio.d90_plus || 0), color: "#b91c1c" },
      ],
    });
  } catch (error) {
    return next(error);
  }
});

dashboardRouter.get("/risk-portfolio", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para visualizar risco/carteira." });
    }

    const baseResult = await query(
      `
      SELECT
        COUNT(*)::INT AS total_contracts,
        COUNT(*) FILTER (WHERE disbursement_status = 'disbursed')::INT AS active_contracts,
        COALESCE(SUM(balance), 0)::NUMERIC(14,2) AS outstanding_balance,
        COALESCE(SUM(balance) FILTER (WHERE days_overdue > 30), 0)::NUMERIC(14,2) AS overdue_balance_30,
        COALESCE(SUM(balance) FILTER (WHERE days_overdue > 90), 0)::NUMERIC(14,2) AS overdue_balance_90,
        COALESCE(SUM(principal), 0)::NUMERIC(14,2) AS disbursed_principal,
        COALESCE(SUM(principal - balance), 0)::NUMERIC(14,2) AS recovered_principal
      FROM loans
      WHERE company_id = $1
      `,
      [scope.companyId],
    );

    const vintageResult = await query(
      `
      SELECT
        TO_CHAR(DATE_TRUNC('month', disbursed_on), 'YYYY-MM') AS month_ref,
        COUNT(*)::INT AS contracts,
        COALESCE(SUM(principal), 0)::NUMERIC(14,2) AS disbursed_principal,
        COALESCE(SUM(balance), 0)::NUMERIC(14,2) AS outstanding_balance,
        COALESCE(SUM(balance) FILTER (WHERE days_overdue > 30), 0)::NUMERIC(14,2) AS overdue_balance_30
      FROM loans
      WHERE company_id = $1
      GROUP BY DATE_TRUNC('month', disbursed_on)
      ORDER BY DATE_TRUNC('month', disbursed_on) DESC
      LIMIT 24
      `,
      [scope.companyId],
    );

    const cohortResult = await query(
      `
      SELECT
        TO_CHAR(DATE_TRUNC('month', disbursed_on), 'YYYY-MM') AS cohort,
        COUNT(*) FILTER (WHERE days_overdue <= 0)::INT AS on_time,
        COUNT(*) FILTER (WHERE days_overdue BETWEEN 1 AND 30)::INT AS d1_30,
        COUNT(*) FILTER (WHERE days_overdue BETWEEN 31 AND 90)::INT AS d31_90,
        COUNT(*) FILTER (WHERE days_overdue > 90)::INT AS d90_plus,
        COUNT(*)::INT AS total
      FROM loans
      WHERE company_id = $1
      GROUP BY DATE_TRUNC('month', disbursed_on)
      ORDER BY DATE_TRUNC('month', disbursed_on) DESC
      LIMIT 24
      `,
      [scope.companyId],
    );

    const managerResult = await query(
      `
      WITH manager_base AS (
        SELECT
          l.id,
          l.client_id,
          l.principal,
          l.balance,
          l.days_overdue,
          COALESCE(req.created_by_name, 'Sistema') AS manager_name
        FROM loans l
        LEFT JOIN LATERAL (
          SELECT lar.created_by_name
          FROM loan_approval_requests lar
          WHERE lar.generated_loan_id = l.id AND lar.company_id = l.company_id
          ORDER BY lar.created_at DESC
          LIMIT 1
        ) req ON TRUE
        WHERE l.company_id = $1
      )
      SELECT
        manager_name,
        COUNT(*)::INT AS contracts,
        COUNT(DISTINCT client_id)::INT AS clients,
        COALESCE(SUM(principal), 0)::NUMERIC(14,2) AS portfolio,
        COALESCE(SUM(balance), 0)::NUMERIC(14,2) AS outstanding,
        COALESCE(SUM(principal - balance), 0)::NUMERIC(14,2) AS recovered,
        COALESCE(SUM(balance) FILTER (WHERE days_overdue > 30), 0)::NUMERIC(14,2) AS overdue_30,
        COALESCE(SUM(balance) FILTER (WHERE days_overdue > 90), 0)::NUMERIC(14,2) AS overdue_90
      FROM manager_base
      GROUP BY manager_name
      ORDER BY manager_name ASC
      `,
      [scope.companyId],
    );

    const base = baseResult.rows[0] || {};
    const riskRatios = buildRiskRatios({
      outstandingBalance: base.outstanding_balance,
      overdueBalance30: base.overdue_balance_30,
      overdueBalance90: base.overdue_balance_90,
    });
    const recoveryRate = buildRecoveryRate({
      disbursedPrincipal: base.disbursed_principal,
      recoveredPrincipal: base.recovered_principal,
    });

    const managerProductivity = managerResult.rows.map((row) => {
      const managerRatios = buildRiskRatios({
        outstandingBalance: row.outstanding,
        overdueBalance30: row.overdue_30,
        overdueBalance90: row.overdue_90,
      });
      return {
        managerName: row.manager_name || "Sistema",
        contracts: Number(row.contracts || 0),
        clients: Number(row.clients || 0),
        portfolio: Number(row.portfolio || 0),
        outstanding: Number(row.outstanding || 0),
        recovered: Number(row.recovered || 0),
        par30: managerRatios.par30,
        npl90: managerRatios.npl90,
        recoveryRate: buildRecoveryRate({ disbursedPrincipal: row.portfolio, recoveredPrincipal: row.recovered }),
      };
    });

    const alerts = buildAutomaticAlerts({
      par30: riskRatios.par30,
      npl90: riskRatios.npl90,
      recoveryRate,
      managerRows: managerProductivity,
    });

    return res.json({
      companyId: scope.companyId,
      snapshotAt: new Date().toISOString(),
      portfolio: {
        totalContracts: Number(base.total_contracts || 0),
        activeContracts: Number(base.active_contracts || 0),
        outstandingBalance: Number(base.outstanding_balance || 0),
        disbursedPrincipal: Number(base.disbursed_principal || 0),
        recoveredPrincipal: Number(base.recovered_principal || 0),
        par30: riskRatios.par30,
        npl90: riskRatios.npl90,
        recoveryRate,
      },
      vintage: vintageResult.rows.map((row) => ({
        month: row.month_ref,
        contracts: Number(row.contracts || 0),
        disbursedPrincipal: Number(row.disbursed_principal || 0),
        outstandingBalance: Number(row.outstanding_balance || 0),
        par30: buildRiskRatios({
          outstandingBalance: row.outstanding_balance,
          overdueBalance30: row.overdue_balance_30,
          overdueBalance90: 0,
        }).par30,
      })),
      cohorts: cohortResult.rows.map((row) => ({
        cohort: row.cohort,
        onTime: Number(row.on_time || 0),
        d1_30: Number(row.d1_30 || 0),
        d31_90: Number(row.d31_90 || 0),
        d90Plus: Number(row.d90_plus || 0),
        total: Number(row.total || 0),
      })),
      productivityByManager: managerProductivity,
      alerts,
    });
  } catch (error) {
    return next(error);
  }
});
