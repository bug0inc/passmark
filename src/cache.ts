import { logger } from "./logger";

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

// =============================================================================
// Redis Store
// =============================================================================

class RedisStore implements CacheStore {
  private client: import("ioredis").default;

  constructor(url: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require("ioredis") as typeof import("ioredis").default;
    this.client = new Redis(url);
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

/**
 * Creates the cache store based on environment variables.
 *
 * CACHE_PROVIDER selects the backend:
 *   - "redis" (default when REDIS_URL is set): uses Redis via ioredis
 *   - "file": uses JSON files on disk at CACHE_DIR (defaults to .passmark-cache)
 *   - "none": disables caching entirely
 *
 * For backwards compatibility, if CACHE_PROVIDER is not set:
 *   - If REDIS_URL is set → uses Redis
 *   - Otherwise → caching is disabled (null)
 */
function createCacheStore(): CacheStore | null {
  const provider = process.env.CACHE_PROVIDER?.toLowerCase();

  if (provider === "none") {
    logger.warn("Cache provider set to 'none'. Caching is disabled.");
    return null;
  }

  if (provider === "file") {
    const dir = process.env.CACHE_DIR || ".passmark-cache";
    logger.info(`Using file-based cache at: ${dir}`);
    return new FileStore(dir);
  }

  if (provider === "redis" || (!provider && process.env.REDIS_URL)) {
    if (!process.env.REDIS_URL) {
      logger.warn("CACHE_PROVIDER is 'redis' but REDIS_URL is not set. Caching is disabled.");
      return null;
    }
    logger.info("Using Redis cache.");
    return new RedisStore(process.env.REDIS_URL);
  }

  if (provider) {
    logger.warn(`Unknown CACHE_PROVIDER '${provider}'. Caching is disabled.`);
    return null;
  }

  // No CACHE_PROVIDER and no REDIS_URL
  logger.warn(
    "No cache provider configured. Set CACHE_PROVIDER=redis|file|none or REDIS_URL. " +
      "Step caching, global placeholders, and project data are disabled.",
  );
  return null;
}

export const cache: CacheStore | null = createCacheStore();
