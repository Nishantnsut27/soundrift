import type { Track } from '../types/types';
import { useAuthStore } from '../store/authStore';
import { getLibraryOwner } from './tokenStorage';
import { OFFLINE_CACHE_NAME, prepareBlob, prepareCached, sourceOf, type PreparedTrack } from './audioPreparation';
import { canServeCachedAudio } from './cachedAudioRoute';

const CACHE_NAME = OFFLINE_CACHE_NAME;
const STORAGE_PREFIX = 'soundrift-offline-library-v1:';
const MAX_TRACK_BYTES = 24 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120000;

const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/aacp',
  'audio/ogg','application/ogg','audio/wav','audio/x-wav','audio/flac','audio/webm',
]);

export interface OfflineTrackRecord {
  track: Track;
  savedAt: number;
  size: number;
}

export interface OfflineDownloadProgress {
  loaded: number;
  total: number | null;
}

let activeOwner = '';
let activeLegacyOwner: string | null = null;
let records: OfflineTrackRecord[] = [];
let cachePromise: Promise<Cache | null> | null = null;
let migrationPromise: Promise<void> | null = null;

const DEVICE_OWNER = 'device';

function ownerId(): string {
  return DEVICE_OWNER;
}

function legacyOwnerId(): string | null {
  return useAuthStore.getState().user?.id ?? getLibraryOwner();
}

function storageKey(owner: string): string {
  return STORAGE_PREFIX + owner;
}

function requestForOwner(track: Track, owner: string): Request {
  const key = owner + ':' + (track.provider || 'default') + ':' + track.id;
  return new Request(new URL('/__soundrift-offline__/' + encodeURIComponent(key), window.location.origin).href);
}

function requestFor(track: Track): Request {
  return requestForOwner(track, activeOwner || DEVICE_OWNER);
}

function parseRecords(raw: string | null): OfflineTrackRecord[] {
  try {
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineTrackRecord =>
      !!item && typeof item === 'object'
      && typeof (item as OfflineTrackRecord).savedAt === 'number'
      && typeof (item as OfflineTrackRecord).size === 'number'
      && !!(item as OfflineTrackRecord).track
      && typeof (item as OfflineTrackRecord).track.id === 'string'
    );
  } catch {
    return [];
  }
}

function mergeRecords(base: OfflineTrackRecord[], extra: OfflineTrackRecord[]): OfflineTrackRecord[] {
  const merged = new Map<string, OfflineTrackRecord>();
  for (const record of [...base, ...extra]) {
    const key = (record.track.provider || 'default') + ':' + record.track.id;
    const previous = merged.get(key);
    if (!previous || record.savedAt > previous.savedAt) merged.set(key, record);
  }
  return [...merged.values()].sort((a, b) => b.savedAt - a.savedAt);
}

function hydrate(): void {
  const owner = ownerId();
  const legacyOwner = legacyOwnerId();

  if (owner !== activeOwner) {
    activeOwner = owner;
    records = parseRecords(localStorage.getItem(storageKey(owner)));
    activeLegacyOwner = null;
  }

  if (legacyOwner && legacyOwner !== owner && legacyOwner !== activeLegacyOwner) {
    const legacyRecords = parseRecords(localStorage.getItem(storageKey(legacyOwner)));
    if (legacyRecords.length) {
      records = mergeRecords(records, legacyRecords);
    }
    activeLegacyOwner = legacyOwner;
  }
}
function persist(): void {
  if (!activeOwner) return;
  try { localStorage.setItem(storageKey(activeOwner), JSON.stringify(records)); } catch { /* best effort */ }
}
async function migrateLegacyCache(cache: Cache): Promise<void> {
  const legacyOwner = legacyOwnerId();
  if (!legacyOwner || legacyOwner === DEVICE_OWNER) return;

  const legacyKey = storageKey(legacyOwner);
  const legacyRecords = parseRecords(localStorage.getItem(legacyKey));
  if (!legacyRecords.length) return;

  const deviceRecords = parseRecords(localStorage.getItem(storageKey(DEVICE_OWNER)));
  const mergedRecords = mergeRecords(deviceRecords, legacyRecords);

  try {
    localStorage.setItem(storageKey(DEVICE_OWNER), JSON.stringify(mergedRecords));
  } catch {
    return;
  }

  let migrationComplete = true;

  for (const record of legacyRecords) {
    const oldRequest = requestForOwner(record.track, legacyOwner);
    const newRequest = requestForOwner(record.track, DEVICE_OWNER);
    try {
      if (await cache.match(newRequest)) {
        await cache.delete(oldRequest);
        continue;
      }

      const response = await cache.match(oldRequest);
      if (!response) {
        migrationComplete = false;
        continue;
      }

      await cache.put(newRequest, response.clone());
      await cache.delete(oldRequest);
    } catch {
      migrationComplete = false;
    }
  }

  if (migrationComplete) {
    try {
      localStorage.removeItem(legacyKey);
    } catch {
      // Best effort; retaining stale metadata is safer than losing the record.
    }
    if (activeLegacyOwner === legacyOwner) activeLegacyOwner = null;
  }
}

