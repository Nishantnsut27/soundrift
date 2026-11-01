import { SpotifyPlaylistProvider } from '../providers/spotifyPlaylistProvider.js';
import { SpotifyImportService } from '../services/spotifyImportService.js';

// Read-only deployment smoke check. Never prints the anonymous session or creates a playlist.
const link = process.argv[2] || 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
try {
  const playlist = await new SpotifyPlaylistProvider().getPlaylist(link, AbortSignal.timeout(90_000));
  console.log(JSON.stringify({ name: playlist.name, total: playlist.total, retrieved: playlist.tracks.length,
    songs: playlist.tracks.filter(Boolean).length, sample: playlist.tracks.filter(Boolean).slice(0, 3) }, null, 2));
  if (process.argv.includes('--match-sample')) {
    const tracks = playlist.tracks.filter(Boolean).slice(0, 3);
    const service = new SpotifyImportService({ getPlaylist: async () => ({ ...playlist, total: tracks.length, tracks }) });
    const result = await service.prepare(link, AbortSignal.timeout(90_000), () => {});
    console.log(JSON.stringify({ matched: result.playlist.tracks.map(track => ({ title: track.name, artist: track.artist_name, provider: track.provider })),
      missing: result.missing }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Spotify smoke check failed.');
  process.exitCode = 1;
}
