import { query, pool } from "../config/db.js";
import { hashPassword } from "../utils/security.js";

async function reset() {
  try {
    await query("BEGIN");

    await query("TRUNCATE TABLE client_evaluations RESTART IDENTITY CASCADE");
    await query("TRUNCATE TABLE guarantors RESTART IDENTITY CASCADE");
    await query("TRUNCATE TABLE loans RESTART IDENTITY CASCADE");
    await query("TRUNCATE TABLE clients RESTART IDENTITY CASCADE");
    await query("TRUNCATE TABLE companies RESTART IDENTITY CASCADE");

    await query("DELETE FROM users WHERE role <> 'admin'");
    await query("UPDATE users SET company_id = NULL WHERE role = 'admin'");

    const adminExists = await query("SELECT id FROM users WHERE email = 'admin@microcredito.mz' LIMIT 1");
    if (!adminExists.rows[0]) {
     const resetPassword = process.env.RESET_ADMIN_PASSWORD;

if (!resetPassword) {
  throw new Error("RESET_ADMIN_PASSWORD não definida.");
}

const passwordHash = await hashPassword(resetPassword);
      await query(
        "INSERT INTO users (full_name, email, password_hash, role, company_id, is_active) VALUES ($1, $2, $3, $4, $5, $6)",
        ["Administrador Geral", "admin@microcredito.mz", passwordHash, "admin", null, true],
      );
    }

    await query("COMMIT");
    console.log("Base limpa com sucesso (modo zerado).");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

reset().catch((error) => {
  console.error(error);
  process.exit(1);
});
