import { EDITORIAL_PLAYLISTS, LIVE_CURATION_CONFIG, type LiveSectionId } from '../config/liveCurationConfig.js';
import { CURATION_ENGINE_CONFIG } from '../config/curationConfig.js';
import type { Song } from '../models/music.model.js';
import type { ICuratedSectionStats, ICuratedTrackEvidence } from '../models/curatedSection.model.js';
import { JioSaavnProvider } from '../providers/jiosaavnProvider.js';
import { WebCurationService, type WebDiscovery } from './webCurationService.js';
import { indiaDate } from './tavilyService.js';
import { validDate } from '../utils/liveCurationCandidates.js';
import { findStrictSongMatch } from '../utils/songMatcher.js';
import { buildCandidateKey } from '../utils/curationCandidates.js';
import { logger } from '../utils/logger.js';

export interface LiveCurationResult {
  tracks: Song[];
  provenance: ICuratedTrackEvidence[];
  stats: ICuratedSectionStats;
  llmModel: string;
  webStatus: WebDiscovery['status'];
}

const languageOf = (value = ''): string => {
  const name = value.toLowerCase().trim();
  return ({ hariyanvi: 'haryanvi', haryanavi: 'haryanvi', haryanawi: 'haryanvi', bollywood: 'hindi' } as Record<string, string>)[name] || name;
};

export function eligibleLiveTrack(song: Song, section: LiveSectionId, today: string): boolean {
  if (!song || song.provider !== 'jiosaavn' || !song.id || !song.name || song.name === 'Untitled Track' ||
    !song.artist_name || song.artist_name === 'Unknown Artist' || !Number.isFinite(song.duration) || song.duration <= 0 ||
    !LIVE_CURATION_CONFIG.languages.some(language => language === languageOf(song.language))) return false;
  try {
    const audio = new URL(song.audio);
    if (!['http:', 'https:'].includes(audio.protocol) || audio.username || audio.password) return false;
  } catch { return false; }
  if (section === 'fresh_releases') {
    // Missing/partial dates do not establish freshness. Never substitute this job's date.
    const released = validDate(song.releaseDate || '');
    const now = validDate(today)!;
    if (released === null || released > now || now - released > LIVE_CURATION_CONFIG.freshMaxAgeDays * 86400000) return false;
  }
  return true;
}

/** Preserves the first 20 editorial positions; at most five supported web discoveries extend the row. */
export function mergeDiscoveryTracks(editorial: Song[], web: Song[], limit: number = CURATION_ENGINE_CONFIG.maxStoredTracks): Song[] {
  const ids = new Set<string>();
  const keys = new Set<string>();
  const editorialIds = new Set(editorial.map(song => String(song.id)));
  const editorialKeys = new Set(editorial.map(song => buildCandidateKey(song.name, song.artist_name)));
  const result: Song[] = [];
  const add = (song: Song): boolean => {
    const key = buildCandidateKey(song.name, song.artist_name);
    if (ids.has(String(song.id)) || keys.has(key)) return false;
    ids.add(String(song.id)); keys.add(key); result.push(song); return true;
  };
  editorial.slice(0, Math.max(0, limit - LIVE_CURATION_CONFIG.maxWebAdditions)).forEach(add);
  let added = 0;
  for (const song of web) {
    if (added >= LIVE_CURATION_CONFIG.maxWebAdditions || result.length >= limit) break;
    if (editorialIds.has(String(song.id)) || editorialKeys.has(buildCandidateKey(song.name, song.artist_name))) continue;
    if (add(song)) added++;
  }
  for (const song of editorial) {
    if (result.length >= limit) break;
    add(song);
  }
  return result;
}

export class LiveCurationService {
  constructor(
    private readonly provider: Pick<JioSaavnProvider, 'getPlaylistById' | 'search'> = new JioSaavnProvider(),
    private readonly web: Pick<WebCurationService, 'discover'> = new WebCurationService()
  ) {}

