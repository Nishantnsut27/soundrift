import axios, { AxiosInstance } from 'axios';
import { IMusicProvider, ArtistCatalogueOptions, ArtistDetailOptions } from './musicProvider.interface.js';
import {
  Song,
  Album,
  Artist,
  Playlist,
  ArtistSummary,
  PlaylistSummary,
  PagedResult
} from '../models/music.model.js';
import { MusicNormalizer } from '../normalizers/musicNormalizer.js';
import { config } from '../config/config.js';
import { requestWithRetry } from '../utils/requestHelpers.js';

export class JioSaavnProvider implements IMusicProvider {
  readonly name = 'jiosaavn' as const;
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.jiosaavnApiUrl,
      timeout: config.requestTimeoutMs,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Soundrift/1.0'
      }
    });
  }

  async search(query: string, limit = 20): Promise<Song[]> {
    return requestWithRetry('JioSaavnProvider', 'search songs', async () => {
      const response = await this.client.get('/api/search/songs', {
        params: { query, limit, page: 0 }
      });

      const results = response.data?.data?.results;
      if (!Array.isArray(results) || results.length === 0) {
        return [];
      }

      return results
        .filter((rawSong: unknown) => !!rawSong && typeof rawSong === 'object')
        .map((rawSong: unknown) => MusicNormalizer.normalizeJioSaavnSong(rawSong));
    }, { query, limit });
  }

  async getSongById(id: string): Promise<Song | null> {
    return requestWithRetry('JioSaavnProvider', 'fetch song details', async () => {
      const response = await this.client.get(`/api/songs/${id}`);
      const songs = response.data?.data;
      if (Array.isArray(songs) && songs.length > 0) {
        return MusicNormalizer.normalizeJioSaavnSong(songs[0]);
      }
      return null;
    }, { id });
  }

  async getAlbumById(id: string): Promise<Album | null> {
    return requestWithRetry('JioSaavnProvider', 'fetch album details', async () => {
      const response = await this.client.get('/api/albums', {
        params: { id }
      });
      const data = response.data?.data;
      if (data && typeof data === 'object' && data.id && data.name) {
        return MusicNormalizer.normalizeJioSaavnAlbum(data);
      }
      return null;
    }, { id });
  }

  /**
   * Full artist profile.
   *
   * `songCount` and `albumCount` are what make this endpoint useful: without them
   * the upstream default returns a handful of tracks, which is why artist songs
   * looked unavailable. See the OpenAPI document at `/swagger` — the same call
   * happily returns 25 with the parameters set.
   */
  async getArtistById(id: string, options: ArtistDetailOptions = {}): Promise<Artist | null> {
    const { songCount = 25, albumCount = 15 } = options;

    return requestWithRetry('JioSaavnProvider', 'fetch artist details', async () => {
      const response = await this.client.get(`/api/artists/${id}`, {
        params: { songCount, albumCount }
      });
      const data = response.data?.data;
      if (data && typeof data === 'object' && (data.name || (Array.isArray(data.topSongs) && data.topSongs.length > 0))) {
        return MusicNormalizer.normalizeJioSaavnArtist(data);
      }
      return null;
    }, { id, songCount, albumCount });
  }

  /**
   * One page of an artist's catalogue. The upstream `total` is passed through
   * unchanged so the UI can say how much is left without estimating.
   */
  async getArtistSongs(id: string, options: ArtistCatalogueOptions = {}): Promise<PagedResult<Song>> {
    const { page = 0, sortBy = 'popularity', sortOrder = 'desc' } = options;

    const result = await requestWithRetry('JioSaavnProvider', 'fetch artist songs', async () => {
      const response = await this.client.get(`/api/artists/${id}/songs`, {
        params: { page, sortBy, sortOrder }
      });
      const data = response.data?.data;
      const songs = Array.isArray(data?.songs) ? data.songs : [];
      return {
        total: typeof data?.total === 'number' ? data.total : songs.length,
        items: songs
          .filter((raw: unknown) => !!raw && typeof raw === 'object')
          .map((raw: unknown) => MusicNormalizer.normalizeJioSaavnSong(raw))
      };
    }, { id, page, sortBy, sortOrder });

    return result ?? { total: 0, items: [] };
  }

  async getArtistAlbums(id: string, options: ArtistCatalogueOptions = {}): Promise<PagedResult<Album>> {
    const { page = 0, sortBy = 'popularity', sortOrder = 'desc' } = options;

    const result = await requestWithRetry('JioSaavnProvider', 'fetch artist albums', async () => {
      const response = await this.client.get(`/api/artists/${id}/albums`, {
        params: { page, sortBy, sortOrder }
      });
      const data = response.data?.data;
      const albums = Array.isArray(data?.albums) ? data.albums : [];
      return {
        total: typeof data?.total === 'number' ? data.total : albums.length,
        items: albums
          .filter((raw: unknown) => !!raw && typeof raw === 'object')
          .map((raw: unknown) => MusicNormalizer.normalizeJioSaavnAlbum(raw))
      };
    }, { id, page, sortBy, sortOrder });

    return result ?? { total: 0, items: [] };
  }

  /**
   * Artists as entities rather than as a name on a song.
   *
   * This is how an artist page is reached when a track carries no usable
   * `artist_id` — the name goes in, a real id comes back.
   */
  async searchArtists(query: string, limit = 10): Promise<ArtistSummary[]> {
    const result = await requestWithRetry('JioSaavnProvider', 'search artists', async () => {
      const response = await this.client.get('/api/search/artists', {
        params: { query, limit, page: 0 }
      });
      const results = response.data?.data?.results;
      if (!Array.isArray(results)) return [];

      return results
        .filter((raw: unknown) => !!raw && typeof raw === 'object')
        .map((raw: unknown) => MusicNormalizer.normalizeJioSaavnArtistSummary(raw))
        .filter((artist: ArtistSummary) => artist.id && artist.name);
    }, { query, limit });

    return result ?? [];
  }

  async searchAlbums(query: string, limit = 10): Promise<Album[]> {
    const result = await requestWithRetry('JioSaavnProvider', 'search albums', async () => {
      const response = await this.client.get('/api/search/albums', {
        params: { query, limit, page: 0 }
      });
      const results = response.data?.data?.results;
      if (!Array.isArray(results)) return [];

      return results
        .filter((raw: unknown) => !!raw && typeof raw === 'object')
        .map((raw: unknown) => MusicNormalizer.normalizeJioSaavnAlbum(raw))
        .filter((album: Album) => album.id && album.name);
    }, { query, limit });

    return result ?? [];
  }

  /** JioSaavn's own editorial playlists. Their curation, credited as theirs. */
  async searchPlaylists(query: string, limit = 10): Promise<PlaylistSummary[]> {
    const result = await requestWithRetry('JioSaavnProvider', 'search playlists', async () => {
      const response = await this.client.get('/api/search/playlists', {
        params: { query, limit, page: 0 }
      });
      const results = response.data?.data?.results;
      if (!Array.isArray(results)) return [];

      return results
        .filter((raw: unknown) => !!raw && typeof raw === 'object')
        .map((raw: unknown) => MusicNormalizer.normalizeJioSaavnPlaylistSummary(raw))
        .filter((playlist: PlaylistSummary) => playlist.id && playlist.name);
    }, { query, limit });

    return result ?? [];
  }

  async getPlaylistById(id: string, limit = 50): Promise<Playlist | null> {
    return requestWithRetry('JioSaavnProvider', 'fetch playlist details', async () => {
      const response = await this.client.get('/api/playlists', {
        params: { id, limit, page: 0 }
      });
      const data = response.data?.data;
      if (data && typeof data === 'object') {
        return MusicNormalizer.normalizeJioSaavnPlaylist(data);
      }
      return null;
    }, { id, limit });
  }

  async getSuggestions(id: string, limit = 10): Promise<Song[]> {
    return requestWithRetry('JioSaavnProvider', 'fetch song suggestions', async () => {
      const response = await this.client.get(`/api/songs/${id}/suggestions`, {
        params: { limit }
      });
      const results = response.data?.data;
      if (Array.isArray(results) && results.length > 0) {
        return results
          .filter((rawSong: unknown) => !!rawSong && typeof rawSong === 'object')
          .map((rawSong: unknown) => MusicNormalizer.normalizeJioSaavnSong(rawSong));
      }
      return [];
    }, { id, limit });
  }
}
