import './config.js';
import type { CuratedSectionId } from './curationConfig.js';

export type LiveSectionId = 'trending' | 'fresh_releases';
export const isLiveSection = (id: CuratedSectionId): id is LiveSectionId =>
  id === 'trending' || id === 'fresh_releases';

const boundedInt = (name: string, fallback: number, maximum: number): number => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
};

const playlistIds = (name: string, defaults: string[]): string[] => {
  const value = process.env[name];
  return value === undefined ? defaults : [...new Set(value.split(',').map(id => id.trim()).filter(Boolean))];
};

/** IDs are pinned after review. A matching playlist name alone does not establish editorial ownership. */
export const EDITORIAL_PLAYLISTS: Record<LiveSectionId, string[]> = {
  trending: playlistIds('CURATION_TRENDING_PLAYLIST_IDS', ['47599074']),
  fresh_releases: playlistIds('CURATION_FRESH_PLAYLIST_IDS', ['6689255', '1210453303'])
};

export const LIVE_CURATION_CONFIG = {
  enabled: process.env.TAVILY_CURATION_ENABLED?.toLowerCase() !== 'false',
  // A ceiling, not a paid plan: every network attempt is reserved atomically in MongoDB.
  monthlySearchLimit: boundedInt('TAVILY_MONTHLY_SEARCH_LIMIT', 800, 1000),
  requestTimeoutMs: boundedInt('TAVILY_REQUEST_TIMEOUT_MS', 20000, 60000),
  freshMaxAgeDays: boundedInt('CURATION_FRESH_MAX_AGE_DAYS', 30, 90),
  minTracksToReplace: 10,
  maxWebAdditions: 5,
  maxWebCandidates: 16,
  playlistLimit: 50,
  languages: ['hindi', 'punjabi', 'haryanvi'] as const,
  queryTopics: ['Hindi', 'Bollywood', 'Punjabi', 'Haryanvi'] as const,
  sourceDomains: (process.env.TAVILY_CURATION_DOMAINS ||
    'jiosaavn.com,rollingstoneindia.com,radioandmusic.com,indianexpress.com,hindustantimes.com,timesofindia.indiatimes.com,bollywoodhungama.com,saregama.com,yrf.com')
    .split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean)
};
