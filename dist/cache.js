"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cache = void 0;
const logger_1 = require("./logger");
// =============================================================================
// Redis Store
// =============================================================================
class RedisStore {
    client;
    constructor(url) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Redis = require("ioredis");
        this.client = new Redis(url);
    }
    async hgetall(key) {
        return this.client.hgetall(key);
    }
    async hset(key, values) {
        await this.client.hset(key, values);
    }
    async expire(key, seconds) {
        await this.client.expire(key, seconds);
    }
}
// =============================================================================
// File Store
// =============================================================================
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class FileStore {
    dir;
    constructor(dir) {
        this.dir = dir;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    filePath(key) {
        // Encode key to a safe filename
        const safeKey = encodeURIComponent(key);
        return path.join(this.dir, `${safeKey}.json`);
    }
    read(key) {
        const fp = this.filePath(key);
        if (!fs.existsSync(fp))
            return null;
        try {
            const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
            // Check expiration
            if (raw.expiresAt && Date.now() > raw.expiresAt) {
                fs.unlinkSync(fp);
                return null;
            }
            return raw;
        }
        catch {
            return null;
        }
    }
    write(key, entry) {
        const fp = this.filePath(key);
        fs.writeFileSync(fp, JSON.stringify(entry), "utf-8");
    }
    async hgetall(key) {
        const entry = this.read(key);
        return entry?.data ?? {};
    }
    async hset(key, values) {
        const existing = this.read(key);
        const merged = { ...(existing?.data ?? {}), ...values };
        this.write(key, { data: merged, expiresAt: existing?.expiresAt });
    }
    async expire(key, seconds) {
        const existing = this.read(key);
        if (!existing)
            return;
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
function createCacheStore() {
    const provider = process.env.CACHE_PROVIDER?.toLowerCase();
    if (provider === "none") {
        logger_1.logger.warn("Cache provider set to 'none'. Caching is disabled.");
        return null;
    }
    if (provider === "file") {
        const dir = process.env.CACHE_DIR || ".passmark-cache";
        logger_1.logger.info(`Using file-based cache at: ${dir}`);
        return new FileStore(dir);
    }
    if (provider === "redis" || (!provider && process.env.REDIS_URL)) {
        if (!process.env.REDIS_URL) {
            logger_1.logger.warn("CACHE_PROVIDER is 'redis' but REDIS_URL is not set. Caching is disabled.");
            return null;
        }
        logger_1.logger.info("Using Redis cache.");
        return new RedisStore(process.env.REDIS_URL);
    }
    if (provider) {
        logger_1.logger.warn(`Unknown CACHE_PROVIDER '${provider}'. Caching is disabled.`);
        return null;
    }
    // No CACHE_PROVIDER and no REDIS_URL
    logger_1.logger.warn("No cache provider configured. Set CACHE_PROVIDER=redis|file|none or REDIS_URL. " +
        "Step caching, global placeholders, and project data are disabled.");
    return null;
}
exports.cache = createCacheStore();
