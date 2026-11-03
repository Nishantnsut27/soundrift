import type { Track } from '../types/types';
import { MusicAPI } from './musicApi';
import { audioCache } from './audioCache';
import { getOfflineBlob, getOfflinePrepared, isOfflineSaved } from './offlineLibrary';
import { canServeCachedAudio } from './cachedAudioRoute';
import { AUDIO_POLICY, audioCacheUrl, cacheKeyOf, prepareBlob, prepareCached, sourceOf, type PreparedTrack } from './audioPreparation';
import { resetAudioBufferStatus, setAudioBufferStatus, type AudioBufferStatus } from './audioBufferStatus';

export type { PreparedTrack } from './audioPreparation';
const EXPIRED_STREAM_STATUSES = new Set([401, 403, 404, 410]);
const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/aacp',
  'audio/ogg', 'application/ogg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/webm',
]);

export interface PrefetchPlan {
  current: Track | null;
  upcoming: readonly Track[];
  history: readonly Track[];
  target: number;
  canDownload: boolean;
  limited: AudioBufferStatus['limited'];
}
interface WantedTrack { key: string; track: Track }
interface Failure { attempts: number; retryAt: number }

export class DownloadError extends Error {
  readonly status: number;
  constructor(status: number) { super('Audio download failed with status ' + status + '.'); this.status = status; }
}

export async function downloadAudio(source: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(source, { signal, mode: 'cors', credentials: 'omit' });
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const length = Number(response.headers.get('content-length'));
  if (response.status !== 200 || !response.body || !SUPPORTED_AUDIO_TYPES.has(type) || length > AUDIO_POLICY.maxTrackBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new DownloadError(response.status);
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > AUDIO_POLICY.maxTrackBytes) throw new DownloadError(response.status);
      chunks.push(new Uint8Array(value));
    }
    if (!size || (length > 0 && !response.headers.get('content-encoding') && size !== length)) throw new DownloadError(response.status);
    return new Blob(chunks, { type });
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}

/** A sliding disk window. At most two upcoming files are held as page Blob URLs. */
export class TrackPrefetcher {
  private signature = '';
  private wanted: WantedTrack[] = [];
  private occurrenceKeys: string[] = [];
  private currentKey = '';
  private keep: ReadonlySet<string> = new Set();
  private plan: PrefetchPlan | null = null;
  private download: { key: string; controller: AbortController } | null = null;
  private readonly ready = new Map<string, PreparedTrack>();
  private readonly offlineReady = new Set<string>();
  private readonly warming = new Map<string, number>();
  private readonly checked = new Set<string>();
  private readonly failures = new Map<string, Failure>();
  private readonly storageBlocked = new Set<string>();
  private generation = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeCache: (() => void) | null = null;
  private publication = 0;

  sync(plan: PrefetchPlan): void {
    this.unsubscribeCache ??= audioCache.subscribe(() => {
      this.checked.clear();
      for (const [key, prepared] of this.ready) {
        if (prepared.storage === 'automatic' && !prepared.url.startsWith('blob:') && !audioCache.has(key)) {
          prepared.release();
          this.ready.delete(key);
        }
      }
      this.storageBlocked.clear();
      audioCache.retryWrites();
      this.pump();
    });
    this.plan = plan;
    this.currentKey = plan.current ? cacheKeyOf(plan.current) : '';
    this.occurrenceKeys = plan.upcoming.map(cacheKeyOf);
    const wanted: WantedTrack[] = [];
    for (const track of plan.upcoming) {
      const key = cacheKeyOf(track);
      if (key && !wanted.some(entry => entry.key === key)) wanted.push({ key, track });
    }
    const recent = plan.history.slice(-AUDIO_POLICY.history).map(cacheKeyOf);
    const signature = JSON.stringify([this.currentKey, wanted.map(entry => entry.key), recent]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.wanted = wanted;
      this.keep = new Set([this.currentKey, ...wanted.map(entry => entry.key), ...recent].filter(Boolean));
      // Keep a download which just became current; its completed file can recover playback.
      if (this.download && !this.keep.has(this.download.key)) this.download.controller.abort();
      this.releaseObsolete();
      for (const key of this.failures.keys()) if (!this.keep.has(key)) this.failures.delete(key);
      this.storageBlocked.clear();
      this.publication++;
      this.publishValidated(false);
      void audioCache.prune(this.keep).then(() => this.pump());
    }
    this.pump();
  }

  /** Works for any cached queue entry, including rapid skips and Previous. */
  take(track: Track): PreparedTrack | null {
    const key = cacheKeyOf(track);
    const ready = this.ready.get(key);
    // Only resident bytes are safe to hand off synchronously. Cache URLs must
    // be revalidated asynchronously; a stale index is never a playable source.
    if (ready?.url.startsWith('blob:')) { this.ready.delete(key); this.checked.delete(key); return ready; }
    return null;
  }

