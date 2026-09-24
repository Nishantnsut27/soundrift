import type { Track } from '../types/types';

const MAX_TRACK_BYTES = 24 * 1024 * 1024;
const PREFETCH_TIMEOUT_MS = 90000;
const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/aacp',
  'audio/ogg', 'application/ogg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/webm',
]);

export interface PreparedTrack {
  source: string;
  url: string;
  release: () => void;
}

function sourceOf(track: Track): string {
  const source = track.audio || track.audiodownload;
  if (!source) return '';
  try { return new URL(source, document.baseURI).href; } catch { return ''; }
}

function keyOf(track: Track): string {
  return `${track.provider || ''}:${track.id}:${sourceOf(track)}`;
}

/** One complete upcoming file. Nothing is stored on disk or played on a second element. */
export class NextTrackBuffer {
  private targetKey = '';
  private controller: AbortController | null = null;
  private prepared: PreparedTrack | null = null;

  private readonly maxBytes: number;

  constructor(maxBytes = MAX_TRACK_BYTES) { this.maxBytes = maxBytes; }

  retryFailed() {
    if (!this.controller && !this.prepared) this.targetKey = '';
  }

  suspend() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = null;
    this.targetKey = '';
  }

  clear() {
    this.targetKey = '';
    this.controller?.abort();
    this.controller = null;
    this.prepared?.release();
    this.prepared = null;
  }

  /** Drop obsolete work even when current playback is not ready to start a fetch. */
  retain(track: Track | null) {
    if (!track || this.targetKey !== keyOf(track)) this.clear();
  }

  async prepare(track: Track): Promise<void> {
    const key = keyOf(track);
    if (this.targetKey === key) return;
    this.clear();
    this.targetKey = key;
    const source = sourceOf(track);
    if (!/^https?:/.test(source)) return;
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);
    try {
      // Direct CDN fetch: no API auth headers or cookies. CORS refusal simply
      // falls back to the existing HTMLAudioElement streaming path.
      const response = await fetch(source, { signal: controller.signal, mode: 'cors', credentials: 'omit' });
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const length = Number(response.headers.get('content-length'));
      if (response.status !== 200 || !response.body || response.headers.has('content-range')
        || !SUPPORTED_AUDIO_TYPES.has(mime) || length > this.maxBytes) {
        await response.body?.cancel();
        return;
      }
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > this.maxBytes || controller.signal.aborted) {
          await reader.cancel();
          return;
        }
        chunks.push(new Uint8Array(value));
      }
      if (!size || controller.signal.aborted || this.controller !== controller || this.targetKey !== key) return;
      const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
      let released = false;
      this.prepared = { source, url, release: () => {
        if (!released) { released = true; URL.revokeObjectURL(url); }
      } };
    } catch {
      // Prefetch must never change the selected track, show a playback error,
      // or block the normal stream. A failed target is not fetched repeatedly.
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
    }
  }

  /** Transfer ownership to the player. Only a fully downloaded file is usable. */
  take(track: Track): PreparedTrack | null {
    const prepared = this.targetKey === keyOf(track) ? this.prepared : null;
    if (prepared) this.prepared = null;
    this.clear();
    return prepared;
  }
}
