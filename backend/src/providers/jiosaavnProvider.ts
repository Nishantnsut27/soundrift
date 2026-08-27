import axios, { AxiosInstance } from 'axios';
import { IMusicProvider } from './musicProvider.interface.js';
import { Song, Album, Artist, Playlist } from '../models/music.model.js';
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

  async getArtistById(id: string): Promise<Artist | null> {
    return requestWithRetry('JioSaavnProvider', 'fetch artist details', async () => {
      const response = await this.client.get(`/api/artists/${id}`);
      const data = response.data?.data;
      if (data && typeof data === 'object' && (data.name || (Array.isArray(data.topSongs) && data.topSongs.length > 0))) {
        return MusicNormalizer.normalizeJioSaavnArtist(data);
      }
      return null;
    }, { id });
  }

  async getPlaylistById(id: string): Promise<Playlist | null> {
    return requestWithRetry('JioSaavnProvider', 'fetch playlist details', async () => {
      const response = await this.client.get('/api/playlists', {
        params: { id }
      });
      const data = response.data?.data;
      if (data && typeof data === 'object') {
        return MusicNormalizer.normalizeJioSaavnPlaylist(data);
      }
      return null;
    }, { id });
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
