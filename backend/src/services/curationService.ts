import { MusicService } from './musicService.js';
import { curatedSectionRepository, type CuratedSectionRecord } from './curatedSectionRepository.js';
import { createJsonCompletion, GroqConfigurationError, isGroqConfigured } from './groqService.js';
import { globalCacheService } from './cacheService.js';
import { Song } from '../models/music.model.js';
import { ISongSubDoc } from '../models/playlist.model.js';
import type { ICuratedSectionStats } from '../models/curatedSection.model.js';
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

function toPayload(record: CuratedSectionRecord): CuratedSectionPayload {
  return {
    sectionId: record.sectionId,
    title: record.title,
    tracks: record.tracks,
    totalTracks: record.tracks.length,
    initialVisibleCount: CURATION_ENGINE_CONFIG.initialVisibleTracks,
    generatedAt: new Date(record.generatedAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString()
  };
}

export class CurationService {
  private readonly musicService: MusicService;

  constructor(musicService: MusicService = new MusicService()) {
    this.musicService = musicService;
  }

  async getAllSections(): Promise<CuratedSectionPayload[]> {
    return globalCacheService.getOrFetch(
      SECTIONS_CACHE_KEY,
      async () => {
        const records = await curatedSectionRepository.findAll();
        return records.filter(record => record.tracks.length > 0).map(toPayload);
      },
      CURATION_ENGINE_CONFIG.sectionCacheTtlMs
    );
  }

  async getSection(sectionId: CuratedSectionId): Promise<CuratedSectionPayload | null> {
    const record = await curatedSectionRepository.findBySectionId(sectionId);
    if (!record || record.tracks.length === 0) return null;
    return toPayload(record);
  }

  async refreshSection(sectionId: CuratedSectionId): Promise<SectionRefreshOutcome> {
    const definition = getCuratedSectionDefinition(sectionId);
    const startedAt = Date.now();

    logger.info(SCOPE, 'Section generation started', { sectionId, title: definition.title });

    if (!isGroqConfigured()) {
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
      const completion = await createJsonCompletion({
        systemPrompt: CURATION_SYSTEM_PROMPT,
        userPrompt: buildCurationUserPrompt(sectionId),
        label: sectionId
      });

      const extraction = extractCandidates(completion.content, CURATION_ENGINE_CONFIG.candidateLimit);

      logger.info(SCOPE, 'Candidates extracted', {
        sectionId,
        keyIndex: completion.keyIndex,
        rawCandidates: extraction.rawCount,
        validCandidates: extraction.candidates.length,
        invalidSkipped: extraction.invalidCount,
        duplicatesRemoved: extraction.duplicateCount
      });

      if (extraction.candidates.length === 0) {
        logger.warn(SCOPE, 'No valid candidates in LLM response, keeping previous data', { sectionId });
        return { sectionId, status: 'kept_previous', reason: 'no_valid_candidates' };
      }

      const crossSectionKeys = await curatedSectionRepository.getTrackKeysForOverlapGroup(
        definition.overlapGroup,
        sectionId
      );

      const resolution = await this.resolveCandidates(sectionId, extraction.candidates, crossSectionKeys);

      if (resolution.tracks.length < CURATION_ENGINE_CONFIG.minTracksToReplace) {
        logger.warn(SCOPE, 'Too few resolved tracks, keeping previous data', {
          sectionId,
          resolved: resolution.tracks.length,
          required: CURATION_ENGINE_CONFIG.minTracksToReplace
        });
        return { sectionId, status: 'kept_previous', reason: 'insufficient_resolved_tracks' };
      }

      const stats: ICuratedSectionStats = {
        rawCandidateCount: extraction.rawCount,
        validCandidateCount: extraction.candidates.length,
        duplicateCandidatesRemoved: extraction.duplicateCount,
        resolvedCount: resolution.tracks.length,
        unresolvedCount: resolution.unresolvedCount,
        duplicateTracksRemoved: resolution.duplicateTracksRemoved
      };

      if (refreshLockLost || !(await renewRefreshLock())) {
        logger.warn(SCOPE, 'Section generation abandoned: refresh lock ownership was lost', { sectionId });
        return { sectionId, status: 'kept_previous', reason: 'refresh_lock_lost' };
      }

      await curatedSectionRepository.replaceSection({
        sectionId,
        title: definition.title,
        tracks: resolution.tracks.slice(0, CURATION_ENGINE_CONFIG.maxStoredTracks),
        llmModel: completion.model,
        stats
      });

      this.invalidateReadCache();

      logger.info(SCOPE, 'Section generation completed', {
        sectionId,
        savedTracks: Math.min(resolution.tracks.length, CURATION_ENGINE_CONFIG.maxStoredTracks),
        unresolved: resolution.unresolvedCount,
        duplicateTracksRemoved: resolution.duplicateTracksRemoved,
        durationMs: Date.now() - startedAt
      });

      return {
        sectionId,
        status: 'saved',
        savedTracks: Math.min(resolution.tracks.length, CURATION_ENGINE_CONFIG.maxStoredTracks)
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

          const match = findBestSongMatch(
            candidate.title,
            candidate.artist,
            songs,
            CURATION_ENGINE_CONFIG.matchConfidenceThreshold
          );

          if (!match) {
            unresolvedCount++;
            logger.debug(SCOPE, 'Candidate could not be resolved to a provider track', {
              sectionId,
              candidateIndex: index,
              providerResults: songs.length
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

  async refreshAllSections(): Promise<SectionRefreshOutcome[]> {
    const outcomes: SectionRefreshOutcome[] = [];

    for (const definition of CURATED_SECTIONS) {
      outcomes.push(await this.refreshSection(definition.id));
    }

    return outcomes;
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
