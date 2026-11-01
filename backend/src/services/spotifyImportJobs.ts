import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { parseSpotifyLink } from '../providers/spotifyPlaylistProvider.js';
import { SpotifyImportService, type ImportProgress, type SpotifyImportResult } from './spotifyImportService.js';

interface ImportJob {
  id: string;
  owner: string;
  status: 'running' | 'complete' | 'failed';
  progress: ImportProgress;
  result?: SpotifyImportResult;
  error?: string;
  expires: number;
  controller: AbortController;
}

// Preparation only: all playlist writes still go through the existing JSON import pipeline.
export class SpotifyImportJobs {
  private jobs = new Map<string, ImportJob>();

  constructor(private service = new SpotifyImportService()) {}

  private cleanup() {
    for (const [id, job] of this.jobs) {
      if (job.expires <= Date.now()) { job.controller.abort(); this.jobs.delete(id); }
    }
  }

  start(owner: string, link: unknown): { id: string } {
    parseSpotifyLink(link);
    this.cleanup();
    const active = [...this.jobs.values()].filter(job => job.status === 'running');
    if (active.some(job => job.owner === owner)) throw new AppError('A Spotify import is already running. Wait for it to finish or cancel it first.', 409);
    if (active.length >= 4) throw new AppError('Playlist importing is busy. Please try again in a few minutes.', 503);
    // Keep memory bounded, including completed results abandoned by a browser.
    if (this.jobs.size >= 40) {
      const oldest = [...this.jobs.values()].find(job => job.status !== 'running');
      if (oldest) this.jobs.delete(oldest.id);
    }
    const job: ImportJob = { id: randomUUID(), owner, status: 'running', progress: { phase: 'retrieving', processed: 0, total: 0 },
      expires: Date.now() + 15 * 60_000, controller: new AbortController() };
    this.jobs.set(job.id, job);
    const timer = setTimeout(() => job.controller.abort(new Error('Import timed out')), 10 * 60_000);
    timer.unref();
    void this.service.prepare(link as string, job.controller.signal, progress => { job.progress = progress; })
      .then(result => {
        job.controller.signal.throwIfAborted();
        job.result = result;
        job.status = 'complete';
      })
      .catch(error => {
        job.status = 'failed';
        job.error = job.controller.signal.aborted ? 'The import timed out or was cancelled. Please try again.'
          : error instanceof AppError ? error.message : 'The playlist could not be imported. Please try again later.';
      })
      .finally(() => clearTimeout(timer));
    return { id: job.id };
  }

  private owned(owner: string, id: string): ImportJob {
    this.cleanup();
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner) throw new AppError('This import expired or could not be found. Please start again.', 404);
    return job;
  }

  get(owner: string, id: string) {
    const job = this.owned(owner, id);
    return { id: job.id, status: job.status, progress: job.progress, result: job.result, error: job.error };
  }

  cancel(owner: string, id: string): void {
    const job = this.owned(owner, id);
    job.controller.abort();
    this.jobs.delete(id);
  }
}
