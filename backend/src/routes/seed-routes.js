import { Router } from "express";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { env } from "../config/env.js";

const seedRouter = Router();

seedRouter.post(
  "/system-data",
  requireAuth,
  requirePermission("*"),
  (req, res) => {
    if (env.nodeEnv === "production") {
      return res.status(403).json({
        success: false,
        message: "Endpoint de seed desativado em producao.",
      });
    }

    try {
      const scriptPath = path.join(process.cwd(), "scripts", "seed-system-data.js");
      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: process.env,
      });

      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || "Falha ao executar seed.");
      }

      return res.json({
        success: true,
        message: "Dados populados com sucesso no backend",
        output: String(result.stdout || "").trim() || undefined,
      });
    } catch (error) {
      console.error("Erro no seed:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao popular dados",
        error: error.message,
      });
    }
  },
);

export { seedRouter };
