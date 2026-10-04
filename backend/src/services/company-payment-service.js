import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatMoney(value) {
  return `${round2(value).toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
}

function formatDatePt(isoDate) {
  if (!isoDate) return "-";
  const raw = String(isoDate).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function generateReceiptNo(companyId, paymentId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `REC-${String(companyId).padStart(4, "0")}-${year}${month}-${String(paymentId).padStart(6, "0")}`;
}

/**
 * Get subscription status for a company
 */
export async function getCompanySubscriptionStatus(companyId) {
  const result = await query(
    `
    SELECT
      c.id,
      c.name,
      c.subscription_status,
      c.subscription_expires_at,
      c.subscription_grace_days,
      c.last_payment_at,
      c.total_paid,
      c.is_active
    FROM companies c
    WHERE c.id = $1
    LIMIT 1
    `,
    [companyId],
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  const now = new Date();
  const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at) : null;
  const graceDays = Number(row.subscription_grace_days || 5);
  const graceEnd = expiresAt ? new Date(expiresAt.getTime() + graceDays * 24 * 60 * 60 * 1000) : null;

  let effectiveStatus = row.subscription_status || "inactive";
  if (expiresAt && now > graceEnd) {
    effectiveStatus = "expired";
  } else if (expiresAt && now > expiresAt) {
    effectiveStatus = "grace";
  } else if (expiresAt && now <= expiresAt) {
    effectiveStatus = "active";
  }

  return {
    companyId: Number(row.id),
    companyName: row.name,
    subscriptionStatus: effectiveStatus,
    subscriptionExpiresAt: row.subscription_expires_at,
    subscriptionGraceDays: graceDays,
    lastPaymentAt: row.last_payment_at,
    totalPaid: Number(row.total_paid || 0),
    isActive: Boolean(row.is_active),
    daysRemaining: expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0,
    daysInGrace: expiresAt && now > expiresAt ? Math.max(0, Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0,
  };
}

/**
 * Get all companies with subscription status
 */
export async function getAllCompaniesSubscriptionStatus() {
  const result = await query(
    `
    SELECT
      c.id,
      c.name,
      c.nuit,
      c.subscription_status,
      c.subscription_expires_at,
      c.subscription_grace_days,
      c.last_payment_at,
      c.total_paid,
      c.is_active,
      COALESCE(COUNT(DISTINCT u.id), 0)::int AS users_count,
      COALESCE(COUNT(DISTINCT cl.id), 0)::int AS clients_count,
      COALESCE(COUNT(DISTINCT l.id), 0)::int AS loans_count
    FROM companies c
    LEFT JOIN users u ON u.company_id = c.id
    LEFT JOIN clients cl ON cl.company_id = c.id
    LEFT JOIN loans l ON l.company_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    `,
  );

  const now = new Date();
  return result.rows.map((row) => {
    const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at) : null;
    const graceDays = Number(row.subscription_grace_days || 5);
    const graceEnd = expiresAt ? new Date(expiresAt.getTime() + graceDays * 24 * 60 * 60 * 1000) : null;

    let effectiveStatus = row.subscription_status || "inactive";
    if (expiresAt && now > graceEnd) {
      effectiveStatus = "expired";
    } else if (expiresAt && now > expiresAt) {
      effectiveStatus = "grace";
    } else if (expiresAt && now <= expiresAt) {
      effectiveStatus = "active";
    }

    return {
      id: Number(row.id),
      name: row.name,
      nuit: row.nuit || "",
      subscriptionStatus: effectiveStatus,
      subscriptionExpiresAt: row.subscription_expires_at,
      subscriptionGraceDays: graceDays,
      lastPaymentAt: row.last_payment_at,
      totalPaid: Number(row.total_paid || 0),
      isActive: Boolean(row.is_active),
      usersCount: Number(row.users_count || 0),
      clientsCount: Number(row.clients_count || 0),
      loansCount: Number(row.loans_count || 0),
      daysRemaining: expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0,
      daysInGrace: expiresAt && now > expiresAt ? Math.max(0, Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0,
    };
  });
}

/**
 * Create a payment for a company
 */
export async function createCompanyPayment(companyId, payload, actorUserId, actorName) {
  const {
    paymentType = "monthly",
    amount,
    paymentDate,
    daysPurchased = 30,
    paymentMethod = "cash",
    referenceNo = "",
    notes = "",
  } = payload;

  if (!amount || Number(amount) <= 0) {
    throw Object.assign(new Error("Valor do pagamento invalido."), { statusCode: 400 });
  }

  const now = new Date();
  const payDate = paymentDate ? new Date(paymentDate) : now;
  const days = Number(daysPurchased) || 30;
  const validFrom = payDate.toISOString().slice(0, 10);
  const validUntilDate = new Date(payDate.getTime() + days * 24 * 60 * 60 * 1000);
  const validUntil = validUntilDate.toISOString().slice(0, 10);

  const result = await withTransaction(async (dbClient) => {
    const companyResult = await dbClient.query(
      `SELECT subscription_expires_at, total_paid FROM companies WHERE id = $1`,
      [companyId],
    );
    const company = companyResult.rows[0];
    if (!company) throw Object.assign(new Error("Empresa nao encontrada."), { statusCode: 404 });

    let actualValidFrom = validFrom;
    let actualValidUntil = validUntil;
    if (company.subscription_expires_at) {
      const currentExpiry = new Date(company.subscription_expires_at);
      if (currentExpiry > now) {
        actualValidFrom = currentExpiry.toISOString().slice(0, 10);
        actualValidUntil = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      }
    }

    const inserted = await dbClient.query(
      `
      INSERT INTO company_payments (
        company_id, payment_type, amount, payment_date, valid_from, valid_until,
        days_purchased, payment_method, reference_no, notes, status,
        created_by_user_id, created_by_name
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11,$12)
      RETURNING *
      `,
      [
        companyId,
        paymentType,
        round2(amount),
        actualValidFrom,
        actualValidFrom,
        actualValidUntil,
        days,
        paymentMethod,
        referenceNo || null,
        notes || null,
        actorUserId,
        actorName,
      ],
    );

    const payment = inserted.rows[0];
    const receiptNo = generateReceiptNo(companyId, payment.id);

    await dbClient.query(
      `UPDATE company_payments SET receipt_no = $1, receipt_issued_at = NOW() WHERE id = $2`,
      [receiptNo, payment.id],
    );

    const newTotalPaid = round2(Number(company.total_paid || 0) + round2(amount));
    await dbClient.query(
      `
      UPDATE companies
      SET
        subscription_status = 'active',
        subscription_expires_at = $1::timestamptz,
        last_payment_at = NOW(),
        total_paid = $2,
        is_active = true
      WHERE id = $3
      `,
      [actualValidUntil, newTotalPaid, companyId],
    );

    return {
      ...payment,
      receipt_no: receiptNo,
      valid_from: actualValidFrom,
      valid_until: actualValidUntil,
    };
  });

  return result;
}

/**
 * Get payment history for a company
 */
export async function getCompanyPayments(companyId, { limit = 100, offset = 0 } = {}) {
  const result = await query(
    `
    SELECT
      p.id,
      p.company_id,
      p.payment_type,
      p.amount,
      p.payment_date,
      p.valid_from,
      p.valid_until,
      p.days_purchased,
      p.payment_method,
      p.reference_no,
      p.notes,
      p.status,
      p.receipt_no,
      p.receipt_issued_at,
      p.receipt_issued_by_name,
      p.created_by_name,
      p.created_at,
      c.name AS company_name,
      c.nuit AS company_nuit
    FROM company_payments p
    JOIN companies c ON c.id = p.company_id
    WHERE p.company_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [companyId, limit, offset],
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM company_payments WHERE company_id = $1`,
    [companyId],
  );

  return {
    payments: result.rows.map(mapPaymentRow),
    total: Number(countResult.rows[0]?.total || 0),
  };
}

/**
 * Get all payments across all companies
 */
export async function getAllPayments({ limit = 100, offset = 0, status = null, companyId = null } = {}) {
  const params = [];
  let where = "WHERE 1=1";

  if (companyId) {
    params.push(companyId);
    where += ` AND p.company_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    where += ` AND p.status = $${params.length}`;
  }

  params.push(limit);
  params.push(offset);

  const result = await query(
    `
    SELECT
      p.id,
      p.company_id,
      p.payment_type,
      p.amount,
      p.payment_date,
      p.valid_from,
      p.valid_until,
      p.days_purchased,
      p.payment_method,
      p.reference_no,
      p.notes,
      p.status,
      p.receipt_no,
      p.receipt_issued_at,
      p.receipt_issued_by_name,
      p.created_by_name,
      p.created_at,
      c.name AS company_name,
      c.nuit AS company_nuit
    FROM company_payments p
    JOIN companies c ON c.id = p.company_id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const countParams = params.slice(0, -2);
  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM company_payments p ${where}`,
    countParams,
  );

  return {
    payments: result.rows.map(mapPaymentRow),
    total: Number(countResult.rows[0]?.total || 0),
  };
}

