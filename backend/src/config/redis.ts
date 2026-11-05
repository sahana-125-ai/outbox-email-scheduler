import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

/**
 * BullMQ requires `maxRetriesPerRequest: null` for blocking connections.
 * Each Queue/Worker gets its own connection so a blocking command in the
 * worker can never starve API traffic.
 */
export function createRedisConnection(): Redis {
  const connection = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 250, 3000);
    }
  });

  connection.on("error", (error) => {
    logger.error({ error: error.message }, "Redis connection error");
  });

  return connection;
}

/** Shared connection for non-blocking commands such as rate-limit counters. */
export const redis = createRedisConnection();
