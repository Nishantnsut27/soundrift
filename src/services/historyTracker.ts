import { userApi } from './userApi';
import type { Track } from '../types/types';

const MIN_RECORD_SECONDS = 5;

interface ActiveEntry {
  track: Track;
  startedAtPosition: number;
  duration: number;
}

let active: ActiveEntry | null = null;

function flush(completed: boolean, endPosition: number): void {
  if (!active) return;
  const entry = active;
  active = null;

  const max = Number.isFinite(entry.duration) && entry.duration > 0 ? entry.duration : endPosition;
  const start = Math.min(Math.max(entry.startedAtPosition, 0), max);
  const end = Math.min(Math.max(endPosition, 0), max);
  const elapsed = Math.round(Math.max(0, end - start));

  if (elapsed < MIN_RECORD_SECONDS) return;

  userApi
    .recordHistory(entry.track, elapsed, completed)
    .catch(() => console.warn('[history] Failed to record listening history'));
}

export function startHistory(track: Track, position = 0): void {
  active = {
    track,
    startedAtPosition: position,
    duration: Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0,
  };
}

export function finishHistory(endPosition: number, completed = false): void {
  flush(completed, endPosition);
}
