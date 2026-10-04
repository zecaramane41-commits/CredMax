import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "../src/db/migrations");
const outputFile = path.join(outputDir, "001_initial_schema.sql");

async function exportSchema() {
  const tables = await pool.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
    ORDER BY tablename
  `);

  const chunks = [
    "-- Auto-generated from live database schema",
    "-- Source: scripts/introspect-schema.js",
    "",
  ];

  for (const { tablename } of tables.rows) {
    const columns = await pool.query(
      `
      SELECT
        column_name,
        data_type,
        udt_name,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
      `,
      [tablename],
    );

    const defs = columns.rows.map((col) => {
      let type = col.data_type;
      if (type === "USER-DEFINED") type = col.udt_name;
      if (type === "character varying") {
        type = col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : "TEXT";
      } else if (type === "numeric" && col.numeric_precision) {
        type = `NUMERIC(${col.numeric_precision},${col.numeric_scale || 0})`;
      } else if (type === "ARRAY") {
        type = `${col.udt_name.replace(/^_/, "")}[]`;
      } else if (type === "timestamp with time zone") {
        type = "TIMESTAMPTZ";
      } else if (type === "timestamp without time zone") {
        type = "TIMESTAMP";
      } else if (type === "double precision") {
        type = "DOUBLE PRECISION";
      } else if (type === "integer") {
        type = "INT";
      } else if (type === "bigint") {
        type = "BIGINT";
      } else if (type === "boolean") {
        type = "BOOLEAN";
      } else if (type === "date") {
        type = "DATE";
      } else if (type === "jsonb") {
        type = "JSONB";
      } else if (type === "text") {
        type = "TEXT";
      }

      let line = `  ${col.column_name} ${type}`;
      if (col.is_nullable === "NO") line += " NOT NULL";
      if (col.column_default) line += ` DEFAULT ${col.column_default}`;
      return line;
    });

    chunks.push(`CREATE TABLE IF NOT EXISTS ${tablename} (`);
    chunks.push(defs.join(",\n"));
    chunks.push(");");
    chunks.push("");
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputFile, `${chunks.join("\n")}\n`, "utf8");
  logger.info("Schema introspected", { tables: tables.rows.length, outputFile });
}

exportSchema()
  .catch((error) => {
    logger.error("Schema introspection failed", { message: error.message });
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