/**
 * Generate payment statement / extract for a company
 */
export async function generateCompanyStatement(companyId, { dateFrom = null, dateTo = null } = {}) {
  const params = [companyId];
  let where = "WHERE p.company_id = $1";

  if (dateFrom) {
    params.push(dateFrom);
    where += ` AND p.payment_date >= $${params.length}::date`;
  }
  if (dateTo) {
    params.push(dateTo);
    where += ` AND p.payment_date <= $${params.length}::date`;
  }

  const paymentsResult = await query(
    `
    SELECT
      p.id,
      p.payment_type,
      p.amount,
      p.payment_date,
      p.valid_from,
      p.valid_until,
      p.days_purchased,
      p.payment_method,
      p.reference_no,
      p.notes,
      p.receipt_no,
      p.receipt_issued_at,
      p.created_by_name,
      p.created_at
    FROM company_payments p
    ${where}
    ORDER BY p.payment_date ASC, p.id ASC
    `,
    params,
  );

  const companyResult = await query(
    `SELECT id, name, legal_name, nuit, address, email, phone FROM companies WHERE id = $1`,
    [companyId],
  );
  const company = companyResult.rows[0] || null;

  const payments = paymentsResult.rows.map(mapPaymentRow);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalDays = payments.reduce((sum, p) => sum + Number(p.daysPurchased || 0), 0);

  return {
    company: company
      ? {
          id: Number(company.id),
          name: company.name,
          legalName: company.legal_name || "",
          nuit: company.nuit || "",
          address: company.address || "",
          email: company.email || "",
          phone: company.phone || "",
        }
      : null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    payments,
    summary: {
      totalPayments: payments.length,
      totalPaid: round2(totalPaid),
      totalDays,
      totalPaidFormatted: formatMoney(totalPaid),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get payment statistics
 */
export async function getPaymentStats() {
  const result = await query(
    `
    SELECT
      COUNT(*)::int AS total_payments,
      COALESCE(SUM(amount), 0)::numeric AS total_amount,
      COUNT(DISTINCT company_id)::int AS companies_with_payments,
      COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active_payments,
      COUNT(CASE WHEN valid_until < CURRENT_DATE THEN 1 END)::int AS expired_payments
    FROM company_payments
    `,
  );

  const companiesResult = await query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN subscription_status = 'active' THEN 1 END)::int AS active,
      COUNT(CASE WHEN subscription_status = 'grace' THEN 1 END)::int AS grace,
      COUNT(CASE WHEN subscription_status = 'expired' THEN 1 END)::int AS expired,
      COUNT(CASE WHEN subscription_status = 'inactive' THEN 1 END)::int AS inactive
    FROM companies
    `,
  );

  const expiringResult = await query(
    `
    SELECT
      c.id,
      c.name,
      c.subscription_expires_at,
      c.subscription_grace_days,
      c.total_paid
    FROM companies c
    WHERE c.subscription_status = 'active'
      AND c.subscription_expires_at IS NOT NULL
      AND c.subscription_expires_at <= NOW() + INTERVAL '7 days'
    ORDER BY c.subscription_expires_at ASC
    LIMIT 20
    `,
  );

  const stats = result.rows[0] || {};
  const compStats = companiesResult.rows[0] || {};

  return {
    payments: {
      total: Number(stats.total_payments || 0),
      totalAmount: round2(stats.total_amount || 0),
      totalAmountFormatted: formatMoney(stats.total_amount || 0),
      companiesWithPayments: Number(stats.companies_with_payments || 0),
      active: Number(stats.active_payments || 0),
      expired: Number(stats.expired_payments || 0),
    },
    companies: {
      total: Number(compStats.total || 0),
      active: Number(compStats.active || 0),
      grace: Number(compStats.grace || 0),
      expired: Number(compStats.expired || 0),
      inactive: Number(compStats.inactive || 0),
    },
    expiringSoon: expiringResult.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      expiresAt: row.subscription_expires_at,
      graceDays: Number(row.subscription_grace_days || 5),
      totalPaid: Number(row.total_paid || 0),
    })),
  };
}

function mapPaymentRow(row) {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    companyName: row.company_name || "",
    companyNuit: row.company_nuit || "",
    paymentType: row.payment_type,
    amount: Number(row.amount || 0),
    amountFormatted: formatMoney(row.amount),
    paymentDate: row.payment_date,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    daysPurchased: Number(row.days_purchased || 0),
    paymentMethod: row.payment_method,
    referenceNo: row.reference_no || "",
    notes: row.notes || "",
    status: row.status,
    receiptNo: row.receipt_no || "",
    receiptIssuedAt: row.receipt_issued_at,
    receiptIssuedByName: row.receipt_issued_by_name || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
  };
}