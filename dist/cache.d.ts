/**
 * Interface for a hash-based cache store.
 * Implementations must support hash get/set and key expiration.
 */
export interface CacheStore {
    hgetall(key: string): Promise<Record<string, string>>;
    hset(key: string, values: Record<string, string>): Promise<void>;
    expire(key: string, seconds: number): Promise<void>;
}
export declare const cache: CacheStore | null;
