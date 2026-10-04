import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

/**
 * Middleware to check if a company's subscription is active.
 * If the subscription is expired (past grace period), the company's access is blocked.
 * If in grace period, access is allowed but a warning is logged.
 */
export function requireActiveSubscription(req, res, next) {
  const companyId = req.user?.companyId || req.companyId;
  if (!companyId) {
    // Central admin or no company context - skip check
    return next();
  }

  checkCompanySubscription(companyId)
    .then((result) => {
      if (!result.active) {
        return res.status(403).json({
          message: "Assinatura da empresa expirada. Contacte o Administrador Central para efectuar o pagamento.",
          subscriptionStatus: result.status,
          expiresAt: result.expiresAt,
          daysExpired: result.daysExpired,
        });
      }

      // Attach subscription info to request for downstream use
      req.subscriptionInfo = {
        status: result.status,
        expiresAt: result.expiresAt,
        daysRemaining: result.daysRemaining,
        inGrace: result.inGrace,
        daysInGrace: result.daysInGrace,
      };

      if (result.inGrace) {
        logger.warn("Company in grace period", {
          companyId,
          daysInGrace: result.daysInGrace,
          expiresAt: result.expiresAt,
        });
      }

      return next();
    })
    .catch((error) => {
      logger.error("Subscription check failed", { companyId, error: error?.message });
      // On error, allow access (fail-open for availability)
      return next();
    });
}

async function checkCompanySubscription(companyId) {
  const result = await query(
    `
    SELECT
      subscription_status,
      subscription_expires_at,
      subscription_grace_days,
      is_active
    FROM companies
    WHERE id = $1
    LIMIT 1
    `,
    [companyId],
  );

  const row = result.rows[0];
  if (!row) {
    return { active: false, status: "not_found", expiresAt: null, daysRemaining: 0, inGrace: false, daysInGrace: 0, daysExpired: 0 };
  }

  const now = new Date();
  const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at) : null;
  const graceDays = Number(row.subscription_grace_days || 5);
  const graceEnd = expiresAt ? new Date(expiresAt.getTime() + graceDays * 24 * 60 * 60 * 1000) : null;

  if (!expiresAt) {
    return {
      active: false,
      status: row.subscription_status || "inactive",
      expiresAt: null,
      daysRemaining: 0,
      inGrace: false,
      daysInGrace: 0,
      daysExpired: 0,
    };
  }

  if (now <= expiresAt) {
    // Active subscription
    const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      active: true,
      status: "active",
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
      inGrace: false,
      daysInGrace: 0,
      daysExpired: 0,
    };
  }

  if (graceEnd && now <= graceEnd) {
    // In grace period
    const daysInGrace = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      active: true,
      status: "grace",
      expiresAt: expiresAt.toISOString(),
      daysRemaining: 0,
      inGrace: true,
      daysInGrace,
      daysExpired: 0,
    };
  }

  // Expired
  const daysExpired = Math.ceil((now.getTime() - (graceEnd || expiresAt).getTime()) / (1000 * 60 * 60 * 24));
  return {
    active: false,
    status: "expired",
    expiresAt: expiresAt.toISOString(),
    daysRemaining: 0,
    inGrace: false,
    daysInGrace: 0,
    daysExpired,
  };
}

/**
 * Send notifications for expiring/expired subscriptions
 * Should be called periodically (e.g., daily via scheduler)
 */
