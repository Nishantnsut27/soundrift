import { MusicService } from './musicService.js';
import { curatedSectionRepository, type CuratedSectionRecord } from './curatedSectionRepository.js';
import { createJsonCompletion, GroqConfigurationError, isGroqConfigured } from './groqService.js';
import { globalCacheService } from './cacheService.js';
import { Song } from '../models/music.model.js';
import { ISongSubDoc } from '../models/playlist.model.js';
import type { ICuratedSectionStats, ICuratedTrackEvidence } from '../models/curatedSection.model.js';
import { isLiveSection, LIVE_CURATION_CONFIG } from '../config/liveCurationConfig.js';
import { LiveCurationService } from './liveCurationService.js';
import {
  CURATED_SECTIONS,
  CURATION_ENGINE_CONFIG,
  getCuratedSectionDefinition,
  type CuratedSectionId
} from '../config/curationConfig.js';
import { CURATION_SYSTEM_PROMPT, buildCurationUserPrompt } from '../config/curationPrompts.js';
import { config } from '../config/config.js';
import {
  buildCandidateKey,
  extractCandidates,
  CandidateParseError,
  type SongCandidate
} from '../utils/curationCandidates.js';
import { findBestSongMatch } from '../utils/songMatcher.js';
import { logger, serializeError } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

const SCOPE = 'CurationService';
const SECTIONS_CACHE_KEY = 'curated:sections:all';

export interface CuratedSectionPayload {
  sectionId: CuratedSectionId;
  title: string;
  tracks: ISongSubDoc[];
  totalTracks: number;
  initialVisibleCount: number;
  generatedAt: string;
  updatedAt: string;
  stale: boolean;
  strategy: 'ai' | 'editorial_web';
}

export interface SectionRefreshOutcome {
  sectionId: CuratedSectionId;
  status: 'saved' | 'kept_previous' | 'skipped';
  reason?: string;
  savedTracks?: number;
}

function toStoredTrack(song: Song): ISongSubDoc {
  return {
    id: String(song.id),
    name: song.name,
    duration: typeof song.duration === 'number' && song.duration > 0 ? song.duration : 0,
    artist_name: song.artist_name || 'Unknown Artist',
    artist_id: song.artist_id || '',
    album_name: song.album_name || '',
    album_id: song.album_id || '',
    album_image: song.album_image || '',
    image: song.image || '',
    audio: song.audio || '',
    audiodownload: song.audiodownload || '',
    license_ccurl: song.license_ccurl || '',
    ...(song.musicinfo?.tags
      ? {
          musicinfo: {
            tags: {
              genres: song.musicinfo.tags.genres || [],
              instruments: song.musicinfo.tags.instruments || [],
              vartags: song.musicinfo.tags.vartags || []
            }
          }
        }
      : {}),
    provider: song.provider === 'jamendo' ? 'jamendo' : 'jiosaavn'
  };
}

const overlapKeysOf = (track: ISongSubDoc): string[] => [
  `id:${track.id}`,
  `ta:${buildCandidateKey(track.name || '', track.artist_name || '')}`,
];

/**
 * Sibling sections are deduplicated at generation time, but a sibling that refreshes while another
 * is mid-generation compares against stale tracks. Re-checking here keeps each song in one row,
 * with the same exception generation makes: a row short of unique songs keeps overlaps up to the
 * visible threshold rather than shrinking or disappearing.
 */
function dedupeAcrossOverlapGroups(records: CuratedSectionRecord[]): CuratedSectionRecord[] {
  const order = new Map(CURATED_SECTIONS.map((definition, index) => [definition.id, index]));
  const seenByGroup = new Map<string, Set<string>>();

  return [...records]
    .sort((a, b) => (order.get(a.sectionId) ?? 0) - (order.get(b.sectionId) ?? 0))
    .map(record => {
      const group = getCuratedSectionDefinition(record.sectionId).overlapGroup;
      const seen = seenByGroup.get(group) ?? new Set<string>();
      seenByGroup.set(group, seen);

      const overlaps = record.tracks.map(track => overlapKeysOf(track).some(key => seen.has(key)));
      const uniqueCount = overlaps.filter(isOverlap => !isOverlap).length;
      let refillAllowance = Math.max(0, CURATION_ENGINE_CONFIG.initialVisibleTracks - uniqueCount);

      const tracks = record.tracks.filter((_, index) => {
        if (!overlaps[index]) return true;
        if (refillAllowance === 0) return false;
        refillAllowance--;
        return true;
      });
      tracks.forEach(track => overlapKeysOf(track).forEach(key => seen.add(key)));

      return tracks.length === record.tracks.length ? record : { ...record, tracks };
    });
}

