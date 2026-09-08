import { useState, useEffect, useRef } from 'react';
import type { Track } from '../types/types';
import { usePlayerStore } from '../store/playerStore';
import { useToastStore } from '../store/toastStore';
import { ConfirmModal } from './ConfirmModal';
import { SkeletonTrackList, SkeletonGuestCardsGrid } from './Skeletons';
import { EmptySearchResults, EmptyState } from './EmptyState';
import { ErrorDisplay } from './ErrorDisplay';
import { useAuthStore } from '../store/authStore';
import { TrackItemModern } from './TrackItemModern';
import { MusicCard } from './MusicCard';

interface TrackListProps {
  tracks: Track[];
  title?: string;
  showAddToPlaylist?: boolean;
  isLoading?: boolean;
  error?: string | null;
  playlistId?: string;
  playQueue?: Track[];
  startRelatedRadio?: boolean;
  /**
   * 'auto' keeps the existing split: artwork cards for guests, rows for signed-in
   * users. 'list' forces compact rows for both, which is what search results want
   * — a result list needs density and a stable row height, not a wall of cards.
   */
  variant?: 'auto' | 'list';
}

export function TrackListModern({
  tracks,
  title,
  showAddToPlaylist = true,
  isLoading = false,
  error = null,
  playlistId,
  variant = 'auto',
}: TrackListProps) {
  const [showPlaylistMenu, setShowPlaylistMenu] = useState<string | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);
  const [removingFromPlaylist, setRemovingFromPlaylist] = useState<string | null>(null);
  const [trackToRemove, setTrackToRemove] = useState<Track | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addToast = useToastStore((state) => state.addToast);
  const { isAuthenticated } = useAuthStore();
  const { 
    playTrack, 
    pauseTrack,
    setIsPlaying,
    currentTrack, 
    isPlaying,
    playlists,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    createPlaylist,
    addToFavorites,
    removeFromFavorites,
    favorites
  } = usePlayerStore();

  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        pauseTrack();
      } else {
        setIsPlaying(true);
      }
    } else {
      playTrack(track);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPlaylistMenu(null);
        setShowCreatePlaylist(false);
        setNewPlaylistName('');
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowPlaylistMenu(null);
        setShowCreatePlaylist(false);
        setNewPlaylistName('');
      }
    };

    if (showPlaylistMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showPlaylistMenu]);

  useEffect(() => {
    const handleOutsideTap = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('.track-list-container-modern')) {
        setHoveredTrack(null);
        setHoveredIndex(null);
      }
    };

    document.addEventListener('click', handleOutsideTap);
    document.addEventListener('touchstart', handleOutsideTap);
    return () => {
      document.removeEventListener('click', handleOutsideTap);
      document.removeEventListener('touchstart', handleOutsideTap);
    };
  }, []);

  const handleAddToPlaylist = async (pId: string, track: Track) => {
    setAddingToPlaylist(pId);
    addTrackToPlaylist(pId, track);
    const targetPlaylist = playlists.find(p => p.id === pId);

    addToast({
      type: 'success',
      title: 'Added to Playlist',
      message: `"${track.name}" added to ${targetPlaylist?.name || 'playlist'}`,
    });
    
    setTimeout(() => {
      setAddingToPlaylist(null);
      setShowPlaylistMenu(null);
    }, 500);
  };

  const handleCreatePlaylist = (track?: Track) => {
    if (newPlaylistName.trim()) {
      const created = createPlaylist(newPlaylistName.trim());
      if (track && created) {
        addTrackToPlaylist(created.id, track);
        addToast({
          type: 'success',
          title: 'Playlist Created & Song Added',
          message: `Created "${created.name}" and added "${track.name}"`,
        });
      } else {
        addToast({
          type: 'success',
          title: 'Playlist Created',
          message: `Created "${newPlaylistName.trim()}"`,
        });
      }
      setNewPlaylistName('');
      setShowCreatePlaylist(false);
      setShowPlaylistMenu(null);
    }
  };

  const handleRemoveFromPlaylist = (track: Track) => {
    if (playlistId) {
      setTrackToRemove(track);
    }
  };

  const confirmRemoveTrack = () => {
    if (trackToRemove && playlistId) {
      const trackId = trackToRemove.id;
      const trackName = trackToRemove.name;
      setRemovingFromPlaylist(trackId);
      removeTrackFromPlaylist(playlistId, trackId);
      addToast({
        type: 'info',
        title: 'Removed from Playlist',
        message: `"${trackName}" removed`,
      });
      setTrackToRemove(null);
      setTimeout(() => {
        setRemovingFromPlaylist(null);
      }, 300);
    }
  };

  const isTrackInPlaylist = (track: Track, pId: string) => {
    const playlist = playlists.find(p => p.id === pId);
    return playlist?.tracks.some(t => t.id === track.id) || false;
  };

  const handleToggleFavorite = (track: Track) => {
    const isFav = favorites.some(f => f.id === track.id);
    if (isFav) {
      removeFromFavorites(track.id);
      addToast({
        type: 'info',
        title: 'Removed from Favorites',
        message: `"${track.name}" removed from favorites`,
      });
    } else {
      addToFavorites(track);
      addToast({
        type: 'success',
        title: 'Added to Favorites',
        message: `"${track.name}" saved to favorites`,
      });
    }
  };

  const isCurrentTrack = (track: Track) => currentTrack?.id === track.id;
  const isFavorite = (track: Track) => favorites.some(f => f.id === track.id);
  const asRows = variant === 'list' || isAuthenticated;

  if (isLoading) {
    return (
      <div className="modern-track-list">
        {title && <h2 className="track-list-title-modern">{title}</h2>}
        {asRows ? (
          <SkeletonTrackList count={8} />
        ) : (
          <SkeletonGuestCardsGrid count={8} />
        )}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Music Temporarily Unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (tracks.length === 0) {
    const isSearching = usePlayerStore.getState().query.length > 0;
    return (
      <div className="modern-track-list">
        {title && <h2 className="track-list-title-modern">{title}</h2>}
        {isSearching ? (
          <EmptySearchResults
            onClear={() => {
              const store = usePlayerStore.getState();
              store.clearResults();
            }}
          />
        ) : (
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v3m0 16v3M1 12h3m16 0h3" />
              </svg>
            }
            title="No songs available"
            description="Explore our trending tracks or search for your favorite artists and genres."
            actionText="Browse Trending"
            onAction={() => {
              const store = usePlayerStore.getState();
              store.clearResults();
              store.setCurrentView('search');
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="modern-track-list">
      {title && <h2 className="track-list-title-modern">{title}</h2>}
      
      {!asRows ? (
        <div className="music-card-grid">
          {tracks.map((track, index) => (
            <MusicCard
              key={`${track.id}-${index}`}
              track={track}
              onPlay={handlePlayTrack}
              isCurrent={isCurrentTrack(track)}
              isPlaying={isPlaying}
            />
          ))}
        </div>
      ) : (
        <div 
          className={`track-list-container-modern ${hoveredTrack ? 'has-hovered-track' : ''}`}
          onMouseLeave={() => { setHoveredTrack(null); setHoveredIndex(null); }}
        >
          {tracks.map((track, index) => (
            <TrackItemModern
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              isCurrent={isCurrentTrack(track)}
              isPlaying={isPlaying}
              isFavorite={isFavorite(track)}
              isHovered={hoveredTrack === track.id}
              blurLevel={
                // A result list is for scanning, so the neighbour-blur focus effect
                // used on library pages is switched off here.
                variant === 'list'
                  ? 0
                  : hoveredIndex !== null && hoveredIndex !== index
                    ? Math.abs(hoveredIndex - index)
                    : 0
              }
              isRemoving={removingFromPlaylist === track.id}
              showAddToPlaylist={showAddToPlaylist}
              playlistId={playlistId}
              showPlaylistMenu={showPlaylistMenu === track.id}
              playlists={playlists}
              addingToPlaylist={addingToPlaylist}
              newPlaylistName={newPlaylistName}
              showCreatePlaylist={showCreatePlaylist}
              menuRef={menuRef}
              onPlay={handlePlayTrack}
              onToggleFavorite={handleToggleFavorite}
              onRemoveFromPlaylist={handleRemoveFromPlaylist}
              onMouseEnter={(id: string) => { setHoveredTrack(id); setHoveredIndex(index); }}
              onToggleMenu={(id) => setShowPlaylistMenu(showPlaylistMenu === id ? null : id)}
              onAddToPlaylist={handleAddToPlaylist}
              onCreatePlaylist={handleCreatePlaylist}
              onShowCreatePlaylist={setShowCreatePlaylist}
              onNewPlaylistNameChange={setNewPlaylistName}
              isTrackInPlaylist={isTrackInPlaylist}
            />
          ))}
        </div>
      )}

      {trackToRemove && (
        <ConfirmModal
          isOpen={!!trackToRemove}
          title="Remove Song from Playlist"
          message={`Are you sure you want to remove "${trackToRemove.name}" from this playlist?`}
          confirmText="Remove Song"
          cancelText="Cancel"
          variant="danger"
          onConfirm={confirmRemoveTrack}
          onCancel={() => setTrackToRemove(null)}
        />
      )}
    </div>
  );
}
