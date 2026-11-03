import { AUDIO_CACHE_NAME, AUDIO_CACHE_PATH, AUDIO_POLICY, audioCacheUrl } from './audioPreparation';

const SIZE_HEADER = 'x-soundrift-size';
const STORED_AT_HEADER = 'x-soundrift-stored-at';

interface CacheEntry {
  size: number;
  usedAt: number;
}

function requestFor(key: string): Request {
  return new Request(audioCacheUrl(key));
}

function keyOf(request: Request): string {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(AUDIO_CACHE_PATH)) return '';
  try { return decodeURIComponent(pathname.slice(AUDIO_CACHE_PATH.length)); } catch { return ''; }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22);
}

/**
 * Complete audio files for upcoming songs, kept on the device.
 *
 * Cache Storage rather than IndexedDB: it stores the HTTP body as-is, reads it
 * back as a disk-backed Blob, needs no schema or transactions, and its quota
 * failures surface as a plain rejected put(). Metadata lives in the stored
 * response headers, so the index rebuilds from the cache alone after a reload.
 */
export class AudioCache {
  private opening: Promise<Cache | null> | null = null;
  private readonly entries = new Map<string, CacheEntry>();
  private loaded = false;
  private writable = true;
  private available = false;
  private mutations: Promise<unknown> = Promise.resolve();
  private byteBudget: number = AUDIO_POLICY.maxBytes;

  get size() { return this.entries.size; }
  get bytes() { return [...this.entries.values()].reduce((sum, entry) => sum + entry.size, 0); }

  /** A later foreground/reconnect/window change may have freed device storage. */
  retryWrites() { this.writable = this.available; }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(operation);
    this.mutations = result.catch(() => undefined);
    return result;
  }

  get isLoaded() { return this.loaded; }

  /** False without Cache Storage (insecure origin, private mode) or after quota ran out. */
  get isWritable() { return this.writable; }

  load(): Promise<Cache | null> {
    this.opening ??= this.open();
    return this.opening;
  }

  private async open(): Promise<Cache | null> {
    try {
      if (typeof caches === 'undefined') throw new Error('Cache Storage is unavailable.');
      const cache = await caches.open(AUDIO_CACHE_NAME);
      for (const request of await cache.keys()) {
        const key = keyOf(request);
        const response = key ? await cache.match(request) : undefined;
        if (!response) { await cache.delete(request); continue; }
        this.entries.set(key, {
          size: Number(response.headers.get(SIZE_HEADER)) || 0,
          usedAt: Number(response.headers.get(STORED_AT_HEADER)) || 0,
        });
      }
      this.available = true;
      return cache;
    } catch {
      this.writable = false;
      return null;
    } finally {
      this.loaded = true;
    }
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  async read(key: string): Promise<Blob | null> {
    const cache = await this.load();
    const entry = this.entries.get(key);
    if (!cache || !entry) return null;
    try {
      const blob = await (await cache.match(requestFor(key)))?.blob();
      if (blob?.size) {
        entry.usedAt = Date.now();
        return blob;
      }
    } catch {
      // Treated as a miss; the entry is dropped so it is downloaded again.
    }
    await this.remove(key);
    return null;
  }

  async write(key: string, blob: Blob, keep: ReadonlySet<string>): Promise<boolean> {
    return this.exclusive(() => this.writeEntry(key, blob, keep));
  }

  private async writeEntry(key: string, blob: Blob, keep: ReadonlySet<string>): Promise<boolean> {
    const cache = await this.load();
    if (!cache || !this.writable || !blob.size || blob.size > AUDIO_POLICY.maxTrackBytes) return false;
    try {
      const estimate = await navigator.storage?.estimate();
      if (estimate?.quota && estimate.usage !== undefined) {
        this.byteBudget = Math.min(AUDIO_POLICY.maxBytes, Math.max(0,
          Math.floor((estimate.quota - estimate.usage + this.bytes) * 0.85)));
      }
    } catch { /* The configured cap still applies without storage estimates. */ }
    if (!(await this.makeRoom(blob.size, keep, key))) {
      // Wait for a window/storage change before spending data on more files
      // that cannot be retained. The nearest file can still live in memory.
      this.writable = false;
      return false;
    }
    const put = () => cache.put(requestFor(key), new Response(blob, {
      headers: {
        'Content-Type': blob.type,
        [SIZE_HEADER]: String(blob.size),
        [STORED_AT_HEADER]: String(Date.now()),
      },
    }));
    try {
      await put();
    } catch (error) {
      if (!isQuotaError(error)) return false;
      await this.evict(keep, () => true);
      try {
        await put();
      } catch {
        this.writable = false;
        return false;
      }
    }
    this.entries.set(key, { size: blob.size, usedAt: Date.now() });
    return true;
  }

  async remove(key: string): Promise<void> {
    return this.exclusive(() => this.removeEntry(key));
  }

  private async removeEntry(key: string): Promise<void> {
    const cache = await this.load();
    this.entries.delete(key);
    try { await cache?.delete(requestFor(key)); } catch {
      // A missing or unreachable entry is already as good as removed.
    }
  }

  /** Drops songs well behind the listener, then the least recently used beyond the caps. */
  async prune(keep: ReadonlySet<string>): Promise<void> {
    return this.exclusive(async () => {
      if (!this.loaded) await this.load();
      // Also remove obsolete queue windows; unchanged overlapping songs stay put.
      for (const key of [...this.entries.keys()]) {
        if (!keep.has(key)) await this.removeEntry(key);
      }
      await this.makeRoom(0, keep);
      this.retryWrites();
    });
  }

  /** Evicts until one more file of `size` bytes fits. False when kept files alone exceed the caps. */
  private async makeRoom(size: number, keep: ReadonlySet<string>, replacing = ''): Promise<boolean> {
    const existing = this.entries.get(replacing);
    const extra = size > 0 && !existing ? 1 : 0;
    const overLimit = () => {
      let bytes = size - (existing?.size || 0);
      for (const entry of this.entries.values()) bytes += entry.size;
      return this.entries.size + extra > AUDIO_POLICY.maxEntries || bytes > this.byteBudget;
    };
    await this.evict(new Set([...keep, replacing]), overLimit);
    return !overLimit();
  }

  private async evict(keep: ReadonlySet<string>, shouldEvict: () => boolean): Promise<void> {
    const candidates = [...this.entries].filter(([key]) => !keep.has(key)).sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (const [key] of candidates) {
      if (!shouldEvict()) return;
      await this.removeEntry(key);
    }
  }
}

export const audioCache = new AudioCache();
