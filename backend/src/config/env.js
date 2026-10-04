import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", "..", ".env");
dotenv.config({ path: envPath });

const missingEnv = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD", "JWT_SECRET"].filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error("[env] Missing required environment variables:", missingEnv.join(", "));
  console.error("[env] Loaded env file from:", envPath);
  console.error("[env] CWD:", process.cwd());
  console.error("[env] __dirname:", __dirname);
  throw new Error(`Missing required environment variable: ${missingEnv[0]}`);
}

const nodeEnv = process.env.NODE_ENV || "development";
const jwtSecret = process.env.JWT_SECRET;

if (nodeEnv === "production") {
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be a strong secret (min. 32 chars) in production.");
  }
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 8000),
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || "admin@microcredito.mz",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || "",
};