  /** A missed warm-up must still consult the automatic cache before the CDN. */
  async resolve(track: Track): Promise<PreparedTrack | null> {
    return this.resolvePrepared(track, true);
  }

  private async resolvePrepared(track: Track, memory: boolean): Promise<PreparedTrack | null> {
    const ready = this.take(track);
    if (ready) return ready;
    const savedBlob = memory ? await getOfflineBlob(track) : null;
    const saved = savedBlob ? prepareBlob(sourceOf(track), savedBlob, 'offline') : await getOfflinePrepared(track);
    if (saved) return saved;
    const key = cacheKeyOf(track);
    if (!key) return null;
    if (!memory && canServeCachedAudio() && await audioCache.contains(key)) return prepareCached(sourceOf(track), audioCacheUrl(key), 'automatic');
    const blob = await audioCache.read(key);
    return blob ? prepareBlob(sourceOf(track), blob, 'automatic') : null;
  }

  discard(track: Track): void {
    const key = cacheKeyOf(track);
    this.ready.get(key)?.release();
    this.ready.delete(key);
    this.checked.delete(key);
    if (key) void audioCache.remove(key);
  }

  retryFailed(): void {
    this.generation++;
    this.failures.clear();
    this.storageBlocked.clear();
    this.checked.clear();
    this.offlineReady.clear();
    for (const prepared of this.ready.values()) prepared.release();
    this.ready.clear();
    audioCache.retryWrites();
    this.pump();
  }

  clear(): void {
    this.generation++;
    this.publication++;
    this.unsubscribeCache?.();
    this.unsubscribeCache = null;
    void audioCache.release();
    this.signature = '';
    this.plan = null;
    this.wanted = [];
    this.occurrenceKeys = [];
    this.keep = new Set();
    this.download?.controller.abort();
    this.download = null;
    this.warming.clear();
    this.checked.clear();
    this.failures.clear();
    this.storageBlocked.clear();
    for (const prepared of this.ready.values()) prepared.release();
    this.ready.clear();
    this.offlineReady.clear();
    this.cancelRetry();
    resetAudioBufferStatus();
  }

  private releaseObsolete(): void {
    const memoryKeys = new Set(this.wanted.slice(0, 2).map(entry => entry.key));
    for (const [key, prepared] of this.ready) {
      if (!this.keep.has(key) || prepared.url.startsWith('blob:') && !memoryKeys.has(key) && key !== this.currentKey) {
        prepared.release();
        this.ready.delete(key);
        this.checked.delete(key);
      }
    }
    for (const key of this.checked) if (!this.keep.has(key)) this.checked.delete(key);
    for (const key of this.offlineReady) if (!this.keep.has(key)) this.offlineReady.delete(key);
  }

  private publish(): void {
    if (!this.plan) return;
    const publication = ++this.publication;
    void audioCache.validate(new Set(this.occurrenceKeys)).then(missing => {
      if (publication !== this.publication || !this.plan) return;
      let invalidated = false;
      for (const key of missing) { this.checked.delete(key); invalidated = true; }
      for (const [key, prepared] of this.ready) {
        if (prepared.storage === 'automatic' && !prepared.url.startsWith('blob:') && !audioCache.has(key)) {
          prepared.release(); this.ready.delete(key); this.checked.delete(key); invalidated = true;
        }
      }
      this.publishValidated();
      if (invalidated) this.pump();
    });
  }

  private publishValidated(verifiedCache = true): void {
    if (!this.plan) return;
    const available = this.occurrenceKeys.map(key => !!key && (
      verifiedCache && (audioCache.has(key) || this.ready.has(key))
      || this.ready.get(key)?.url.startsWith('blob:') || this.offlineReady.has(key)));
    const firstMissing = available.indexOf(false);
    setAudioBufferStatus({
      target: this.plan.target, total: available.length, ready: available.filter(Boolean).length,
      contiguousReady: firstMissing < 0 ? available.length : firstMissing,
      downloading: !!this.download, failed: this.occurrenceKeys.filter(key => this.failures.has(key)).length,
      bytes: audioCache.bytes, limited: this.plan.limited || (this.storageBlocked.size ? 'storage' : null),
    });
  }

