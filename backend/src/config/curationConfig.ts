export const CURATED_SECTION_IDS = ['trending', 'editors_picks', 'fresh_releases', 'kpop', 'worldwide'] as const;

export type CuratedSectionId = (typeof CURATED_SECTION_IDS)[number];

export interface CuratedSectionDefinition {
  id: CuratedSectionId;
  title: string;
  overlapGroup: string;
}

export const CURATED_SECTIONS: readonly CuratedSectionDefinition[] = [
  { id: 'trending', title: 'Trending Now', overlapGroup: 'india' },
  { id: 'editors_picks', title: "Editor's Picks", overlapGroup: 'india' },
  { id: 'fresh_releases', title: 'Fresh Releases', overlapGroup: 'india' },
  { id: 'kpop', title: 'K-Pop', overlapGroup: 'kpop' },
  { id: 'worldwide', title: 'Worldwide', overlapGroup: 'worldwide' }
];

export function isCuratedSectionId(value: string): value is CuratedSectionId {
  return (CURATED_SECTION_IDS as readonly string[]).includes(value);
}

export function getCuratedSectionDefinition(sectionId: CuratedSectionId): CuratedSectionDefinition {
  const definition = CURATED_SECTIONS.find(section => section.id === sectionId);
  if (!definition) {
    throw new Error(`Unknown curated section: ${sectionId}`);
  }
  return definition;
}

export const CURATION_SCHEDULE = {
  timezone: 'Asia/Kolkata',
  cycleStartTimes: [
    { hour: 3, minute: 0 },
    { hour: 13, minute: 15 }
  ],
  sectionIntervalMinutes: 5,
  sectionOrder: CURATED_SECTION_IDS
} as const;

export const CURATION_ENGINE_CONFIG = {
  candidateLimit: 25,
  maxStoredTracks: 25,
  initialVisibleTracks: 10,
  minTracksToReplace: 5,
  resolutionConcurrency: 4,
  providerSearchLimit: 8,
  matchConfidenceThreshold: 0.55,
  llmTemperature: 0.4,
  maxGroqAttempts: 6,
  rateLimitCooldownMs: parseInt(process.env.CURATION_KEY_COOLDOWN_MS || '90000', 10),
  authFailureCooldownMs: parseInt(process.env.CURATION_KEY_AUTH_COOLDOWN_MS || '3600000', 10),
  sectionCacheTtlMs: parseInt(process.env.CURATION_SECTION_CACHE_TTL_MS || '60000', 10),
  staleAfterMs: parseInt(process.env.CURATION_STALE_AFTER_MS || '46800000', 10),
  schedulerTickMs: 30000,
  startupBackfillDelayMs: parseInt(process.env.CURATION_STARTUP_DELAY_MS || '20000', 10),
  startupBackfillSpacingMs: parseInt(process.env.CURATION_STARTUP_SPACING_MS || '15000', 10),
  sectionRefreshLockMs: parseInt(process.env.CURATION_SECTION_REFRESH_LOCK_MS || '900000', 10)
} as const;
