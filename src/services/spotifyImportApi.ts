import { BACKEND_URL } from '../config/constants';
import type { Track } from '../types/types';
import { fetchJson } from './apiClient';

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

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1200);
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
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const response = await fetchJson<{ data: Job }>(jobUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) }, 0);
      signal.throwIfAborted();
      const job = response.data;
      onProgress(job.progress);
      if (job.status === 'failed') throw new Error(job.error || 'Could not import this playlist.');
      if (job.status === 'complete' && job.result) return job.result;
      await pause(signal);
    }
    throw new Error('The import took too long. Please try again.');
  } finally {
    // Also release completed results, which can contain hundreds of tracks.
    void fetchJson(jobUrl, { method: 'DELETE', signal: AbortSignal.timeout(10_000) }, 0).catch(() => {});
  }
}
