import { BACKEND_URL } from '../config/constants';
import type { Track } from '../types/types';
import { ApiError, fetchJson } from './apiClient';

export interface SpotifyImportProgress {
  phase: 'retrieving' | 'matching';
  processed: number;
  total: number;
}

export interface SpotifyImportResult {
  playlist: { name: string; tracks: Track[] };
  total: number;
  duplicates: number;
  missing: { title: string; artist: string; reason: 'unavailable' | 'not_found' | 'search_failed' }[];
}

interface Job {
  status: 'running' | 'complete' | 'failed';
  progress: SpotifyImportProgress;
  result?: SpotifyImportResult;
  error?: string;
}
const BASE = `${BACKEND_URL}/api/user/playlist-imports/spotify`;

function pause(signal: AbortSignal, delay = 1200): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function prepareSpotifyImport(
  url: string, signal: AbortSignal, onProgress: (progress: SpotifyImportProgress) => void,
): Promise<SpotifyImportResult> {
  signal.throwIfAborted();
  // Let the short start request finish so cancellation can clean up its job id.
  const start = await fetchJson<{ data: { id: string } }>(BASE, {
    method: 'POST', body: JSON.stringify({ url }), signal: AbortSignal.timeout(20_000),
  });
  const jobUrl = `${BASE}/${encodeURIComponent(start.data.id)}`;
  try {
    const deadline = Date.now() + 11 * 60_000;
    let failures = 0;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(20_000, deadline - Date.now())))]);
      let response: { data: Job };
      try {
        // Retry here so every attempt has a fresh timeout and shares the overall deadline.
        response = await fetchJson<{ data: Job }>(jobUrl, { signal: requestSignal }, 0);
        requestSignal.throwIfAborted();
      } catch (error) {
        signal.throwIfAborted();
        const temporary = requestSignal.aborted || (error instanceof ApiError &&
          (error.status === 0 || error.status === 408 || error.status === 429 || (error.status >= 500 && error.status < 600)));
        if (!temporary) throw error;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await pause(signal, Math.min(1200 * 2 ** Math.min(failures++, 4), 10_000, remaining));
        continue;
      }
      signal.throwIfAborted();
      failures = 0;
      const job = response.data;
      onProgress(job.progress);
      if (job.status === 'failed') throw new Error(job.error || 'Could not import this playlist.');
      if (job.status === 'complete' && job.result) return job.result;
      await pause(signal, Math.max(0, Math.min(1200, deadline - Date.now())));
    }
    throw new Error('The import took too long. Please try again.');
  } finally {
    // Also release completed results, which can contain hundreds of tracks.
    void fetchJson(jobUrl, { method: 'DELETE', signal: AbortSignal.timeout(10_000) }, 0).catch(() => {});
  }
}
