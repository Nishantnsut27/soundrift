import { IMusicProvider, ArtistCatalogueOptions } from '../providers/musicProvider.interface.js';
import { JioSaavnProvider } from '../providers/jiosaavnProvider.js';
import { JamendoProvider } from '../providers/jamendoProvider.js';
import {
  Song,
  Album,
  Playlist,
  PlaylistSummary,
  PagedResult
} from '../models/music.model.js';
import { deduplicateSongs, rankSongs } from '../utils/deduplication.js';
import { scoreCandidate, ScoredCandidate } from '../utils/recommendationScore.js';
import { globalCacheService } from './cacheService.js';
import { MUSIC_ENGINE_CONFIG, TRENDING_ARTIST_POOL } from '../config/musicEngineConfig.js';
import { isSearchNoise, normalizeStringForSearch } from '../utils/musicSearch.js';
import { logger, serializeError } from '../utils/logger.js';

export class MusicService {
  /**
   * Typed as the concrete provider, not the interface: the artist catalogue,
   * artist search and playlist search endpoints exist only on JioSaavn, and
   * pretending otherwise would mean guarding every call for a branch that can
   * never be taken here.
   */
  private jiosaavnProvider: JioSaavnProvider;
  private jamendoProvider: IMusicProvider;

  constructor() {
    this.jiosaavnProvider = new JioSaavnProvider();
    this.jamendoProvider = new JamendoProvider();
  }

