import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/config/env.js";
import { logger } from "../src/utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "../src/db/migrations");
const outputFile = path.join(outputDir, "001_initial_schema.sql");

mkdirSync(outputDir, { recursive: true });

const args = [
  "-h",
  env.db.host,
  "-p",
  String(env.db.port),
  "-U",
  env.db.user,
  "-d",
  env.db.database,
  "--schema-only",
  "--no-owner",
  "--no-privileges",
];

const child = spawn("pg_dump", args, {
  env: { ...process.env, PGPASSWORD: env.db.password },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

child.on("close", (code) => {
  if (code !== 0) {
    logger.error("pg_dump failed", { code, stderr: stderr.trim() });
    process.exit(code || 1);
  }

  writeFileSync(outputFile, stdout, "utf8");
  logger.info("Initial migration exported", { outputFile, bytes: stdout.length });
});