  private pump(): void {
    this.cancelRetry();
    if (!this.plan) return;
    if (!audioCache.isLoaded) { void audioCache.load().then(() => this.pump()); return; }
    const nearest = new Set(this.wanted.slice(0, 2).map(entry => entry.key));
    for (const entry of this.wanted) {
      const needsMemory = nearest.has(entry.key) && !this.ready.get(entry.key)?.url.startsWith('blob:')
        && (audioCache.has(entry.key) || this.offlineReady.has(entry.key));
      if (!this.warming.has(entry.key) && (needsMemory || !this.ready.has(entry.key) && !this.checked.has(entry.key))) void this.warm(entry);
    }
    if (!this.download && this.plan.canDownload) {
      const candidates = audioCache.isWritable ? this.wanted : this.wanted.slice(0, 1);
      const target = candidates.find(({ key }) => !audioCache.has(key) && !this.ready.has(key) && !this.offlineReady.has(key)
        && !this.storageBlocked.has(key)
        && (!this.failures.has(key) || this.failures.get(key)!.retryAt <= Date.now()));
      if (target && !this.warming.has(target.key)) void this.fetchTrack(target);
      else this.scheduleRetry();
    }
    this.publish();
  }

  private async warm(entry: WantedTrack): Promise<void> {
    const generation = this.generation;
    this.warming.set(entry.key, generation);
    try {
      const prepare = canServeCachedAudio() || this.wanted.slice(0, 2).some(item => item.key === entry.key);
      const saved = !prepare && !audioCache.has(entry.key) ? await isOfflineSaved(entry.track) : false;
      const memory = !canServeCachedAudio() || this.wanted.slice(0, 2).some(item => item.key === entry.key);
      const prepared = prepare ? await this.resolvePrepared(entry.track, memory) : null;
      if (this.generation !== generation) { prepared?.release(); return; }
      this.checked.add(entry.key);
      if (saved || prepared?.storage === 'offline') this.offlineReady.add(entry.key);
      else this.offlineReady.delete(entry.key);
      if (prepared) {
        if (this.keep.has(entry.key)) { this.ready.get(entry.key)?.release(); this.ready.set(entry.key, prepared); }
        else prepared.release();
      }
    } catch {
      if (this.generation === generation) this.checked.add(entry.key);
    } finally {
      if (this.warming.get(entry.key) === generation) this.warming.delete(entry.key);
      this.releaseObsolete();
      this.pump();
    }
  }

  private async fetchTrack(entry: WantedTrack): Promise<void> {
    const controller = new AbortController();
    this.download = { key: entry.key, controller };
    const timer = setTimeout(() => controller.abort(new DOMException('Download timed out', 'TimeoutError')), AUDIO_POLICY.downloadTimeoutMs);
    try {
      let blob: Blob;
      let source = sourceOf(entry.track);
      try { blob = await downloadAudio(source, controller.signal); }
      catch (error) {
        if (!(error instanceof DownloadError) || !EXPIRED_STREAM_STATUSES.has(error.status)) throw error;
        const fresh = await MusicAPI.getTrackById(entry.track.id, controller.signal, { refresh: true });
        if (!fresh || cacheKeyOf(fresh) !== entry.key) throw error;
        source = sourceOf(fresh);
        blob = await downloadAudio(source, controller.signal);
      }
      if (controller.signal.aborted || this.download?.controller !== controller) return;
      // History is expendable when storage is scarce; upcoming audio wins.
      const protectedKeys = new Set([this.currentKey, ...this.wanted.map(item => item.key)]);
      const stored = await audioCache.write(entry.key, blob, protectedKeys);
      if (controller.signal.aborted || this.download?.controller !== controller) return;
      this.failures.delete(entry.key);
      if (!stored) this.storageBlocked.add(entry.key);
      if (this.keep.has(entry.key)) {
        const nearest = this.wanted.slice(0, 2).some(item => item.key === entry.key) || entry.key === this.currentKey;
        const prepared = nearest ? prepareBlob(source, blob, stored ? 'automatic' : 'memory')
          : stored && canServeCachedAudio() ? prepareCached(source, audioCacheUrl(entry.key), 'automatic') : null;
        if (prepared) { this.ready.get(entry.key)?.release(); this.ready.set(entry.key, prepared); }
      }
    } catch (error) {
      if (!controller.signal.aborted || controller.signal.reason?.name === 'TimeoutError') {
        const attempts = (this.failures.get(entry.key)?.attempts || 0) + 1;
        const delay = AUDIO_POLICY.retryDelaysMs[attempts - 1];
        const permanent = error instanceof DownloadError && error.status === 200;
        this.failures.set(entry.key, { attempts, retryAt: !permanent && delay !== undefined ? Date.now() + delay : Infinity });
      }
    } finally {
      clearTimeout(timer);
      if (this.download?.controller === controller) { this.download = null; this.pump(); }
    }
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private scheduleRetry(): void {
    const due = this.wanted.map(({ key }) => this.failures.get(key)?.retryAt ?? Infinity).filter(time => time > Date.now());
    const next = Math.min(...due);
    if (Number.isFinite(next)) this.retryTimer = setTimeout(() => { this.retryTimer = null; this.pump(); }, Math.max(1, next - Date.now()));
  }
}
