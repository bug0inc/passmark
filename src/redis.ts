import Redis from "ioredis";
import { getConfig } from "./config";
import { logger } from "./logger";

let client: Redis | null = null;
let initialized = false;

/**
 * Returns a memoized Redis client. Reads `configure({ redis: { url } })` first,
 * then falls back to `process.env.REDIS_URL`. Returns null when neither is set,
 * which disables step caching, {{global.*}} placeholders, and project data.
 *
 * Lazy: the connection is opened on first call so users can call `configure()`
 * before any Redis-dependent code path runs.
 */
export function getRedis(): Redis | null {
  if (initialized) return client;
  initialized = true;

  const url = getConfig().redis?.url ?? process.env.REDIS_URL;
  if (!url) {
    logger.warn(
      "Redis URL not set (configure({ redis: { url } }) or REDIS_URL). " +
        "Step caching, global placeholders, and project data are disabled.",
    );
    return null;
  }

  client = new Redis(url);
  return client;
}

/** @internal Reset the memoized client. Used for testing only. */
export function resetRedis() {
  client?.disconnect();
  client = null;
  initialized = false;
}
