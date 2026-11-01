import axios, { type AxiosRequestConfig } from 'axios';
import { AppError } from '../utils/AppError.js';

// Spotify can rotate this persisted query. Fail closed instead of importing an embed preview.
const PLAYLIST_QUERY_HASH = 'a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4';
const PAGE_SIZE = 100;
export const MAX_SPOTIFY_PLAYLIST_ITEMS = 500;
const unavailable = () => new AppError('Spotify could not provide the complete playlist. Please try again later.', 502, 'SPOTIFY_UNAVAILABLE');
const inaccessible = () => new AppError('This Spotify playlist is private, unavailable, or does not exist. Use a public playlist link.', 422, 'SPOTIFY_INACCESSIBLE');
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export interface SpotifyTrackMetadata {
  id: string;
  title: string;
  artists: string[];
  durationMs: number;
  album: string;
}

export interface SpotifyPlaylistMetadata {
  id: string;
  name: string;
  total: number;
  // Null entries count toward pagination and are reported as unavailable songs/local files/episodes.
  tracks: (SpotifyTrackMetadata | null)[];
}

export interface SpotifyPlaylistSource {
  getPlaylist(link: string, signal: AbortSignal): Promise<SpotifyPlaylistMetadata>;
}

export function parseSpotifyLink(value: unknown): { id: string } | { shortUrl: string } {
  const invalid = () => new AppError('Paste a valid Spotify playlist link, such as https://open.spotify.com/playlist/…', 400, 'INVALID_SPOTIFY_LINK');
  if (typeof value !== 'string' || value.length > 2048) throw invalid();
  const input = value.trim();
  const uri = /^spotify:playlist:([a-zA-Z0-9]{22})$/.exec(input);
  if (uri) return { id: uri[1] };
  let url: URL;
  try { url = new URL(input); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw invalid();
  if (url.hostname === 'spotify.link' && /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) {
    return { shortUrl: `${url.origin}${url.pathname}` };
  }
  if (url.hostname !== 'open.spotify.com') throw invalid();
  const match = /^\/(?:intl-[a-zA-Z-]+\/)?(?:embed\/|user\/[^/]+\/)?playlist\/([a-zA-Z0-9]{22})\/?$/.exec(url.pathname);
  if (!match) throw invalid();
  return { id: match[1] };
}

export function parseSpotifyPage(body: unknown, id: string): { name: string; total: number; items: unknown[]; revision: string } {
  const response = object(body);
  if (Array.isArray(response.errors) && response.errors.length) throw unavailable();
  const data = object(response.data);
  const playlist = object(data.playlistV2);
  if (data.playlistV2 === null || playlist.__typename === 'NotFound' || playlist.__typename === 'GenericError') throw inaccessible();
  const content = object(playlist.content);
  if (playlist.uri !== `spotify:playlist:${id}` || !text(playlist.name) ||
      !Number.isSafeInteger(content.totalCount) || Number(content.totalCount) < 0 || !Array.isArray(content.items)) throw unavailable();
  return { name: text(playlist.name), total: Number(content.totalCount), items: content.items, revision: text(playlist.revisionId) };
}

export function parseSpotifyTrack(item: unknown): SpotifyTrackMetadata | null {
  const track = object(object(object(item).itemV2).data);
  if (track.__typename !== 'Track') return null;
  const id = /^spotify:track:([a-zA-Z0-9]{22})$/.exec(text(track.uri))?.[1];
  const title = text(track.name).slice(0, 300);
  const artistItems = object(track.artists).items;
  const artists = Array.isArray(artistItems)
    ? artistItems.map(artist => text(object(object(artist).profile).name)).filter(Boolean).slice(0, 20) : [];
  if (!id || !title || !artists.length) return null;
  const duration = object(track.trackDuration).totalMilliseconds;
  return { id, title, artists, durationMs: typeof duration === 'number' && Number.isFinite(duration) ? Math.max(0, duration) : 0,
    album: text(object(track.albumOfTrack).name).slice(0, 300) };
}

export class SpotifyPlaylistProvider implements SpotifyPlaylistSource {
  private token: { value: string; expires: number } | null = null;

  private async request(url: string, signal: AbortSignal, config: AxiosRequestConfig = {}) {
    signal.throwIfAborted();
    try {
      const response = await axios.get(url, {
        timeout: 15_000, maxRedirects: 0, maxContentLength: 3 * 1024 * 1024,
        validateStatus: () => true, signal,
        ...config,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en', ...config.headers },
      });
      if (response.status === 429) throw new AppError('Spotify is busy. Please wait a few minutes before importing again.', 503, 'SPOTIFY_RATE_LIMITED');
      return response;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof AppError) throw error;
      // Never expose Axios errors: request headers contain the anonymous bearer token.
      throw unavailable();
    }
  }

  private async getToken(signal: AbortSignal): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const response = await this.request('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', signal, { responseType: 'text' });
    if (response.status !== 200 || typeof response.data !== 'string') throw unavailable();
    const match = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(response.data);
    if (!match) throw unavailable();
    let nextData: unknown;
    try { nextData = JSON.parse(match[1]); } catch { throw unavailable(); }
    const state = object(object(object(nextData).props).pageProps).state;
    const session = object(object(object(state).settings).session);
    const value = text(session.accessToken);
    const expires = Number(session.accessTokenExpirationTimestampMs);
    if (!value || !Number.isFinite(expires) || expires <= Date.now() || session.isAnonymous !== true) throw unavailable();
    this.token = { value, expires };
    return value;
  }

  private async resolveId(link: string, signal: AbortSignal): Promise<string> {
    let parsed = parseSpotifyLink(link);
    for (let redirects = 0; redirects < 4; redirects++) {
      if ('id' in parsed) return parsed.id;
      const response = await this.request(parsed.shortUrl, signal, { responseType: 'text' });
      const location = response.headers.location;
      if (![301, 302, 303, 307, 308].includes(response.status) || typeof location !== 'string') break;
      // Each hop is validated before fetching; arbitrary user URLs and redirect hosts are never fetched.
      parsed = parseSpotifyLink(new URL(location, parsed.shortUrl).href);
    }
    if ('id' in parsed) return parsed.id;
    throw new AppError('This short link could not be resolved. Copy the full open.spotify.com playlist link instead.', 422);
  }

  private async page(id: string, offset: number, signal: AbortSignal) {
    const params = new URLSearchParams({
      operationName: 'fetchPlaylist',
      variables: JSON.stringify({ uri: `spotify:playlist:${id}`, offset, limit: PAGE_SIZE, enableWatchFeedEntrypoint: false }),
      extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PLAYLIST_QUERY_HASH } }),
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken(signal);
      const response = await this.request(`https://api-partner.spotify.com/pathfinder/v1/query?${params}`, signal,
        { headers: { Authorization: `Bearer ${token}`, 'app-platform': 'WebPlayer' } });
      if (response.status === 401 && attempt === 0) { this.token = null; continue; }
      if (response.status === 404) throw inaccessible();
      if (response.status !== 200) throw unavailable();
      return parseSpotifyPage(response.data, id);
    }
    throw unavailable();
  }

  async getPlaylist(link: string, signal: AbortSignal): Promise<SpotifyPlaylistMetadata> {
    const id = await this.resolveId(link, signal);
    const first = await this.page(id, 0, signal);
    if (first.total > MAX_SPOTIFY_PLAYLIST_ITEMS) {
      throw new AppError(`This playlist has ${first.total} entries. Soundrift supports up to ${MAX_SPOTIFY_PLAYLIST_ITEMS} songs per playlist. Split it into smaller playlists before importing.`, 422, 'PLAYLIST_TOO_LARGE');
    }
    const tracks: (SpotifyTrackMetadata | null)[] = [];
    const seenEntries = new Set<string>();
    let page = first;
    while (true) {
      signal.throwIfAborted();
      if (page.total !== first.total || page.name !== first.name || page.revision !== first.revision) {
        throw new AppError('The Spotify playlist changed during import. Please try again.', 409);
      }
      if (page.items.length > PAGE_SIZE || tracks.length + page.items.length > first.total || (!page.items.length && tracks.length < first.total)) throw unavailable();
      for (const item of page.items) {
        const uid = text(object(item).uid);
        if (uid && seenEntries.has(uid)) throw unavailable();
        if (uid) seenEntries.add(uid);
        tracks.push(parseSpotifyTrack(item));
      }
      if (tracks.length === first.total) break;
      page = await this.page(id, tracks.length, signal);
    }
    return { id, name: first.name, total: first.total, tracks };
  }
}
