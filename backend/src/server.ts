import app from "./app";
import { env, assertRuntimeConfig } from "./config/env";
import { prisma } from "./config/prisma";
import { redis } from "./config/redis";
import { ensureEmailIndex } from "./config/elastic";
import { logger } from "./config/logger";
import { emailQueue } from "./queue/emailQueue";

async function start() {
  for (const warning of assertRuntimeConfig()) {
    logger.warn(warning);
  }

  await prisma.$connect();
  logger.info("PostgreSQL connected");

  try {
    await redis.ping();
    logger.info("Redis connected");
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Redis is not reachable — scheduling will fail");
  }

  // Never block API startup on Elasticsearch; search degrades to PostgreSQL.
  void ensureEmailIndex();

  const server = app.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port}`);
    logger.info(`Swagger docs: http://localhost:${env.port}/api-docs`);
    logger.info(`Bull Board:   http://localhost:${env.port}/admin/queues`);
  });

  server.on("error", (error) => {
    logger.error({ error: error.message }, "HTTP server error");
    process.exitCode = 1;
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close();
    await Promise.allSettled([
      emailQueue.close(),
      redis.quit(),
      prisma.$disconnect()
    ]);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => {
  logger.error({ error: error instanceof Error ? error.stack : error }, "Failed to start API");
  process.exit(1);
});
