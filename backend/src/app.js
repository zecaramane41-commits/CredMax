import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { logger } from "./utils/logger.js";
import { buildAuditMiddleware } from "./services/audit-log-service.js";
import { registerApiRoutes } from "./routes/index.js";
import { startFinanceAutoCloseScheduler } from "./routes/finance-session-routes.js";
import { startNotificationScheduler } from "./services/notification-service.js";
import { startSubscriptionScheduler } from "./middleware/subscription-check.js";

export const app = express();

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;
// Allow Vite access over local network in development (e.g. http://192.168.x.x:5173).
const privateLanOriginPattern = /^http:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/;
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const isDevPrivateLanOrigin = process.env.NODE_ENV !== "production" && privateLanOriginPattern.test(origin);
      if (env.corsOrigins.includes(origin) || localhostOriginPattern.test(origin) || isDevPrivateLanOrigin) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  }),
);
app.use(express.json({ limit: "35mb" }));
app.use(morgan("dev"));
app.use(buildAuditMiddleware());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "microcredit-backend" });
});

registerApiRoutes(app);

startFinanceAutoCloseScheduler();
startNotificationScheduler();
startSubscriptionScheduler();

app.use(errorHandler);
