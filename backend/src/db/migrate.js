import { pool } from "../config/db.js";
import { runMigrations } from "./migrator.js";
import { logger } from "../utils/logger.js";

async function migrate() {
  try {
    await runMigrations();
    logger.info("All migrations complete.");
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  logger.error("Migration failed", { message: error.message });
  process.exit(1);
});