export async function checkAndNotifySubscriptions() {
  const now = new Date();
  let notificationsSent = 0;

  // Find companies with subscriptions expiring in 3 days
  const expiringResult = await query(
    `
    SELECT c.id, c.name, c.subscription_expires_at, c.subscription_grace_days
    FROM companies c
    WHERE c.subscription_status = 'active'
      AND c.subscription_expires_at IS NOT NULL
      AND c.subscription_expires_at > NOW()
      AND c.subscription_expires_at <= NOW() + INTERVAL '3 days'
    `,
  );

  for (const row of expiringResult.rows) {
    const companyId = Number(row.id);
    const expiresAt = new Date(row.subscription_expires_at);
    const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Check if notification already sent today
    const existing = await query(
      `
      SELECT id FROM system_notifications
      WHERE company_id = $1
        AND category = 'subscription'
        AND title LIKE '%expir%'
        AND DATE(created_at) = CURRENT_DATE
      LIMIT 1
      `,
      [companyId],
    );

    if (!existing.rows[0]) {
      // Create notification for the company admins
      const admins = await query(
        `SELECT id FROM users WHERE company_id = $1 AND LOWER(role) = 'admin'`,
        [companyId],
      );

      for (const admin of admins.rows) {
        await query(
          `
          INSERT INTO system_notifications (
            company_id, user_id, category, severity, title, message,
            reference_type, reference_id, metadata_json
          )
          VALUES ($1, $2, 'subscription', 'warning', $3, $4, 'company', $5, $6::jsonb)
          `,
          [
            companyId,
            admin.id,
            `Assinatura a expirar em ${daysRemaining} dia(s)`,
            `A assinatura da empresa ${row.name} expira em ${daysRemaining} dia(s) (${String(expiresAt.toISOString().slice(0, 10))}). Efectue o pagamento para manter o acesso ao sistema.`,
            companyId,
            JSON.stringify({ expiresAt: row.subscription_expires_at, daysRemaining }),
          ],
        );
        notificationsSent += 1;
      }
    }
  }

  // Find companies in grace period
  const graceResult = await query(
    `
    SELECT c.id, c.name, c.subscription_expires_at, c.subscription_grace_days
    FROM companies c
    WHERE c.subscription_status = 'active'
      AND c.subscription_expires_at IS NOT NULL
      AND c.subscription_expires_at < NOW()
      AND c.subscription_expires_at + (COALESCE(c.subscription_grace_days, 5) || ' days')::interval > NOW()
    `,
  );

  for (const row of graceResult.rows) {
    const companyId = Number(row.id);
    const expiresAt = new Date(row.subscription_expires_at);
    const graceDays = Number(row.subscription_grace_days || 5);
    const graceEnd = new Date(expiresAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
    const daysInGrace = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const existing = await query(
      `
      SELECT id FROM system_notifications
      WHERE company_id = $1
        AND category = 'subscription'
        AND title LIKE '%carencia%'
        AND DATE(created_at) = CURRENT_DATE
      LIMIT 1
      `,
      [companyId],
    );

    if (!existing.rows[0]) {
      const admins = await query(
        `SELECT id FROM users WHERE company_id = $1 AND LOWER(role) = 'admin'`,
        [companyId],
      );

      for (const admin of admins.rows) {
        await query(
          `
          INSERT INTO system_notifications (
            company_id, user_id, category, severity, title, message,
            reference_type, reference_id, metadata_json
          )
          VALUES ($1, $2, 'subscription', 'error', $3, $4, 'company', $5, $6::jsonb)
          `,
          [
            companyId,
            admin.id,
            `Atencao: Assinatura em periodo de carencia (${daysInGrace} dias restantes)`,
            `A assinatura da empresa ${row.name} expirou. Tem ${daysInGrace} dias de carencia para efectuar o pagamento. Apos este periodo, o acesso sera bloqueado.`,
            companyId,
            JSON.stringify({ expiresAt: row.subscription_expires_at, daysInGrace }),
          ],
        );
        notificationsSent += 1;
      }
    }
  }

  // Find companies past grace period (expired)
  const expiredResult = await query(
    `
    SELECT c.id, c.name, c.subscription_expires_at, c.subscription_grace_days
    FROM companies c
    WHERE c.is_active = true
      AND c.subscription_expires_at IS NOT NULL
      AND c.subscription_expires_at + (COALESCE(c.subscription_grace_days, 5) || ' days')::interval <= NOW()
    `,
  );

  for (const row of expiredResult.rows) {
    const companyId = Number(row.id);

    // Deactivate company
    await query(
      `UPDATE companies SET is_active = false, subscription_status = 'expired' WHERE id = $1 AND is_active = true`,
      [companyId],
    );

    const existing = await query(
      `
      SELECT id FROM system_notifications
      WHERE company_id = $1
        AND category = 'subscription'
        AND title LIKE '%bloqueado%'
        AND DATE(created_at) = CURRENT_DATE
      LIMIT 1
      `,
      [companyId],
    );

    if (!existing.rows[0]) {
      const admins = await query(
        `SELECT id FROM users WHERE company_id = $1 AND LOWER(role) = 'admin'`,
        [companyId],
      );

      for (const admin of admins.rows) {
        await query(
          `
          INSERT INTO system_notifications (
            company_id, user_id, category, severity, title, message,
            reference_type, reference_id, metadata_json
          )
          VALUES ($1, $2, 'subscription', 'error', $3, $4, 'company', $5, $6::jsonb)
          `,
          [
            companyId,
            admin.id,
            `Acesso bloqueado: Assinatura expirada`,
            `A assinatura da empresa ${row.name} expirou e o periodo de carencia terminou. O acesso ao sistema foi bloqueado. Contacte o Administrador Central para regularizar a situacao.`,
            companyId,
            JSON.stringify({ expiresAt: row.subscription_expires_at }),
          ],
        );
        notificationsSent += 1;
      }
    }
  }

  // Notify central admin about expiring/expired companies
  if (expiringResult.rows.length > 0 || graceResult.rows.length > 0 || expiredResult.rows.length > 0) {
    const centralAdmins = await query(
      `SELECT id FROM users WHERE company_id IS NULL AND LOWER(role) = 'admin' AND is_active = true`
    );

    for (const admin of centralAdmins.rows) {
      const totalAffected = expiringResult.rows.length + graceResult.rows.length + expiredResult.rows.length;
      const existing = await query(
        `
        SELECT id FROM system_notifications
        WHERE user_id = $1
          AND category = 'subscription_summary'
          AND DATE(created_at) = CURRENT_DATE
        LIMIT 1
        `,
        [admin.id],
      );

      if (!existing.rows[0] && totalAffected > 0) {
        const parts = [];
        if (expiringResult.rows.length > 0) parts.push(`${expiringResult.rows.length} a expirar`);
        if (graceResult.rows.length > 0) parts.push(`${graceResult.rows.length} em carencia`);
        if (expiredResult.rows.length > 0) parts.push(`${expiredResult.rows.length} bloqueadas`);

        await query(
          `
          INSERT INTO system_notifications (
            company_id, user_id, category, severity, title, message,
            reference_type, reference_id, metadata_json
          )
          VALUES (NULL, $1, 'subscription_summary', 'warning', $2, $3, 'system', NULL, $4::jsonb)
          `,
          [
            admin.id,
            `Resumo: ${totalAffected} empresa(s) com assinatura problematica`,
            `Resumo diario: ${parts.join(", ")}. Acesse o modulo de Microcredito - Assinaturas para gerir os pagamentos.`,
            JSON.stringify({
              expiring: expiringResult.rows.length,
              grace: graceResult.rows.length,
              expired: expiredResult.rows.length,
            }),
          ],
        );
        notificationsSent += 1;
      }
    }
  }

  return { notificationsSent, expiring: expiringResult.rows.length, grace: graceResult.rows.length, expired: expiredResult.rows.length };
}

/**
 * Start the subscription check scheduler
 */
export function startSubscriptionScheduler() {
  const runCheck = async () => {
    try {
      const result = await checkAndNotifySubscriptions();
      if (result.notificationsSent > 0) {
        logger.info("Subscription check notifications sent", result);
      }
    } catch (error) {
      logger.error("Subscription check scheduler failed", { error: error instanceof Error ? error.message : error });
    }
  };

  // Run immediately on startup (delayed by 30s to let app initialize)
  setTimeout(runCheck, 30 * 1000);
  // Then run every 6 hours
  const intervalMs = 6 * 60 * 60 * 1000;
  setInterval(runCheck, intervalMs);
  logger.info("Subscription scheduler started", { intervalHours: 6 });
}