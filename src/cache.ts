import { logger } from "./logger";
import { getRedis } from "./redis";

// =============================================================================
// Cache Store Interface
// =============================================================================

/**
 * Interface for a hash-based cache store.
 * Implementations must support hash get/set and key expiration.
 */
export interface CacheStore {
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, values: Record<string, string>): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
}

type RedisClient = NonNullable<ReturnType<typeof getRedis>>;

// =============================================================================
// Redis Store
// =============================================================================

/**
 * Backs the cache with the memoized Redis client from `getRedis()`, which
 * reads `configure({ redis: { url } })` first and falls back to `REDIS_URL`.
 */
class RedisStore implements CacheStore {
  private client: RedisClient;

  constructor(client: RedisClient) {
    this.client = client;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hset(key: string, values: Record<string, string>): Promise<void> {
    await this.client.hset(key, values);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }
}

// =============================================================================
// File Store
// =============================================================================

import * as fs from "fs";
import * as path from "path";

/**
 * Backs the cache with JSON files on disk. Useful for committing a warm cache
 * to Git so CI runs can reuse cached steps without a Redis server.
 */
class FileStore implements CacheStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private filePath(key: string): string {
    // Encode key to a safe filename
    const safeKey = encodeURIComponent(key);
    return path.join(this.dir, `${safeKey}.json`);
  }

  private read(key: string): { data: Record<string, string>; expiresAt?: number } | null {
    const fp = this.filePath(key);
    if (!fs.existsSync(fp)) return null;

    try {
      const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));

      // Check expiration
      if (raw.expiresAt && Date.now() > raw.expiresAt) {
        fs.unlinkSync(fp);
        return null;
      }

      return raw;
    } catch {
      return null;
    }
  }

  private write(key: string, entry: { data: Record<string, string>; expiresAt?: number }): void {
    const fp = this.filePath(key);
    fs.writeFileSync(fp, JSON.stringify(entry), "utf-8");
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const entry = this.read(key);
    return entry?.data ?? {};
  }

  async hset(key: string, values: Record<string, string>): Promise<void> {
    const existing = this.read(key);
    const merged = { ...(existing?.data ?? {}), ...values };
    this.write(key, { data: merged, expiresAt: existing?.expiresAt });
  }

  async expire(key: string, seconds: number): Promise<void> {
    const existing = this.read(key);
    if (!existing) return;
    this.write(key, { ...existing, expiresAt: Date.now() + seconds * 1000 });
  }
}

// =============================================================================
// Factory
// =============================================================================

let cacheInstance: CacheStore | null = null;
let initialized = false;

/**
 * Returns a memoized cache store based on the `CACHE_PROVIDER` env var:
 *   - "redis" (also the default): uses Redis via `getRedis()`, which honors
 *     `configure({ redis: { url } })` and `REDIS_URL`.
 *   - "file": uses JSON files on disk at `CACHE_DIR` (defaults to
 *     `.passmark-cache`). Handy for committing a warm cache to Git for CI.
 *   - "none": disables caching entirely.
 *
 * Returns null when caching is disabled or no Redis URL is configured, which
 * disables step caching, {{global.*}} placeholders, and project data.
 *
 * Lazy: resolved on first call so users can call `configure()` beforehand.
 */
export function getCache(): CacheStore | null {
  if (initialized) return cacheInstance;
  initialized = true;

  const provider = process.env.CACHE_PROVIDER?.toLowerCase();

  if (provider === "none") {
    logger.warn("CACHE_PROVIDER is 'none'. Caching is disabled.");
    cacheInstance = null;
    return cacheInstance;
  }

  if (provider === "file") {
    const dir = process.env.CACHE_DIR || ".passmark-cache";
    logger.info(`Using file-based cache at: ${dir}`);
    cacheInstance = new FileStore(dir);
    return cacheInstance;
  }

  if (provider && provider !== "redis") {
    logger.warn(`Unknown CACHE_PROVIDER '${provider}'. Caching is disabled.`);
    cacheInstance = null;
    return cacheInstance;
  }

  // Default ("redis" or unset): use the configured Redis client. getRedis()
  // already warns when no URL is set.
  const redis = getRedis();
  cacheInstance = redis ? new RedisStore(redis) : null;
  return cacheInstance;
}

/** @internal Reset the memoized cache store. Used for testing only. */
export function resetCache() {
  cacheInstance = null;
  initialized = false;
}
