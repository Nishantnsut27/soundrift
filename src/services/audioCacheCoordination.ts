import { AUDIO_CACHE_NAME } from './audioPreparation';

const MUTATION_LOCK = `${AUDIO_CACHE_NAME}:mutation`;
const KEEP_PREFIX = `${AUDIO_CACHE_NAME}:keep:`;

/** Browser-owned leases survive frozen tabs and disappear when a tab closes. */
export class AudioCacheCoordination {
  private leaseName = '';
  private releaseLease: (() => Promise<void>) | null = null;

  /** Serializes mutation/accounting work only; playback reads bypass this lock. */
  async run<T>(keep: ReadonlySet<string> | undefined,
    operation: (protectedKeys: ReadonlySet<string>, canEvict: boolean) => Promise<T>): Promise<T> {
    const locks = navigator.locks;
    if (!locks) {
      // Without cross-tab locking, shared files cannot safely be evicted.
      return operation(keep ?? new Set(), false);
    }
    return locks.request(MUTATION_LOCK, async () => {
      if (keep) await this.replaceLease(locks, keep);
      const protectedKeys = new Set<string>();
      for (const lock of (await locks.query()).held ?? []) {
        if (!lock.name?.startsWith(KEEP_PREFIX)) continue;
        try {
          const keys: unknown = JSON.parse(lock.name.slice(KEEP_PREFIX.length));
          if (Array.isArray(keys)) for (const key of keys) if (typeof key === 'string') protectedKeys.add(key);
        } catch { /* Ignore unrelated malformed lock names. */ }
      }
      return operation(protectedKeys, true);
    });
  }

  private async replaceLease(locks: LockManager, keep: ReadonlySet<string>): Promise<void> {
    const name = keep.size ? KEEP_PREFIX + JSON.stringify([...keep].sort()) : '';
    if (name === this.leaseName) return;
    const releasePrevious = this.releaseLease;
    if (name) {
      await new Promise<void>((resolve, reject) => {
        const held = locks.request(name, { mode: 'shared' }, () => new Promise<void>(release => {
          this.releaseLease = () => { release(); return held.then(() => undefined); };
          this.leaseName = name;
          resolve();
        })).catch(reject);
      });
    } else {
      this.releaseLease = null;
      this.leaseName = '';
    }
    await releasePrevious?.();
  }
}
