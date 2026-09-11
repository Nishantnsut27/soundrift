import { useSyncExternalStore } from 'react';
import { MusicAPI } from '../services/musicApi';
import type { CuratedSection } from '../types/types';

/**
 * Shared access to the backend's curated sections.
 *
 * `MusicAPI.getCuratedSections()` returns every section in a single response and
 * does no caching of its own, so the fetch lives here instead of inside a
 * component: Home renders several sections from the same payload, and each one
 * mounting its own effect would fire the same request several times over. The
 * cache is module-level and the refresh timer runs only while something is
 * subscribed.
 *
 * Section ids come from the backend (`trending`, `editors_picks`,
 * `fresh_releases`, `kpop`, `worldwide`); callers look sections up by id and
 * render whatever is present, so adding or removing one server-side needs no
 * frontend change.
 */

const REFRESH_INTERVAL_MS = 60_000;

export interface CuratedSectionsState {
  sections: CuratedSection[];
  isLoading: boolean;
  /** Set only when the payload could not be loaded at all. */
  error: string | null;
}

let state: CuratedSectionsState = { sections: [], isLoading: true, error: null };
let inFlight: Promise<void> | null = null;
let lastLoadedAt = 0;
let refreshTimer: number | null = null;
const listeners = new Set<() => void>();

function publish(next: CuratedSectionsState): void {
  state = next;
  for (const listener of listeners) listener();
}

function load(): Promise<void> {
  // Coalesce: a second subscriber mounting mid-flight joins the same request.
  if (inFlight) return inFlight;

  inFlight = MusicAPI.getCuratedSections()
    .then((sections) => {
      lastLoadedAt = Date.now();
      publish({ sections, isLoading: false, error: null });
    })
    .catch((error: unknown) => {
      // Keep whatever was already on screen — a failed background refresh must
      // not blank out sections the user is looking at.
      publish({
        sections: state.sections,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not load curated music right now.',
      });
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (Date.now() - lastLoadedAt > REFRESH_INTERVAL_MS) void load();
  if (refreshTimer === null) {
    refreshTimer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
}

function getSnapshot(): CuratedSectionsState {
  return state;
}

export function useCuratedSections(): CuratedSectionsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Looks up one backend section by id. Returns null when it is absent or empty. */
export function findCuratedSection(
  sections: CuratedSection[],
  sectionId: string,
): CuratedSection | null {
  const match = sections.find((section) => section.sectionId === sectionId);
  return match && match.tracks.length > 0 ? match : null;
}
