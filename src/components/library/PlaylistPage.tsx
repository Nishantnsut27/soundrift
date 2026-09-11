import { TrackListModern } from '../TrackListModern';
import { EmptyState } from '../EmptyState';
import { usePlayerStore } from '../../store/playerStore';
import type { QueueContext } from '../../types/types';

const FALLBACK_ART = '/Favicon.png';

interface PlaylistPageProps {
  playlistId: string;
}

function totalMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
}

export function PlaylistPage({ playlistId }: PlaylistPageProps) {
  const playlist = usePlayerStore((state) => state.playlists.find((p) => p.id === playlistId));
  const setCurrentView = usePlayerStore((state) => state.setCurrentView);
  const reorderPlaylistTracks = usePlayerStore((state) => state.reorderPlaylistTracks);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const pauseTrack = usePlayerStore((state) => state.pauseTrack);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isShuffling = usePlayerStore((state) => state.isShuffling);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const queueContext = usePlayerStore((state) => state.queueContext);

  if (!playlist) {
    return (
      <div className="library-page">
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="9" y1="9" x2="15" y2="9" />
              <line x1="9" y1="13" x2="15" y2="13" />
            </svg>
          }
          title="Playlist not found"
          description="This playlist may have been deleted or renamed."
          actionText="Back to playlists"
          onAction={() => setCurrentView('playlists')}
        />
      </div>
    );
  }

  const context: QueueContext = { kind: 'playlist', id: playlist.id, name: playlist.name };
  const isActive = queueContext.kind === 'playlist' && queueContext.id === playlist.id;
  const showPause = isActive && isPlaying;
  const duration = playlist.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
  const artworkSource = playlist.tracks.find((track) => track.album_image || track.image);
  const artwork = artworkSource?.album_image || artworkSource?.image || FALLBACK_ART;

  const handlePlay = () => {
    if (playlist.tracks.length === 0) return;
    if (isActive) {
      if (isPlaying) pauseTrack();
      else setIsPlaying(true);
      return;
    }
    playTrack(playlist.tracks[0], playlist.tracks, 0, context);
  };

  const handleShuffle = () => {
    if (playlist.tracks.length === 0) return;
    if (!isActive) playTrack(playlist.tracks[0], playlist.tracks, 0, context);
    if (!isShuffling) toggleShuffle();
  };

  return (
    <div className="library-page">
      <header className="playlist-detail-head">
        <img className="playlist-detail-art" src={artwork} alt="" loading="lazy" />

        <div className="playlist-detail-meta">
          <p className="t-eyebrow">Playlist</p>
          <h1 className="t-h1">{playlist.name}</h1>
          <p className="t-meta playlist-detail-stats">
            {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
            {duration > 0 ? ` · ${totalMinutes(duration)}` : ''}
          </p>

          {playlist.tracks.length > 0 && (
            <div className="library-head-actions">
              <button type="button" className="sr-btn sr-btn-primary" onClick={handlePlay}>
                {showPause ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="6 3 20 12 6 21" />
                  </svg>
                )}
                {showPause ? 'Pause' : 'Play'}
              </button>

              <button type="button" className="sr-btn sr-btn-outline" onClick={handleShuffle}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
                Shuffle
              </button>

              <button
                type="button"
                className="sr-btn sr-btn-quiet"
                onClick={() => setCurrentView('playlists')}
              >
                All playlists
              </button>
            </div>
          )}
        </div>
      </header>

      {playlist.tracks.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          }
          title="This playlist is empty"
          description="Use the ⋮ menu on any song to add it to this playlist."
          actionText="Find music"
          onAction={() => setCurrentView('search')}
        />
      ) : (
        <TrackListModern
          tracks={playlist.tracks}
          variant="list"
          showAddToPlaylist={false}
          playlistId={playlist.id}
          queueContext={context}
          onReorder={(from, to) => reorderPlaylistTracks(playlist.id, from, to)}
        />
      )}
    </div>
  );
}
