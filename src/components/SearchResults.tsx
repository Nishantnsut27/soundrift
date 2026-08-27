import { TrackListModern } from './TrackListModern';
import { usePlayerStore } from '../store/playerStore';
import type { Track } from '../types/types';

export function SearchResults({ tracks, query, isLoading, error }: { tracks: Track[]; query: string; isLoading: boolean; error?: string | null }) {
  const playlists = usePlayerStore(state => state.playlists);
  const search = (value: string) => window.dispatchEvent(new CustomEvent('music-search', { detail: value }));
  if (isLoading) return <TrackListModern tracks={[]} title="Searching" isLoading />;
  if (error) return <TrackListModern tracks={[]} error={error} />;
  if (!tracks.length) return <div className="search-empty"><h2>No results found</h2><p>Check your spelling, try another artist, or browse trending music below.</p><button type="button" onClick={() => usePlayerStore.getState().clearResults()}>Browse trending</button></div>;
  const artists = unique(tracks, track => track.artist_name).slice(0, 5);
  const albums = unique(tracks.filter(track => track.album_name), track => track.album_name).slice(0, 5);
  const matchedPlaylists = playlists.filter(playlist => playlist.name.toLowerCase().includes(query.toLowerCase())).slice(0, 4);
  return <div className="search-results">
    <section><h2 className="search-section-title">Top result</h2><TrackListModern tracks={tracks.slice(0, 1)} startRelatedRadio showAddToPlaylist /></section>
    <section><TrackListModern tracks={tracks} title="Songs" startRelatedRadio showAddToPlaylist /></section>
    {artists.length > 0 && <section><h2 className="search-section-title">Artists</h2><div className="search-entity-grid">{artists.map(track => <button key={track.artist_id || track.artist_name} onClick={() => search(track.artist_name)}><img src={track.image || '/Favicon.png'} alt=""/><span>{track.artist_name}</span><small>Artist</small></button>)}</div></section>}
    {albums.length > 0 && <section><h2 className="search-section-title">Albums</h2><div className="search-entity-grid">{albums.map(track => <button key={track.album_id || track.album_name} onClick={() => search(track.album_name)}><img src={track.album_image || track.image || '/Favicon.png'} alt=""/><span>{track.album_name}</span><small>{track.artist_name}</small></button>)}</div></section>}
    {matchedPlaylists.length > 0 && <section><h2 className="search-section-title">Playlists</h2><div className="search-entity-grid">{matchedPlaylists.map(playlist => <button key={playlist.id} onClick={() => usePlayerStore.getState().setCurrentView('playlists')}><img src={playlist.tracks[0]?.image || '/Favicon.png'} alt=""/><span>{playlist.name}</span><small>{playlist.tracks.length} songs</small></button>)}</div></section>}
  </div>;
}
function unique(tracks: Track[], key: (track: Track) => string) { const seen = new Set<string>(); return tracks.filter(track => { const value = key(track).toLowerCase(); if (!value || seen.has(value)) return false; seen.add(value); return true; }); }
