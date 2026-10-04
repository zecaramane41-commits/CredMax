import { pool } from "./config/db.js";
import { env } from "./config/env.js";
import { app } from "./app.js";

const server = app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port}`);
});

const shutdown = async () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