async function openCache(): Promise<Cache | null> {
  if (!cachePromise) {
    cachePromise = typeof caches === 'undefined'
      ? Promise.resolve(null)
      : caches.open(CACHE_NAME).catch(() => null);
  }

  const cache = await cachePromise;
  if (cache) {
    migrationPromise ??= migrateLegacyCache(cache).finally(() => { migrationPromise = null; });
    await migrationPromise;
  }
  return cache;
}
function findRecord(track: Track): OfflineTrackRecord | undefined {
  hydrate();
  return records.find((record) =>
    String(record.track.id) === String(track.id)
    && (record.track.provider || 'default') === (track.provider || 'default')
  );
}
async function fetchAudio(source: string, signal: AbortSignal, onProgress?: (progress: OfflineDownloadProgress) => void): Promise<Blob> {
  const response = await fetch(source, { signal, mode: 'cors', credentials: 'omit' });
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const length = Number(response.headers.get('content-length'));
  const total = Number.isFinite(length) && length > 0 ? length : null;
  if (response.status !== 200 || !response.body || !SUPPORTED_AUDIO_TYPES.has(type)
    || (total !== null && total > MAX_TRACK_BYTES)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(response.status === 200 ? 'This audio source cannot be saved offline.' : `Audio download failed with status ${response.status}.`);
  }
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  onProgress?.({ loaded: 0, total });
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    if (loaded > MAX_TRACK_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('This track is too large to save offline.');
    }
    chunks.push(new Uint8Array(value));
    onProgress?.({ loaded, total });
  }
  if (!loaded) throw new Error('The audio source returned an empty file.');
  if (total !== null && !response.headers.get('content-encoding') && loaded !== total) throw new Error('The audio download was incomplete. Please try again.');
  return new Blob(chunks, { type });
}
export async function isOfflineSaved(track: Track): Promise<boolean> {
  const record = findRecord(track);
  if (!record) return false;
  const cache = await openCache();
  return Boolean(cache && await cache.match(requestFor(track)));
}
export async function getOfflineBlob(track: Track): Promise<Blob | null> {
  const record = findRecord(track);
  if (!record) return null;
  const cache = await openCache();
  if (!cache) return null;
  try {
    const response = await cache.match(requestFor(track));
    if (!response) {
      records = records.filter((item) => item !== record);
      persist();
      return null;
    }
    return await response.blob();
  } catch { return null; }
}
/** Local routes avoid materializing every saved song as a Blob in page memory. */
export async function getOfflinePrepared(track: Track): Promise<PreparedTrack | null> {
  try {
    if (!findRecord(track)) return null;
    const cache = await openCache();
    const request = requestFor(track);
    const response = await cache?.match(request);
    if (!response) return null;
    if (canServeCachedAudio()) return prepareCached(sourceOf(track), request.url, 'offline');
    const blob = await response.blob();
    return blob.size ? prepareBlob(sourceOf(track), blob, 'offline') : null;
  } catch { return null; }
}

export async function getOfflineTracks(): Promise<Track[]> {
  hydrate();
  const cache = await openCache();
  if (!cache) return [];
  const valid: OfflineTrackRecord[] = [];
  for (const record of records) {
    if (await cache.match(requestFor(record.track))) valid.push(record);
  }
  if (valid.length !== records.length) {
    records = valid;
    persist();
  }
  return [...valid].sort((a,b) => b.savedAt - a.savedAt).map((record) => record.track);
}
export async function getOfflineStorageStats() {
  hydrate();
  await getOfflineTracks();
  return {
    count: records.length,
    bytes: records.reduce((sum, record) => sum + record.size, 0),
    maxBytes: MAX_TRACK_BYTES * 20,
  };
}
export async function saveOfflineTrack(track: Track, onProgress?: (progress: OfflineDownloadProgress) => void): Promise<void> {
  hydrate();
  if (findRecord(track) && await isOfflineSaved(track)) return;
  const source = track.audio || track.audiodownload;
  if (!source) throw new Error('This track does not have a playable audio source.');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const cache = await openCache();
  try {
    if (!cache) throw new Error('Offline storage is unavailable in this browser.');
    const blob = await fetchAudio(source, controller.signal, onProgress);
    await cache.put(requestFor(track), new Response(blob, { headers: { 'Content-Type': blob.type } }));
    records = [
      { track, savedAt: Date.now(), size: blob.size },
      ...records.filter((item) =>
        String(item.track.id) !== String(track.id)
        || (item.track.provider || 'default') !== (track.provider || 'default')
      ),
    ];
    persist();
    window.dispatchEvent(new Event('soundrift-offline-library-changed'));
  } catch (error) {
    try { await cache?.delete(requestFor(track)); } catch { /* cleanup best effort */ }
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Offline save timed out. Please try again.');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
export async function removeOfflineTrack(track: Track): Promise<void> {
  hydrate();
  const cache = await openCache();
  try { await cache?.delete(requestFor(track)); } catch { /* best effort */ }
  records = records.filter((item) =>
    String(item.track.id) !== String(track.id)
    || (item.track.provider || 'default') !== (track.provider || 'default')
  );
  persist();
  window.dispatchEvent(new Event('soundrift-offline-library-changed'));
}
export async function clearOfflineTracks(): Promise<void> {
  hydrate();
  const cache = await openCache();
  if (cache) for (const record of records) {
    try { await cache.delete(requestFor(record.track)); } catch { /* best effort */ }
  }
  records = [];
  persist();
  window.dispatchEvent(new Event('soundrift-offline-library-changed'));
}
