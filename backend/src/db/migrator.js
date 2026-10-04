import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const INITIAL_VERSION = "001_initial_schema";

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedVersions() {
  const result = await pool.query("SELECT version FROM schema_migrations ORDER BY version ASC");
  return new Set(result.rows.map((row) => row.version));
}

async function bootstrapLegacyDatabase() {
  const done = await appliedVersions();
  if (done.has(INITIAL_VERSION)) return;

  const legacy = await pool.query("SELECT to_regclass('public.companies') AS reg");
  if (!legacy.rows[0]?.reg) return;

  await pool.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", [INITIAL_VERSION]);
  logger.info("Legacy database detected; marked initial migration as applied", { version: INITIAL_VERSION });
}

export async function runMigrations() {
  await ensureMigrationsTable();
  await bootstrapLegacyDatabase();
  const done = await appliedVersions();

  let files = [];
  try {
    files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();
  } catch {
    logger.warn("No migrations directory found; skipping file-based migrations");
    return;
  }

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (done.has(version)) {
      logger.debug("Migration already applied", { version });
      continue;
    }

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    logger.info("Applying migration", { version });
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await pool.query("COMMIT");
      logger.info("Migration applied", { version });
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}
