import { config } from '../config/config.js';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class CacheService {
  private cache = new Map<string, CacheEntry<unknown>>();
  private inFlightMap = new Map<string, Promise<unknown>>();
  private ttlMs: number;

  constructor(ttlMs: number = config.cacheTtlMs) {
    this.ttlMs = ttlMs;
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data as T;
  }

  public set<T>(key: string, data: T, customTtlMs?: number): void {
    const expiresAt = Date.now() + (customTtlMs || this.ttlMs);
    this.cache.set(key, { data, expiresAt });

    if (this.cache.size > 2000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
  }

  public delete(key: string): void {
    this.cache.delete(key);
    this.inFlightMap.delete(key);
  }

  public async getOrFetch<T>(key: string, fetchFn: () => Promise<T>, customTtlMs?: number, refresh = false): Promise<T> {
    const cached = refresh ? null : this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const existingPromise = this.inFlightMap.get(key);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }

    const promise = (async () => {
      try {
        const result = await fetchFn();
        const isEmpty =
          result === null ||
          result === undefined ||
          (Array.isArray(result) && result.length === 0);
        if (!isEmpty) {
          this.set(key, result, customTtlMs);
        }
        return result;
      } finally {
        this.inFlightMap.delete(key);
      }
    })();

    this.inFlightMap.set(key, promise);
    return promise;
  }

  public clear(): void {
    this.cache.clear();
    this.inFlightMap.clear();
  }
}

export const globalCacheService = new CacheService();