  async search(query: string, limit = 20): Promise<{ songs: Song[]; provider: string }> {
    if (!query || !query.trim()) {
      return { songs: [], provider: 'jiosaavn' };
    }

    const trimmedQuery = query.trim().toLowerCase();
    const cacheKey = `search:${trimmedQuery}:${limit}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      try {
        const candidateLimit = Math.max(limit * MUSIC_ENGINE_CONFIG.searchResultLimitMultiplier, limit + 8);
        const songs = await this.jiosaavnProvider.search(trimmedQuery, candidateLimit);
        const filtered = songs.filter(song => !isSearchNoise(song, trimmedQuery));
        const deduped = deduplicateSongs(filtered);
        const ranked = rankSongs(deduped, trimmedQuery);

        if (ranked.length > 0) {
          return { songs: ranked.slice(0, limit), provider: 'jiosaavn' };
        }

        const jamendoSongs = await this.jamendoProvider.search(trimmedQuery, limit);
        return { songs: jamendoSongs.slice(0, limit), provider: 'jamendo' };
      } catch (error) {
        logger.error('MusicService', 'Search failed', { query: trimmedQuery, limit, error: serializeError(error) });
        const jamendoSongs = await this.jamendoProvider.search(trimmedQuery, limit);
        return { songs: jamendoSongs.slice(0, limit), provider: 'jamendo' };
      }
    }, MUSIC_ENGINE_CONFIG.searchCacheTtlMs);
  }

  async getSongById(id: string, refresh = false): Promise<Song | null> {
    if (!id) return null;
    const cacheKey = `song:${id}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const song = await this.jiosaavnProvider.getSongById(id);
      if (song) {
        return song;
      }

      return this.jamendoProvider.getSongById(id);
    }, MUSIC_ENGINE_CONFIG.metadataCacheTtlMs, refresh);
  }

  async getAlbumById(id: string): Promise<Album | null> {
    if (!id) return null;
    const cacheKey = `album:${id}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const album = await this.jiosaavnProvider.getAlbumById(id);
      if (album) {
        return album;
      }

      return this.jamendoProvider.getAlbumById(id);
    }, MUSIC_ENGINE_CONFIG.metadataCacheTtlMs);
  }

  async getArtistAlbums(id: string, options: ArtistCatalogueOptions = {}): Promise<PagedResult<Album>> {
    if (!id) return { total: 0, items: [] };
    const { page = 0, sortBy = 'popularity', sortOrder = 'desc' } = options;
    const cacheKey = `artist-albums:${id}:${page}:${sortBy}:${sortOrder}`;

    const result = await globalCacheService.getOrFetch(
      cacheKey,
      () => this.jiosaavnProvider.getArtistAlbums(id, { page, sortBy, sortOrder }),
      MUSIC_ENGINE_CONFIG.metadataCacheTtlMs
    );

    return result ?? { total: 0, items: [] };
  }

  async searchPlaylists(query: string, limit = 10): Promise<PlaylistSummary[]> {
    if (!query || !query.trim()) return [];
    const cacheKey = `playlist-search:${normalizeStringForSearch(query)}:${limit}`;

    const result = await globalCacheService.getOrFetch(
      cacheKey,
      () => this.jiosaavnProvider.searchPlaylists(query.trim(), limit),
      MUSIC_ENGINE_CONFIG.metadataCacheTtlMs
    );

    return result ?? [];
  }

  async getPlaylistById(id: string, limit = 50): Promise<Playlist | null> {
    if (!id) return null;
    const cacheKey = `playlist:${id}:${limit}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const playlist = await this.jiosaavnProvider.getPlaylistById(id, limit);
      if (playlist) {
        return playlist;
      }

      return this.jamendoProvider.getPlaylistById(id);
    }, MUSIC_ENGINE_CONFIG.metadataCacheTtlMs);
  }

  async getSuggestions(id: string, limit = 10): Promise<Song[]> {
    if (!id) return [];
    const cacheKey = `suggestions:v2:${id}:${limit}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const source = await this.getSongById(id).catch(() => null);
      if (!source) return [];

      const results = await this.resolveCandidates(source, limit);
      return results.slice(0, limit);
    }, MUSIC_ENGINE_CONFIG.metadataCacheTtlMs);
  }

  private async resolveCandidates(source: Song, limit: number): Promise<Song[]> {
    const settled = await Promise.allSettled([
      this.getProviderNativeSuggestions(source),
      this.getSameArtistTracks(source),
      this.getSameAlbumTracks(source),
    ]);

    const seen = new Set<string>([String(source.id)]);
    const scored: ScoredCandidate[] = [];
    const providerNativeIds = new Set<string>();

    for (let slot = 0; slot < settled.length; slot++) {
      const result = settled[slot];
      if (result.status !== 'fulfilled') continue;

      const isProviderNative = slot === 0;
      for (const candidate of result.value) {
        if (!candidate || !candidate.id || !candidate.audio) continue;
        if (seen.has(String(candidate.id))) continue;
        seen.add(String(candidate.id));

        if (isProviderNative) providerNativeIds.add(String(candidate.id));
        const entry = scoreCandidate(source, candidate, isProviderNative);
        scored.push(entry);
      }
    }

    for (const entry of scored) {
      if (providerNativeIds.has(String(entry.song.id))) {
        entry.score += 8;
      }
    }

    if (scored.length === 0) {
      logger.info('MusicService', 'No recommendation candidates; falling back to trending', { sourceId: source.id, sourceName: source.name });
    }

    scored.sort((a, b) => b.score - a.score);

    const ranked = scored.map(s => s.song);

    if (ranked.length < limit) {
      const fallback = await this.getTrending(limit * 2).catch(() => ({ songs: [], provider: 'jiosaavn' }));
      const fallbackSongs = (fallback.songs || []).filter(s => !seen.has(String(s.id)));
      ranked.push(...fallbackSongs);
    }

    return deduplicateSongs(ranked).slice(0, limit * 2);
  }

  private async getProviderNativeSuggestions(source: Song): Promise<Song[]> {
    if (source.provider === 'jamendo') {
      return this.jamendoProvider.getSuggestions(source.id, 10).catch(() => []);
    }
    return this.jiosaavnProvider.getSuggestions(source.id, 10).catch(() => []);
  }

  private async getSameArtistTracks(source: Song): Promise<Song[]> {
    if (!source.artist_name || source.artist_name === 'Unknown Artist') return [];
    const result = await this.search(source.artist_name, 15).catch(() => ({ songs: [], provider: 'jiosaavn' }));
    const filtered = result.songs.filter(song => {
      const sourceArtists = source.artist_name.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const songArtists = song.artist_name.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      return sourceArtists.some(a => songArtists.includes(a));
    });
    return filtered.length > 0 ? filtered : result.songs;
  }

  private async getSameAlbumTracks(source: Song): Promise<Song[]> {
    if (!source.album_id) return [];
    const album = await this.getAlbumByProviderId(source.provider || 'jiosaavn', source.album_id).catch(() => null);
    if (!album || !Array.isArray(album.songs)) return [];
    return album.songs.filter(song => song.id && song.audio);
  }

  private async getAlbumByProviderId(provider: 'jiosaavn' | 'jamendo', id: string): Promise<Album | null> {
    if (provider === 'jamendo') {
      return this.jamendoProvider.getAlbumById(id).catch(() => null);
    }
    return this.jiosaavnProvider.getAlbumById(id).catch(() => null);
  }

  async getTrending(limit = 20): Promise<{ songs: Song[]; provider: string }> {
    const cacheKey = `trending:${limit}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const shuffledArtists = this.shuffleArray([...TRENDING_ARTIST_POOL]);
      const artistCount = this.randomInt(MUSIC_ENGINE_CONFIG.trendingArtistMinCount, MUSIC_ENGINE_CONFIG.trendingArtistMaxCount);
      const selectedArtists = shuffledArtists.slice(0, artistCount);
      const songsPerArtist = this.randomInt(MUSIC_ENGINE_CONFIG.trendingSongsPerArtistMin, MUSIC_ENGINE_CONFIG.trendingSongsPerArtistMax);

      const buckets = await Promise.all(selectedArtists.map(async artist => {
        const result = await this.search(artist, MUSIC_ENGINE_CONFIG.trendingSearchLimit);
        const normalizedArtist = normalizeStringForSearch(artist);
        const artistSongs = result.songs.filter(song => {
          const songArtist = normalizeStringForSearch(song.artist_name);
          const songTitle = normalizeStringForSearch(song.name);
          return songArtist.includes(normalizedArtist) || normalizedArtist.includes(songArtist) || songTitle.includes(normalizedArtist);
        });

        const curated = (artistSongs.length > 0 ? artistSongs : result.songs).slice(0, songsPerArtist);
        return { artist, songs: curated };
      }));

      const merged = this.interleaveByArtist(buckets);
      const deduped = deduplicateSongs(merged);
      const finalSongs = this.shuffleArray(deduped).slice(0, limit);

      const provider = finalSongs.some(song => song.provider === 'jamendo') ? 'jiosaavn,jamendo' : 'jiosaavn';

      logger.info('MusicService', 'Generated trending selection', {
        selectedArtists,
        songsPerArtist,
        returned: finalSongs.length
      });

      return { songs: finalSongs, provider };
    }, MUSIC_ENGINE_CONFIG.trendingCacheTtlMs);
  }

  private shuffleArray<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }

    return items;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private interleaveByArtist(buckets: Array<{ artist: string; songs: Song[] }>): Song[] {
    const workingBuckets = buckets.map(bucket => ({ ...bucket, songs: [...bucket.songs] }));
    const result: Song[] = [];

    let moreSongsRemaining = true;
    while (moreSongsRemaining) {
      moreSongsRemaining = false;

      for (const bucket of this.shuffleArray(workingBuckets)) {
        const nextSong = bucket.songs.shift();
        if (nextSong) {
          result.push(nextSong);
          moreSongsRemaining = true;
        }
      }
    }

    return result;
  }
}
