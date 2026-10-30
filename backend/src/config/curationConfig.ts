import './config.js';

export const CURATED_SECTION_IDS = [
  'trending',
  'editors_picks',
  'fresh_releases',
  'kpop',
  'worldwide',
  'old_hindi_gold',
  'monsoon',
  'late_night',
  'morning_commute',
  'nineties_bollywood'
] as const;

export type CuratedSectionId = (typeof CURATED_SECTION_IDS)[number];

export interface CuratedSectionDefinition {
  id: CuratedSectionId;
  title: string;
  overlapGroup: string;
}

/**
 * Sections sharing an `overlapGroup` are deduplicated against each other, so a
 * track can only surface in one of them. The themed rows are split into two
 * groups rather than one: the era rows genuinely compete for the same songs, as
 * do the time-of-day rows, but a monsoon song and a 90s song overlapping is
 * fine and forcing them apart would only thin both rows out.
 */
export const CURATED_SECTIONS: readonly CuratedSectionDefinition[] = [
  { id: 'trending', title: 'Trending Now', overlapGroup: 'trending' },
  { id: 'editors_picks', title: "Editor's Picks", overlapGroup: 'india' },
  { id: 'fresh_releases', title: 'Fresh Releases', overlapGroup: 'fresh_releases' },
  { id: 'kpop', title: 'K-Pop', overlapGroup: 'kpop' },
  { id: 'worldwide', title: 'Worldwide', overlapGroup: 'worldwide' },
  { id: 'old_hindi_gold', title: 'Golden Era Hindi', overlapGroup: 'hindi_era' },
  { id: 'nineties_bollywood', title: '90s Bollywood', overlapGroup: 'hindi_era' },
  { id: 'monsoon', title: 'Monsoon Songs', overlapGroup: 'mood' },
  { id: 'late_night', title: 'After Midnight', overlapGroup: 'mood' },
  { id: 'morning_commute', title: 'Morning Drive', overlapGroup: 'mood' }
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

export interface CycleStartTime {
  hour: number;
  minute: number;
}

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_CYCLE_START_TIMES: CycleStartTime[] = [
  { hour: 3, minute: 0 }
];

/** Non-numeric or non-positive values fall back instead of becoming NaN timers and dates. */
function readPositiveInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readFraction(name: string, fallback: number): number {
  const parsed = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : fallback;
}

function readTimezone(name: string, fallback: string): string {
  const value = (process.env[name] ?? '').trim();
  if (!value) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return fallback;
  }
}

/** Parses "03:00,13:15" style lists. */
function readCycleStartTimes(name: string, fallback: CycleStartTime[]): CycleStartTime[] {
  const raw = process.env[name];
  if (!raw) return fallback;

  const times = raw
    .split(',')
    .map(entry => /^\s*(\d{1,2}):(\d{2})\s*$/.exec(entry))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => ({ hour: Number(match[1]), minute: Number(match[2]) }))
    .filter(time => time.hour < 24 && time.minute < 60);

  return times.length > 0 ? times : fallback;
}

export const CURATION_SCHEDULE: {
  timezone: string;
  cycleStartTimes: readonly CycleStartTime[];
  sectionIntervalMinutes: number;
  sectionOrder: readonly CuratedSectionId[];
} = {
  timezone: readTimezone('CURATION_TIMEZONE', DEFAULT_TIMEZONE),
  cycleStartTimes: readCycleStartTimes('CURATION_CYCLE_TIMES', DEFAULT_CYCLE_START_TIMES),
  sectionIntervalMinutes: readPositiveInt('CURATION_SECTION_INTERVAL_MINUTES', 5),
  sectionOrder: CURATED_SECTION_IDS
};

export const CURATION_ENGINE_CONFIG = {
  candidateLimit: 25,
  maxStoredTracks: 25,
  initialVisibleTracks: 10,
  minTracksToReplace: 5,
  resolutionConcurrency: 4,
  providerSearchLimit: 8,
  matchConfidenceThreshold: readFraction('CURATION_MATCH_THRESHOLD', 0.55),
  /** A title-only match must not pass: the artist has to resemble the suggestion too. */
  minArtistSimilarity: 0.5,
  llmTemperature: 0.4,
  maxGroqAttempts: 6,
  rateLimitCooldownMs: readPositiveInt('CURATION_KEY_COOLDOWN_MS', 90000),
  maxRateLimitCooldownMs: 6 * 60 * 60 * 1000,
  authFailureCooldownMs: readPositiveInt('CURATION_KEY_AUTH_COOLDOWN_MS', 3600000),
  sectionCacheTtlMs: readPositiveInt('CURATION_SECTION_CACHE_TTL_MS', 60000),
  schedulerTickMs: 30000,
  startupBackfillDelayMs: readPositiveInt('CURATION_STARTUP_DELAY_MS', 20000),
  startupBackfillSpacingMs: readPositiveInt('CURATION_STARTUP_SPACING_MS', 15000),
  failedRefreshRetryMs: readPositiveInt('CURATION_RETRY_AFTER_FAILURE_MS', 30 * 60 * 1000),
  maxRefreshAttemptsPerSlot: 3,
  sectionRefreshLockMs: readPositiveInt('CURATION_SECTION_REFRESH_LOCK_MS', 900000)
} as const;
