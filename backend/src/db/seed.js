import { query, pool } from "../config/db.js";
import { env } from "../config/env.js";
import { hashPassword } from "../utils/security.js";
import { logger } from "../utils/logger.js";

async function seed() {
  try {
    const adminEmail = env.seedAdminEmail;
    const adminPassword = env.seedAdminPassword;

if (!adminPassword) {
  throw new Error("SEED_ADMIN_PASSWORD is required.");
}

    const adminExists = await query("SELECT id FROM users WHERE email = $1 LIMIT 1", [adminEmail]);
    if (!adminExists.rows[0]) {
      const passwordHash = await hashPassword(adminPassword);
      await query(
        "INSERT INTO users (full_name, email, password_hash, role, company_id, is_active) VALUES ($1, $2, $3, $4, $5, $6)",
        ["Administrador Geral", adminEmail, passwordHash, "admin", null, true],
      );
      logger.info("Admin user created", { email: adminEmail });
    } else {
      logger.info("Admin user already exists", { email: adminEmail });
    }

    if (env.nodeEnv !== "production") {
      logger.warn("Development seed complete. Change the default admin password after first login.");
    } else {
      logger.info("Production seed complete.");
    }
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  logger.error("Seed failed", { message: error.message });
  process.exit(1);
});
