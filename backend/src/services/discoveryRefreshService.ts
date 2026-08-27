import { config } from '../config/config.js';
import { DiscoverySnapshot, DiscoverySections, type DiscoverySectionKey } from '../models/discoverySnapshot.model.js';
import { MusicService } from './musicService.js';
import { AiDiscoveryService } from './aiDiscoveryService.js';
import { findBestSongMatch, type SongCandidate } from '../utils/songMatcher.js';
import { logger, serializeError } from '../utils/logger.js';

export const SECTION_ORDER: DiscoverySectionKey[] = ['trending', 'popularThisWeek', 'editorsPicks', 'freshReleases'];
const emptySections = (): DiscoverySections => ({ trending: [], popularThisWeek: [], editorsPicks: [], freshReleases: [] });

export class DiscoveryRefreshService {
  private refreshingSections = new Set<DiscoverySectionKey>();
  constructor(private readonly ai = new AiDiscoveryService(), private readonly music = new MusicService()) {}

  async getActiveSnapshot() { return DiscoverySnapshot.findOne({ status: 'active' }).sort({ generatedAt: -1 }).lean(); }

  async refreshSection(section: DiscoverySectionKey): Promise<boolean> {
    if (this.refreshingSections.has(section)) { logger.warn('DiscoveryRefresh', 'Section refresh skipped because it is already running', { section }); return false; }
    this.refreshingSections.add(section);
    try {
      logger.info('DiscoveryRefresh', 'Starting section refresh', { section });
      const candidates = await this.ai.generateCandidates(section);
      const active = await this.getActiveSnapshot();
      const sections = active ? structuredClone(active.sections) as DiscoverySections : emptySections();
      const usedIds = new Set(SECTION_ORDER.filter(key => key !== section).flatMap(key => sections[key].map(track => track.id)));
      const resolvedTracks = [] as DiscoverySections[DiscoverySectionKey];
      for (const candidate of candidates) {
        if (resolvedTracks.length >= config.discoverySectionSize) break;
        const track = await this.resolveCandidate(candidate, usedIds);
        if (!track) continue;
        usedIds.add(track.id);
        resolvedTracks.push({ ...track, reason: candidate.reason, rank: resolvedTracks.length + 1 });
      }
      if (resolvedTracks.length === 0) throw new Error(`No ${section} candidates could be resolved to playable provider tracks.`);
      sections[section] = resolvedTracks;
      const now = new Date();
      const snapshot = await DiscoverySnapshot.create({ generatedAt: now, expiresAt: new Date(now.getTime() + config.discoverySnapshotTtlHours * 3600000), status: 'active', sections });
      await DiscoverySnapshot.updateMany({ _id: { $ne: snapshot._id }, status: 'active' }, { $set: { status: 'archived' } });
      logger.info('DiscoveryRefresh', 'Section refresh completed', { section, tracks: resolvedTracks.length, snapshotId: String(snapshot._id) });
      return true;
    } catch (error) {
      logger.error('DiscoveryRefresh', 'Section refresh failed; preserving active snapshot', { section, error: serializeError(error) });
      return false;
    } finally { this.refreshingSections.delete(section); }
  }

  async refreshDiscoverySections(): Promise<boolean> {
    let anySucceeded = false;
    for (const section of SECTION_ORDER) anySucceeded = (await this.refreshSection(section)) || anySucceeded;
    return anySucceeded;
  }

  async refreshIfStale(): Promise<void> {
    const active = await this.getActiveSnapshot();
    if (!active || new Date(active.expiresAt).getTime() <= Date.now()) void this.refreshDiscoverySections();
  }

  private async resolveCandidate(candidate: SongCandidate, usedIds: Set<string>) {
    try {
      const { songs } = await this.music.search(`${candidate.title} ${candidate.artist}`, 10);
      const match = findBestSongMatch(candidate, songs.filter(song => song.provider === 'jiosaavn'));
      if (!match || match.confidence < config.discoveryMatchThreshold || usedIds.has(match.song.id)) return null;
      return match.song;
    } catch (error) {
      logger.warn('DiscoveryRefresh', 'Candidate lookup failed', { title: candidate.title, error: serializeError(error) });
      return null;
    }
  }
}

export const discoveryRefreshService = new DiscoveryRefreshService();
