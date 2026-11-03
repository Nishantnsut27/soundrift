import type { QueueContext, Track } from '../types/types';

export const AUDIO_POLICY = {
  normal: 4,
  collection: 8,
  history: 2,
  maxEntries: 11,
  maxBytes: 320 * 1024 * 1024,
  maxTrackBytes: 24 * 1024 * 1024,
  downloadTimeoutMs: 120_000,
  retryDelaysMs: [2_000, 10_000],
} as const;

export const AUDIO_CACHE_NAME = 'soundrift-audio-v1';
export const AUDIO_CACHE_PATH = '/__soundrift-audio__/';
export const OFFLINE_CACHE_NAME = 'soundrift-offline-v1';
export const OFFLINE_CACHE_PATH = '/__soundrift-offline__/';

export function prefetchTarget(context: QueueContext): number {
  return context.kind === 'playlist' || context.kind === 'album' ? AUDIO_POLICY.collection : AUDIO_POLICY.normal;
}

export function sourceOf(track: Track): string {
  const source = track.audio || track.audiodownload;
  if (!source) return '';
  try { return new URL(source, document.baseURI).href; } catch { return ''; }
}

/** Identity follows the file quality, not a temporary/signed CDN URL. */
export function cacheKeyOf(track: Track): string {
  const source = sourceOf(track);
  if (!/^https?:/.test(source)) return '';
  const url = new URL(source);
  const quality = url.pathname.match(/_(\d{2,3})\.\w+$/)?.[1] || url.searchParams.get('format') || 'default';
  return `${track.provider || 'default'}:${track.id}:${quality}`;
}

export function audioCacheUrl(key: string): string {
  return new URL(`${AUDIO_CACHE_PATH}${encodeURIComponent(key)}`, window.location.origin).href;
}

export interface PreparedTrack {
  source: string;
  url: string;
  storage: 'automatic' | 'offline' | 'memory';
  release: () => void;
}

export function prepareBlob(source: string, blob: Blob, storage: PreparedTrack['storage']): PreparedTrack {
  const url = URL.createObjectURL(blob);
  let released = false;
  return { source, url, storage, release: () => {
    if (!released) { released = true; URL.revokeObjectURL(url); }
  } };
}

export function prepareCached(source: string, url: string, storage: PreparedTrack['storage']): PreparedTrack {
  return { source, url, storage, release: () => {} };
}
