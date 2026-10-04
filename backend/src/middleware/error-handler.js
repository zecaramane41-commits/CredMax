import { logger } from "../utils/logger.js";

export function errorHandler(error, _req, res, _next) {
  logger.error("Unhandled request error", { message: error?.message, stack: error?.stack });
  return res.status(500).json({
    message: "Erro interno no servidor.",
    detail: process.env.NODE_ENV === "production" ? undefined : error.message,
  });
}
