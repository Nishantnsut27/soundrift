import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SpotifyPlaylistProvider, type SpotifyPlaylistMetadata } from '../providers/spotifyPlaylistProvider.js';
import { SpotifyImportService, type SpotifyImportResult } from '../services/spotifyImportService.js';
import { MusicService } from '../services/musicService.js';
import type { Song } from '../models/music.model.js';

// Read-only diagnostic: preparation never saves a playlist. Cached public metadata is gitignored.
const link = process.argv[2];
if (!link) throw new Error('Pass a public Spotify playlist URL.');
const label = process.argv[3] || 'current';
const cacheFile = 'spotify-import-audit.tmp';
interface Audit { link: string; source: SpotifyPlaylistMetadata; queries: Record<string, Song[]>; results: Record<string, SpotifyImportResult> }
let audit: Audit;
if (existsSync(cacheFile) && (JSON.parse(readFileSync(cacheFile, 'utf8')) as Audit).link === link) {
  audit = JSON.parse(readFileSync(cacheFile, 'utf8')) as Audit;
} else {
  const source = await new SpotifyPlaylistProvider().getPlaylist(link, AbortSignal.timeout(90_000));
  audit = { link, source, queries: {}, results: {} };
}
const music = new MusicService();
const save = () => writeFileSync(cacheFile, JSON.stringify(audit));
save();
const service = new SpotifyImportService({ getPlaylist: async () => audit.source }, async query => {
  const key = `recordings:${query}`;
  if (!Object.hasOwn(audit.queries, key)) {
    audit.queries[key] = (await music.search(query, 30, { preserveRecordings: true })).songs;
    save();
  }
  return audit.queries[key];
});
console.log(`Checking ${audit.source.name}: ${audit.source.total} entries (${label}).`);
const result = await service.prepare(link, AbortSignal.timeout(10 * 60_000), progress => {
  if (progress.processed && progress.processed % 30 === 0) console.log(`Checked ${progress.processed}/${progress.total}`);
});
audit.results[label] = result;
save();
console.log(JSON.stringify({ label, total: result.total, matched: result.playlist.tracks.length, duplicates: result.duplicates,
  missing: result.missing }, null, 2));
