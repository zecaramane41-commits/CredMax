function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function toDateOnly(value) {
  return String(value || "").slice(0, 10);
}

function absDiff(a, b) {
  return Math.abs(safeNumber(a) - safeNumber(b));
}

export function normalizeExternalTransactions(rows = []) {
  return rows.map((row) => ({
    id: Number(row.id),
    externalRef: String(row.external_ref || ""),
    amount: safeNumber(row.amount),
    postedAt: toDateOnly(row.posted_at),
    direction: String(row.direction || "credit"),
  }));
}

export function normalizeRepayments(rows = []) {
  return rows.map((row) => ({
    id: Number(row.id),
    receiptNo: String(row.receipt_no || ""),
    amountReceived: safeNumber(row.amount_received),
    paymentDate: toDateOnly(row.payment_date),
  }));
}

export function autoMatchTransactions(externalTransactions = [], repayments = [], toleranceAmount = 1) {
  const safeTolerance = Math.max(0, safeNumber(toleranceAmount));
  const availableRepayments = [...repayments];
  const matches = [];
  const unmatched = [];

  for (const ext of externalTransactions) {
    let bestIdx = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let idx = 0; idx < availableRepayments.length; idx += 1) {
      const repay = availableRepayments[idx];
      if (!repay) continue;
      const amountDelta = absDiff(ext.amount, repay.amountReceived);
      if (amountDelta > safeTolerance) continue;

      let score = amountDelta;
      if (ext.externalRef && repay.receiptNo && ext.externalRef === repay.receiptNo) {
        score -= 0.5;
      }
      if (ext.postedAt === repay.paymentDate) {
        score -= 0.2;
      }

      if (score < bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      const repayment = availableRepayments[bestIdx];
      availableRepayments.splice(bestIdx, 1);
      matches.push({
        externalTransactionId: ext.id,
        repaymentId: repayment.id,
        matchType: ext.externalRef && repayment.receiptNo && ext.externalRef === repayment.receiptNo ? "receipt" : "amount_date",
      });
    } else {
      unmatched.push(ext.id);
    }
  }

  return { matches, unmatched };
}

