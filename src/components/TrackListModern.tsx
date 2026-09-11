import { useState, useEffect } from 'react';
import type { QueueContext, Track } from '../types/types';
import { usePlayerStore } from '../store/playerStore';
import { useToastStore } from '../store/toastStore';
import { ConfirmModal } from './ConfirmModal';
import { SkeletonTrackList, SkeletonGuestCardsGrid } from './Skeletons';
import { EmptySearchResults, EmptyState } from './EmptyState';
import { ErrorDisplay } from './ErrorDisplay';
import { useAuthStore } from '../store/authStore';
import { TrackItemModern } from './TrackItemModern';
import { TrackContextMenu } from './TrackContextMenu';
import { MusicCard } from './MusicCard';

interface TrackListProps {
  tracks: Track[];
  title?: string;
  showAddToPlaylist?: boolean;
  isLoading?: boolean;
  error?: string | null;
  playlistId?: string;
  /** The order to play through, when it differs from the rows on screen. */
  playQueue?: Track[];
  /**
   * Marks this list as a collection, which makes Next walk it to the end instead
   * of handing over to the suggestion radio. Omit it on a list that is a set of
   * loose results — search, Home, Trending — where each row is its own thing.
   * Lists rendered for one of the listener's own playlists derive this from
   * `playlistId` and need not pass it.
   */
  queueContext?: QueueContext;
  /**
   * 'auto' keeps the existing split: artwork cards for guests, rows for signed-in
   * users. 'list' forces compact rows for both, which is what search results want
   * — a result list needs density and a stable row height, not a wall of cards.
   */
  variant?: 'auto' | 'list';
  /**
   * Makes the rows movable. Only lists whose order belongs to the listener — a
   * playlist — pass this; everywhere else the order is the catalogue's and a
   * handle would promise something the surface cannot keep.
   */
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export function TrackListModern({
  tracks,
  title,
  showAddToPlaylist = true,
  isLoading = false,
  error = null,
  playlistId,
  playQueue,
  queueContext,
  variant = 'auto',
  onReorder,
}: TrackListProps) {
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [removingFromPlaylist, setRemovingFromPlaylist] = useState<string | null>(null);
  const [trackToRemove, setTrackToRemove] = useState<Track | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState('');
  const addToast = useToastStore((state) => state.addToast);
  const { isAuthenticated } = useAuthStore();
  const {
    playTrack,
    pauseTrack,
    setIsPlaying,
    currentTrack,
    isPlaying,
    playlists,
    removeTrackFromPlaylist,
    addToFavorites,
    removeFromFavorites,
    favorites
  } = usePlayerStore();

  /**
   * What Next means after this list. Passed explicitly by album and catalogue
   * pages; derived for the listener's own playlists, which already pass
   * `playlistId` so a row can offer "remove from playlist".
   */
  const resolvedContext: QueueContext = queueContext
    ?? (playlistId
      ? { kind: 'playlist', id: playlistId, name: playlists.find(p => p.id === playlistId)?.name || 'Playlist' }
      : { kind: 'single' });

  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        pauseTrack();
      } else {
        setIsPlaying(true);
      }
      return;
    }

    /* Only a collection becomes the queue. A row in a set of loose results — a
       search hit, a card on Home — still plays alone and still gets a radio. */
    if (resolvedContext.kind === 'single') {
      playTrack(track);
      return;
    }

    const list = playQueue ?? tracks;
    playTrack(track, list, list.findIndex(t => String(t.id) === String(track.id)), resolvedContext);
  };

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

  const moveTrack = (fromIndex: number, toIndex: number) => {
    if (!onReorder) return;
    if (toIndex < 0 || toIndex >= tracks.length || fromIndex === toIndex) return;
    onReorder(fromIndex, toIndex);
    setReorderAnnouncement(`${tracks[fromIndex].name} moved to position ${toIndex + 1} of ${tracks.length}`);
  };

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
              menu={
                <TrackContextMenu
                  track={track}
                  onPlay={handlePlayTrack}
                  showAddToPlaylist={showAddToPlaylist}
                  playlistId={playlistId}
                  onRemoveFromPlaylist={playlistId ? handleRemoveFromPlaylist : undefined}
                />
              }
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
              reorder={
                onReorder
                  ? {
                    total: tracks.length,
                    isDragging: draggingIndex === index,
                    isDropTarget: dropIndex === index && draggingIndex !== index,
                    onMove: moveTrack,
                    onDragStart: setDraggingIndex,
                    onDragEnd: () => { setDraggingIndex(null); setDropIndex(null); },
                    onDragOver: setDropIndex,
                    onDrop: (targetIndex: number) => {
                      if (draggingIndex !== null) moveTrack(draggingIndex, targetIndex);
                      setDraggingIndex(null);
                      setDropIndex(null);
                    },
                  }
                  : undefined
              }
              onPlay={handlePlayTrack}
              onToggleFavorite={handleToggleFavorite}
              onRemoveFromPlaylist={handleRemoveFromPlaylist}
              onMouseEnter={(id: string) => { setHoveredTrack(id); setHoveredIndex(index); }}
            />
          ))}
        </div>
      )}

      {onReorder && (
        <p className="visually-hidden" role="status" aria-live="polite">{reorderAnnouncement}</p>
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