  async generate(section: LiveSectionId, now = new Date()): Promise<LiveCurationResult> {
    const today = indiaDate(now);
    const editorial: Song[] = [];
    const provenance: ICuratedTrackEvidence[] = [];
    let rawCount = 0;
    let duplicateCount = 0;
    let unresolvedCount = 0;
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    for (const id of EDITORIAL_PLAYLISTS[section]) {
      try {
        const playlist = await this.provider.getPlaylistById(id, LIVE_CURATION_CONFIG.playlistLimit);
        if (!playlist || String(playlist.id) !== id || playlist.provider !== 'jiosaavn') continue;
        for (const song of playlist.tracks) {
          rawCount++;
          if (!eligibleLiveTrack(song, section, today)) continue;
          const key = buildCandidateKey(song.name, song.artist_name);
          if (seenIds.has(String(song.id)) || seenKeys.has(key)) { duplicateCount++; continue; }
          seenIds.add(String(song.id)); seenKeys.add(key); editorial.push(song);
          provenance.push({ trackId: String(song.id), kind: 'editorial', sourceRef: id, sourceName: playlist.name, observedAt: now, date: song.releaseDate });
        }
        // Later configured IDs are fallbacks. They don't vote or reorder a healthy primary.
        if (editorial.length >= CURATION_ENGINE_CONFIG.maxStoredTracks) break;
      } catch {
        logger.warn('LiveCurationService', 'Editorial playlist unavailable', { section, playlistId: id });
      }
    }

    // A failed playlist refresh should not spend search credits or invent an AI replacement.
    const discovery: WebDiscovery = editorial.length > 0
      ? await this.web.discover(section, now).catch((): WebDiscovery => ({ candidates: [], model: '', status: 'unavailable', sourceCount: 0 }))
      : { candidates: [], model: '', status: 'unavailable', sourceCount: 0 };
    const webTracks: Song[] = [];
    for (const candidate of [...discovery.candidates].sort((a, b) => b.date.localeCompare(a.date))) {
      try {
        // The direct provider avoids the general search service's Jamendo fallback and reranking.
        const alreadyPresent = findStrictSongMatch(candidate.title, candidate.artist, editorial);
        const match = alreadyPresent || findStrictSongMatch(candidate.title, candidate.artist,
          await this.provider.search(`${candidate.title} ${candidate.artist}`, 12));
        if (!match) { unresolvedCount++; continue; }
        const song = match.song;
        // A release announcement can supply a missing date, but cannot override an older catalogue date.
        const datedSong = section === 'fresh_releases' && !song.releaseDate ? { ...song, releaseDate: candidate.date } : song;
        if (!eligibleLiveTrack(datedSong, section, today) || languageOf(song.language) !== candidate.language) { unresolvedCount++; continue; }
        webTracks.push(datedSong);
        provenance.push({ trackId: String(song.id), kind: section === 'trending' ? 'web_trend' : 'web_release', sourceRef: candidate.sourceUrl, sourceName: new URL(candidate.sourceUrl).hostname, observedAt: now, date: candidate.date, quote: `${candidate.evidence}\n${candidate.dateEvidence}`, matchConfidence: match.confidence });
      } catch { unresolvedCount++; }
    }
    const tracks = mergeDiscoveryTracks(editorial, webTracks);
    const duplicateIds = new Set<string>();
    const duplicateKeys = new Set<string>();
    let duplicateTracks = 0;
    for (const song of [...editorial, ...webTracks]) {
      const key = buildCandidateKey(song.name, song.artist_name);
      if (duplicateIds.has(String(song.id)) || duplicateKeys.has(key)) duplicateTracks++;
      duplicateIds.add(String(song.id)); duplicateKeys.add(key);
    }
    const finalIds = new Set(tracks.map(song => String(song.id)));
    logger.info('LiveCurationService', 'Editorial and web discovery finished', {
      section, editorialTracks: editorial.length, webCandidates: discovery.candidates.length,
      webMatches: webTracks.length, webSources: discovery.sourceCount, webStatus: discovery.status,
      finalTracks: tracks.length
    });
    return {
      tracks, provenance: provenance.filter(item => finalIds.has(item.trackId)),
      llmModel: discovery.model, webStatus: discovery.status,
      stats: { rawCandidateCount: rawCount + discovery.candidates.length,
        validCandidateCount: editorial.length + discovery.candidates.length,
        duplicateCandidatesRemoved: duplicateCount, resolvedCount: tracks.length, unresolvedCount,
        duplicateTracksRemoved: duplicateTracks }
    };
  }
}
