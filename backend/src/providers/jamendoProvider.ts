import axios, { AxiosInstance } from 'axios';
import { IMusicProvider } from './musicProvider.interface.js';
import { Song, Album, Playlist } from '../models/music.model.js';
import { MusicNormalizer } from '../normalizers/musicNormalizer.js';
import { config } from '../config/config.js';

export class JamendoProvider implements IMusicProvider {
  readonly name = 'jamendo' as const;
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.jamendoApiUrl,
      timeout: config.requestTimeoutMs,
      headers: {
        'Accept': 'application/json'
      }
    });
  }

  private getDefaultParams(params: Record<string, string | number> = {}) {
    return {
      client_id: config.jamendoClientId,
      format: 'json',
      ...params
    };
  }

  async search(query: string, limit = 20): Promise<Song[]> {
    try {
      const searchLimit = Math.max(5, Math.ceil(limit / 3));
      const searches = await Promise.allSettled([
        this.client.get('/tracks/', {
          params: this.getDefaultParams({
            namesearch: query,
            limit: searchLimit,
            include: 'musicinfo',
            audioformat: 'mp31',
            order: 'popularity_total'
          })
        }),
        this.client.get('/tracks/', {
          params: this.getDefaultParams({
            artist_name: query,
            limit: searchLimit,
            include: 'musicinfo',
            audioformat: 'mp31',
            order: 'popularity_total'
          })
        }),
        this.client.get('/tracks/', {
          params: this.getDefaultParams({
            tags: query,
            limit: searchLimit,
            include: 'musicinfo',
            audioformat: 'mp31',
            order: 'popularity_total'
          })
        })
      ]);

      const allTracks: Song[] = [];
      searches.forEach((res) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value.data?.results)) {
          const songs = res.value.data.results.map((raw: unknown) => MusicNormalizer.normalizeJamendoSong(raw));
          allTracks.push(...songs);
        }
      });

      const uniqueTracks = allTracks.filter((track, index, self) =>
        index === self.findIndex(t => t.id === track.id)
      );

      return uniqueTracks.slice(0, limit);
    } catch {
      return [];
    }
  }

  async getSongById(id: string): Promise<Song | null> {
    try {
      const response = await this.client.get('/tracks/', {
        params: this.getDefaultParams({
          id,
          include: 'musicinfo',
          audioformat: 'mp31'
        })
      });
      const results = response.data?.results;
      if (Array.isArray(results) && results.length > 0) {
        return MusicNormalizer.normalizeJamendoSong(results[0]);
      }
      return null;
    } catch {
      return null;
    }
  }

  async getAlbumById(id: string): Promise<Album | null> {
    try {
      const response = await this.client.get('/tracks/', {
        params: this.getDefaultParams({
          album_id: id,
          include: 'musicinfo',
          audioformat: 'mp31'
        })
      });
      const results = response.data?.results;
      if (Array.isArray(results) && results.length > 0) {
        const songs = results.map((raw: unknown) => MusicNormalizer.normalizeJamendoSong(raw));
        const first = results[0];
        return {
          id: first.album_id || id,
          name: first.album_name || 'Jamendo Album',
          artist_id: first.artist_id || '',
          artist_name: first.artist_name || 'Unknown Artist',
          image: first.album_image || first.image || '/placeholder-album.svg',
          songs,
          songCount: songs.length,
          provider: 'jamendo'
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async getPlaylistById(id: string): Promise<Playlist | null> {
    try {
      const response = await this.client.get('/playlists/tracks/', {
        params: this.getDefaultParams({ id })
      });
      const results = response.data?.results;
      if (Array.isArray(results) && results.length > 0) {
        const pl = results[0];
        const tracks = Array.isArray(pl.tracks)
          ? pl.tracks.map((raw: unknown) => MusicNormalizer.normalizeJamendoSong(raw))
          : [];
        return {
          id: pl.id || id,
          name: pl.name || 'Jamendo Playlist',
          tracks,
          provider: 'jamendo'
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async getSuggestions(id: string, limit = 10): Promise<Song[]> {
    try {
      const song = await this.getSongById(id);
      const genre = song?.musicinfo?.tags?.genres?.[0] || 'rap';
      const response = await this.client.get('/tracks/', {
        params: this.getDefaultParams({
          tags: genre,
          limit,
          include: 'musicinfo',
          audioformat: 'mp31',
          order: 'popularity_total'
        })
      });
      const results = response.data?.results;
      if (Array.isArray(results) && results.length > 0) {
        return results.map((raw: unknown) => MusicNormalizer.normalizeJamendoSong(raw));
      }
      return [];
    } catch {
      return [];
    }
  }
}
