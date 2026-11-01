import type { Song } from '../models/music.model.js';
import { SpotifyPlaylistProvider, type SpotifyPlaylistSource, type SpotifyTrackMetadata } from '../providers/spotifyPlaylistProvider.js';
import { AppError } from '../utils/AppError.js';
import { findSpotifySongMatch, spotifySearchQueries } from '../utils/spotifySongMatcher.js';
import { MusicService } from './musicService.js';

export interface ImportProgress {
  phase: 'retrieving' | 'matching';
  processed: number;
  total: number;
}

export interface SpotifyImportResult {
  playlist: { name: string; tracks: Song[] };
  total: number;
  duplicates: number;
  missing: { title: string; artist: string; reason: 'unavailable' | 'not_found' | 'search_failed' }[];
}

type CatalogueSearch = (query: string) => Promise<Song[]>;
const music = new MusicService();

export class SpotifyImportService {
  constructor(
    private source: SpotifyPlaylistSource = new SpotifyPlaylistProvider(),
    private search: CatalogueSearch = async query => (await music.search(query, 30, { preserveRecordings: true })).songs,
  ) {}

  private async match(track: SpotifyTrackMetadata, signal: AbortSignal): Promise<Song | null> {
    const queries = spotifySearchQueries(track);
    for (const query of queries) {
      signal.throwIfAborted();
      const songs = await this.search(query.slice(0, 180));
      signal.throwIfAborted();
      const match = findSpotifySongMatch(track, songs);
      if (match) return match;
    }
    return null;
  }

  async prepare(link: string, signal: AbortSignal, progress: (value: ImportProgress) => void): Promise<SpotifyImportResult> {
    progress({ phase: 'retrieving', processed: 0, total: 0 });
    const source = await this.source.getPlaylist(link, signal);
    signal.throwIfAborted();
    if (source.tracks.length !== source.total) throw new AppError('The complete Spotify playlist could not be retrieved. Please try again.', 502);
    if (!source.total) throw new AppError('This Spotify playlist is empty. Add songs before importing it.', 422);

    const results: (Song | null)[] = new Array(source.total).fill(null);
    const failures = new Set<number>();
    const matches = new Map<string, Promise<Song | null>>();
    let next = 0;
    let processed = 0;
    progress({ phase: 'matching', processed, total: source.total });
    const worker = async () => {
      while (next < source.total) {
        signal.throwIfAborted();
        const index = next++;
        const track = source.tracks[index];
        if (track) {
          try {
            let matching = matches.get(track.id);
            if (!matching) { matching = this.match(track, signal); matches.set(track.id, matching); }
            results[index] = await matching;
          } catch {
            signal.throwIfAborted();
            failures.add(index);
          }
        }
        signal.throwIfAborted();
        progress({ phase: 'matching', processed: ++processed, total: source.total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, source.total) }, worker));
    const tracks: Song[] = [];
    const seen = new Set<string>();
    const missing: SpotifyImportResult['missing'] = [];
    let duplicates = 0;
    results.forEach((song, index) => {
      if (!song) {
        const original = source.tracks[index];
        missing.push({ title: original?.title || `Unavailable item ${index + 1}`, artist: original?.artists.join(', ') || '',
          reason: !original ? 'unavailable' : failures.has(index) ? 'search_failed' : 'not_found' });
      } else if (seen.has(String(song.id))) {
        duplicates++;
      } else {
        seen.add(String(song.id));
        tracks.push(song);
      }
    });
    if (!tracks.length) throw new AppError(failures.size
      ? 'The music catalogue is unavailable. Please try importing again later.'
      : 'None of these songs could be matched in Soundrift. No playlist was created.', 422, 'NO_MATCHES');
    return { playlist: { name: source.name.slice(0, 100), tracks }, total: source.total, duplicates, missing };
  }
}
