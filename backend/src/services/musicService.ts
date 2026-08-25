import { IMusicProvider } from '../providers/musicProvider.interface.js';
import { JioSaavnProvider } from '../providers/jiosaavnProvider.js';
import { JamendoProvider } from '../providers/jamendoProvider.js';
import { Song, Album, Artist, Playlist, Suggestion } from '../models/music.model.js';
import { MusicNormalizer } from '../normalizers/musicNormalizer.js';
import { deduplicateSongs, rankSongs } from '../utils/deduplication.js';
import { globalCacheService } from './cacheService.js';
import { MUSIC_ENGINE_CONFIG, TRENDING_ARTIST_POOL } from '../config/musicEngineConfig.js';
import { isSearchNoise, normalizeStringForSearch } from '../utils/musicSearch.js';
import { logger, serializeError } from '../utils/logger.js';

export class MusicService {
  private jiosaavnProvider: IMusicProvider;
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

  async getSongById(id: string): Promise<Song | null> {
    if (!id) return null;
    const cacheKey = `song:${id}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const song = await this.jiosaavnProvider.getSongById(id);
      if (song) {
        return song;
      }

      return this.jamendoProvider.getSongById(id);
    }, MUSIC_ENGINE_CONFIG.metadataCacheTtlMs);
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

  async getArtistById(id: string): Promise<Artist | null> {
    if (!id) return null;
    const cacheKey = `artist:${id}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const artist = await this.jiosaavnProvider.getArtistById(id);
      if (artist) {
        return artist;
      }

      return this.jamendoProvider.getArtistById(id);
    }, MUSIC_ENGINE_CONFIG.metadataCacheTtlMs);
  }

  async getPlaylistById(id: string): Promise<Playlist | null> {
    if (!id) return null;
    const cacheKey = `playlist:${id}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const playlist = await this.jiosaavnProvider.getPlaylistById(id);
      if (playlist) {
        return playlist;
      }

      return this.jamendoProvider.getPlaylistById(id);
    }, MUSIC_ENGINE_CONFIG.metadataCacheTtlMs);
  }

  async getSuggestions(id: string, limit = 10): Promise<Suggestion[]> {
    if (!id) return [];
    const cacheKey = `suggestions:${id}:${limit}`;

    return globalCacheService.getOrFetch(cacheKey, async () => {
      const songs = await this.jiosaavnProvider.getSuggestions(id, limit);
      if (songs.length > 0) {
        return songs.map(song => MusicNormalizer.normalizeSuggestion(song));
      }

      const jamendoSongs = await this.jamendoProvider.getSuggestions(id, limit);
      if (jamendoSongs.length > 0) {
        return jamendoSongs.map(song => MusicNormalizer.normalizeSuggestion(song));
      }

      return songs.map(song => MusicNormalizer.normalizeSuggestion(song));
    }, MUSIC_ENGINE_CONFIG.metadataCacheTtlMs);
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