function toPayload(record: CuratedSectionRecord): CuratedSectionPayload {
  return {
    sectionId: record.sectionId,
    title: record.title,
    tracks: record.tracks,
    totalTracks: record.tracks.length,
    initialVisibleCount: CURATION_ENGINE_CONFIG.initialVisibleTracks,
    generatedAt: new Date(record.generatedAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
    stale: Date.now() - new Date(record.generatedAt).getTime() > 36 * 60 * 60 * 1000,
    strategy: record.strategy
  };
}

export class CurationService {
  private readonly musicService: MusicService;

  constructor(musicService: MusicService = new MusicService(), private readonly liveCuration: Pick<LiveCurationService, 'generate'> = new LiveCurationService()) {
    this.musicService = musicService;
  }

  async getAllSections(): Promise<CuratedSectionPayload[]> {
    return globalCacheService.getOrFetch(
      SECTIONS_CACHE_KEY,
      async () => {
        const records = await curatedSectionRepository.findAll();
        return dedupeAcrossOverlapGroups(records)
          .filter(record => record.tracks.length > 0)
          .map(toPayload);
      },
      CURATION_ENGINE_CONFIG.sectionCacheTtlMs
    );
  }

  async getSection(sectionId: CuratedSectionId): Promise<CuratedSectionPayload | null> {
    const record = await curatedSectionRepository.findBySectionId(sectionId);
    if (!record || record.tracks.length === 0) return null;
    return toPayload(record);
  }

  /**
   * `notBefore` lets a scheduled run skip work another instance (or an earlier retry) already did:
   * if the stored section was generated at or after it, the refresh is a no-op.
   */
  async refreshSection(sectionId: CuratedSectionId, options: { notBefore?: Date } = {}): Promise<SectionRefreshOutcome> {
    const definition = getCuratedSectionDefinition(sectionId);
    const startedAt = Date.now();

    logger.info(SCOPE, 'Section generation started', { sectionId, title: definition.title });

    if (!isLiveSection(sectionId) && !isGroqConfigured()) {
      logger.warn(SCOPE, 'Section generation skipped: no Groq keys configured', { sectionId });
      return { sectionId, status: 'skipped', reason: 'groq_not_configured' };
    }

    const lockOwner = randomUUID();
    const ownsRefreshLock = await curatedSectionRepository.acquireRefreshLock(
      sectionId,
      lockOwner,
      CURATION_ENGINE_CONFIG.sectionRefreshLockMs
    );

    if (!ownsRefreshLock) {
      logger.info(SCOPE, 'Section generation skipped: refresh already in progress', { sectionId });
      return { sectionId, status: 'skipped', reason: 'refresh_in_progress' };
    }

    let refreshLockLost = false;
    const renewRefreshLock = async (): Promise<boolean> => {
      try {
        const renewed = await curatedSectionRepository.renewRefreshLock(
          sectionId,
          lockOwner,
          CURATION_ENGINE_CONFIG.sectionRefreshLockMs
        );
        refreshLockLost ||= !renewed;
        return renewed;
      } catch (error) {
        refreshLockLost = true;
        logger.warn(SCOPE, 'Failed to renew section refresh lock', {
          sectionId,
          error: serializeError(error)
        });
        return false;
      }
    };
    const refreshLockRenewal = setInterval(() => {
      void renewRefreshLock();
    }, Math.max(1_000, Math.floor(CURATION_ENGINE_CONFIG.sectionRefreshLockMs / 2)));
    refreshLockRenewal.unref?.();

    try {
      const existing = await curatedSectionRepository.findBySectionId(sectionId);
      if (options.notBefore) {
        if (existing && existing.tracks.length > 0 && new Date(existing.generatedAt) >= options.notBefore) {
          logger.info(SCOPE, 'Section generation skipped: already refreshed for this slot', { sectionId });
          return { sectionId, status: 'skipped', reason: 'already_fresh' };
        }
      }

      const generation = await this.generateSection(sectionId);
      const required = isLiveSection(sectionId) ? LIVE_CURATION_CONFIG.minTracksToReplace : CURATION_ENGINE_CONFIG.minTracksToReplace;
      if (generation.tracks.length < required) {
        logger.warn(SCOPE, 'Too few resolved tracks, keeping previous data', {
          sectionId,
          resolved: generation.tracks.length,
          required
        });
        return { sectionId, status: 'kept_previous', reason: 'insufficient_resolved_tracks' };
      }

      if (refreshLockLost || !(await renewRefreshLock())) {
        logger.warn(SCOPE, 'Section generation abandoned: refresh lock ownership was lost', { sectionId });
        return { sectionId, status: 'kept_previous', reason: 'refresh_lock_lost' };
      }

      await curatedSectionRepository.replaceSection({
        sectionId,
        title: definition.title,
        ...generation,
        tracks: generation.tracks.slice(0, CURATION_ENGINE_CONFIG.maxStoredTracks),
        expectedRefreshCount: existing?.refreshCount ?? null
      });

      this.invalidateReadCache();

      logger.info(SCOPE, 'Section generation completed', {
        sectionId,
        savedTracks: Math.min(generation.tracks.length, CURATION_ENGINE_CONFIG.maxStoredTracks),
        unresolved: generation.stats.unresolvedCount,
        duplicateTracksRemoved: generation.stats.duplicateTracksRemoved,
        durationMs: Date.now() - startedAt
      });

      return {
        sectionId,
        status: 'saved',
        savedTracks: Math.min(generation.tracks.length, CURATION_ENGINE_CONFIG.maxStoredTracks)
      };
    } catch (error) {
      const reason =
        error instanceof CandidateParseError
          ? 'invalid_llm_response'
          : error instanceof GroqConfigurationError
            ? 'groq_not_configured'
            : 'generation_failed';

      logger.error(SCOPE, 'Section generation failed, keeping previous data', {
        sectionId,
        reason,
        durationMs: Date.now() - startedAt,
        error: serializeError(error)
      });

      return { sectionId, status: 'kept_previous', reason };
    } finally {
      clearInterval(refreshLockRenewal);
      await curatedSectionRepository.releaseRefreshLock(sectionId, lockOwner).catch(error => {
        logger.warn(SCOPE, 'Failed to release section refresh lock', {
          sectionId,
          error: serializeError(error)
        });
      });
    }
  }

  private async generateSection(sectionId: CuratedSectionId): Promise<{
    tracks: ISongSubDoc[];
    stats: ICuratedSectionStats;
    llmModel: string;
    strategy: 'ai' | 'editorial_web';
    webStatus: string;
    provenance: ICuratedTrackEvidence[];
  }> {
    if (isLiveSection(sectionId)) {
      const result = await this.liveCuration.generate(sectionId);
      return { ...result, tracks: result.tracks.map(toStoredTrack), strategy: 'editorial_web' };
    }
    const completion = await createJsonCompletion({
      systemPrompt: CURATION_SYSTEM_PROMPT,
      userPrompt: buildCurationUserPrompt(sectionId), label: sectionId
    });
    const extraction = extractCandidates(completion.content, CURATION_ENGINE_CONFIG.candidateLimit);
    const crossSectionKeys = await curatedSectionRepository.getTrackKeysForOverlapGroup(
      getCuratedSectionDefinition(sectionId).overlapGroup, sectionId
    );
    const result = await this.resolveCandidates(sectionId, extraction.candidates, crossSectionKeys);
    return {
      tracks: result.tracks, llmModel: completion.model, strategy: 'ai', webStatus: 'disabled', provenance: [],
      stats: {
        rawCandidateCount: extraction.rawCount, validCandidateCount: extraction.candidates.length,
        duplicateCandidatesRemoved: extraction.duplicateCount, resolvedCount: result.tracks.length,
        unresolvedCount: result.unresolvedCount, duplicateTracksRemoved: result.duplicateTracksRemoved
      }
    };
  }

  private async resolveCandidates(
    sectionId: CuratedSectionId,
    candidates: SongCandidate[],
    crossSectionKeys: { providerIds: Set<string>; titleArtistKeys: Set<string> }
  ): Promise<{ tracks: ISongSubDoc[]; unresolvedCount: number; duplicateTracksRemoved: number }> {
    const resolved: Array<{ index: number; song: Song }> = [];
    let unresolvedCount = 0;

    const queue = [...candidates.entries()];
    const workerCount = Math.min(CURATION_ENGINE_CONFIG.resolutionConcurrency, queue.length);

    const worker = async (): Promise<void> => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const [index, candidate] = next;

        try {
          const query = `${candidate.title} ${candidate.artist}`.trim();
          const { songs } = await this.musicService.search(query, CURATION_ENGINE_CONFIG.providerSearchLimit);
          // Jamendo only appears when JioSaavn failed; its catalogue is indie tracks that merely share a title.
          const catalogueSongs = songs.filter(song => song.provider === 'jiosaavn');

          const match = findBestSongMatch(
            candidate.title,
            candidate.artist,
            catalogueSongs,
            CURATION_ENGINE_CONFIG.matchConfidenceThreshold,
            CURATION_ENGINE_CONFIG.minArtistSimilarity
          );

          if (!match) {
            unresolvedCount++;
            logger.debug(SCOPE, 'Candidate could not be resolved to a provider track', {
              sectionId,
              candidateIndex: index,
              providerResults: catalogueSongs.length
            });
            continue;
          }

          resolved.push({ index, song: match.song });
        } catch (error) {
          unresolvedCount++;
          logger.warn(SCOPE, 'Provider lookup failed for candidate', {
            sectionId,
            candidateIndex: index,
            error: serializeError(error)
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.max(workerCount, 1) }, () => worker()));

    resolved.sort((a, b) => a.index - b.index);

    const seenProviderIds = new Set<string>();
    const seenTitleArtistKeys = new Set<string>();
    const tracks: ISongSubDoc[] = [];
    const crossSectionSkipped: ISongSubDoc[] = [];
    let duplicateTracksRemoved = 0;

    for (const { song } of resolved) {
      if (!song.id || !song.name || !song.audio) {
        unresolvedCount++;
        continue;
      }

      const providerId = String(song.id);
      const titleArtistKey = buildCandidateKey(song.name, song.artist_name || '');

      if (seenProviderIds.has(providerId) || seenTitleArtistKeys.has(titleArtistKey)) {
        duplicateTracksRemoved++;
        continue;
      }

      seenProviderIds.add(providerId);
      seenTitleArtistKeys.add(titleArtistKey);

      const stored = toStoredTrack(song);

      if (crossSectionKeys.providerIds.has(providerId) || crossSectionKeys.titleArtistKeys.has(titleArtistKey)) {
        crossSectionSkipped.push(stored);
        continue;
      }

      tracks.push(stored);
    }

    let crossSectionRefilled = 0;

    if (tracks.length < CURATION_ENGINE_CONFIG.initialVisibleTracks && crossSectionSkipped.length > 0) {
      const needed = CURATION_ENGINE_CONFIG.initialVisibleTracks - tracks.length;
      const refilled = crossSectionSkipped.slice(0, needed);
      tracks.push(...refilled);
      crossSectionRefilled = refilled.length;

      logger.info(SCOPE, 'Re-added cross-section overlaps to reach the visible threshold', {
        sectionId,
        readded: crossSectionRefilled
      });
    }

    logger.info(SCOPE, 'Candidate resolution finished', {
      sectionId,
      candidates: candidates.length,
      providerMatches: resolved.length,
      unresolved: unresolvedCount,
      duplicateTracksRemoved,
      crossSectionOverlaps: crossSectionSkipped.length,
      crossSectionRemoved: crossSectionSkipped.length - crossSectionRefilled,
      finalTracks: tracks.length
    });

    return { tracks, unresolvedCount, duplicateTracksRemoved };
  }

  invalidateReadCache(): void {
    globalCacheService.delete(SECTIONS_CACHE_KEY);
  }

  describeConfiguration(): { configuredKeys: number; model: string; sectionCount: number } {
    return {
      configuredKeys: config.groqApiKeys.length,
      model: config.groqModel,
      sectionCount: CURATED_SECTIONS.length
    };
  }
}

export const curationService = new CurationService();
