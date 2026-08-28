import type { Track, Artist, Album, CuratedSection, RelatedMusic } from '../types/types';
import { API_ENDPOINTS, PLAYER_DEFAULTS } from '../config/constants';
import { fetchJson, type ApiResponse } from './apiClient';
import { formatDuration, getTrackUrl, getArtistUrl } from '../utils/formatters';

const searchCache = new Map<string, { timestamp: number; tracks: Track[] }>();
const CACHE_TTL_MS = 300000;
const CACHE_MAX_ENTRIES = 200;
export class MusicAPI {
  static async searchTracks(query: string, limit: number = PLAYER_DEFAULTS.DEFAULT_SEARCH_LIMIT, signal?: AbortSignal): Promise<Track[]> {
    if (!query || !query.trim()) return [];

    const cacheKey = `${query.trim().toLowerCase()}:${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.tracks;
    }

    try {
      const url = `${API_ENDPOINTS.SEARCH}?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
      const body = await fetchJson<ApiResponse<Track[]>>(url, { signal });

      if (!body.success || !Array.isArray(body.data)) {
        throw new Error('Invalid response payload format from music backend.');
      }

      searchCache.set(cacheKey, { timestamp: Date.now(), tracks: body.data });
      if (searchCache.size > CACHE_MAX_ENTRIES) {
        const oldestKey = searchCache.keys().next().value;
        if (oldestKey) searchCache.delete(oldestKey);
      }
      return body.data;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      console.error('[MusicAPI] Search error:', error);
      throw error;
    }
  }

  static async getTrendingTracks(limit: number = PLAYER_DEFAULTS.DEFAULT_TRENDING_LIMIT): Promise<Track[]> {
    try {
      const url = `${API_ENDPOINTS.TRENDING}?limit=${limit}`;
      const body = await fetchJson<ApiResponse<Track[]>>(url);

      if (!body.success || !Array.isArray(body.data)) {
        throw new Error('Invalid response payload format from music backend.');
      }

      return body.data;
    } catch (error) {
      console.error('[MusicAPI] Get trending tracks error:', error);
      throw new Error('🎵 Trending music is temporarily unavailable. Please try searching for your favorite tracks instead.');
    }
  }

  static async getCuratedSections(): Promise<CuratedSection[]> {
    const body = await fetchJson<ApiResponse<CuratedSection[]>>(API_ENDPOINTS.CURATED);
    if (!body.success || !Array.isArray(body.data)) {
      throw new Error('Invalid curated sections response from music backend.');
    }
    return body.data;
  }

  static async getTrackById(id: string): Promise<Track | null> {
    try {
      const url = API_ENDPOINTS.SONG(id);
      const body = await fetchJson<ApiResponse<Track>>(url);
      return body.success ? body.data : null;
    } catch (error) {
      console.error('[MusicAPI] Get track by ID error:', error);
      return null;
    }
  }

  static async getArtistById(id: string): Promise<Artist | null> {
    try {
      const url = API_ENDPOINTS.ARTIST(id);
      const body = await fetchJson<ApiResponse<Artist>>(url);
      return body.success ? body.data : null;
    } catch (error) {
      console.error('[MusicAPI] Get artist by ID error:', error);
      return null;
    }
  }

  static async getAlbumById(id: string): Promise<Album | null> {
    try {
      const url = API_ENDPOINTS.ALBUM(id);
      const body = await fetchJson<ApiResponse<Album>>(url);
      return body.success ? body.data : null;
    } catch (error) {
      console.error('[MusicAPI] Get album by ID error:', error);
      return null;
    }
  }

  static async getSuggestionsById(id: string): Promise<Track[]> {
    try {
      const url = API_ENDPOINTS.SUGGESTIONS(id);
      const body = await fetchJson<ApiResponse<Track[]>>(url);
      return body.success ? body.data : [];
    } catch (error) {
      console.error('[MusicAPI] Get suggestions error:', error);
      return [];
    }
  }

  static async getTracksByGenre(genre: string, limit: number = PLAYER_DEFAULTS.DEFAULT_SEARCH_LIMIT): Promise<Track[]> {
    return this.searchTracks(genre, limit);
  }

  static async getArtistTracks(artistName: string, limit: number = 30): Promise<Track[]> {
    if (!artistName || !artistName.trim()) return [];
    const cacheKey = `artist:${artistName.toLowerCase()}:${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.tracks;
    }
    const tracks = await this.searchTracks(artistName, limit);
    const filtered = tracks.filter(t => (t.artist_name || '').toLowerCase() === artistName.toLowerCase());
    searchCache.set(cacheKey, { timestamp: Date.now(), tracks: filtered });
    if (searchCache.size > CACHE_MAX_ENTRIES) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) searchCache.delete(oldestKey);
    }
    return filtered;
  }

  static async getAlbumTracks(albumName: string, artistName?: string, limit: number = 30): Promise<Track[]> {
    if (!albumName || !albumName.trim()) return [];
    const cacheKey = `album:${albumName.toLowerCase()}:${(artistName || '').toLowerCase()}:${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.tracks;
    }
    const query = artistName ? `${albumName} ${artistName}` : albumName;
    const tracks = await this.searchTracks(query, limit);
    const filtered = tracks.filter(t => (t.album_name || '').toLowerCase() === albumName.toLowerCase());
    searchCache.set(cacheKey, { timestamp: Date.now(), tracks: filtered });
    return filtered;
  }

  static async getRelatedMusic(track: Track): Promise<RelatedMusic> {
    const cacheKey = `related:${track.id}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.tracks as unknown as RelatedMusic;
    }

    const similarPromise = track.id ? this.getSuggestionsById(track.id) : Promise.resolve<Track[]>([]);

    const [similarBySuggestion, moreFromArtist, moreFromAlbum] = await Promise.all([
      similarPromise,
      this.getArtistTracks(track.artist_name, 10),
      this.getAlbumTracks(track.album_name, track.artist_name, 10),
    ]);

    const similarSongs = (similarBySuggestion || [])
      .filter(t => t && t.id && String(t.id) !== String(track.id))
      .slice(0, 8);
    const artistTracks = (moreFromArtist || [])
      .filter(t => t && t.id && String(t.id) !== String(track.id))
      .slice(0, 8);
    const albumTracks = (moreFromAlbum || [])
      .filter(t => t && t.id && String(t.id) !== String(track.id))
      .slice(0, 8);

    const result: RelatedMusic = { similarSongs, moreFromArtist: artistTracks, moreFromAlbum: albumTracks };
    searchCache.set(cacheKey, { timestamp: Date.now(), tracks: result as unknown as Track[] });
    return result;
  }

  static async getRecommendations(track: Track, excludeIds: Set<string> = new Set(), limit: number = 10): Promise<Track[]> {
    if (!track || !track.id) return [];

    const suggestions = await this.getSuggestionsById(track.id);

    const seen = new Set<string>([track.id, ...excludeIds]);
    const curated: Track[] = [];
    for (const t of suggestions) {
      if (!t) continue;
      const id = `${t.provider || ''}:${String(t.id)}`;
      if (!seen.has(String(t.id)) && !seen.has(id) && t.audio) {
        seen.add(String(t.id));
        seen.add(id);
        curated.push(t);
      }
    }

    return curated.slice(0, limit);
  }

  static getCached(key: string): Track[] | null {
    const cached = searchCache.get(key);
    return (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) ? cached.tracks : null;
  }
}

export const JamendoAPI = MusicAPI;
export { formatDuration, getTrackUrl, getArtistUrl };
export const getJamendoTrackUrl = getTrackUrl;
export const getJamendoArtistUrl = getArtistUrl;
