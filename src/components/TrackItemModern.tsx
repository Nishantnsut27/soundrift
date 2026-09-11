import { memo } from 'react';
import type { Track } from '../types/types';
import { formatDuration, formatArtistNames } from '../utils/formatters';
import { AudioVisualizer } from './AudioVisualizer';
import { TrackContextMenu } from './TrackContextMenu';
import { useAuthStore } from '../store/authStore';

function getTrackArtwork(track: Track): string {
  return track.album_image || track.image || '';
}

interface TrackItemModernProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  isHovered: boolean;
  blurLevel: number;
  isRemoving: boolean;
  showAddToPlaylist: boolean;
  playlistId?: string;
  reorder?: RowReorder;
  onPlay: (track: Track, index: number) => void;
  onToggleFavorite: (track: Track) => void;
  onRemoveFromPlaylist: (track: Track) => void;
  onMouseEnter: (id: string) => void;
}

/**
 * Everything a row needs to be moved within its list, bundled so enabling
 * reordering costs one prop rather than seven. Absent on lists whose order is
 * not the listener's to change.
 */
export interface RowReorder {
  total: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
}

export const TrackItemModern = memo(function TrackItemModern({
  track,
  index,
  isCurrent,
  isPlaying,
  isFavorite,
  blurLevel,
  isRemoving,
  showAddToPlaylist,
  playlistId,
  reorder,
  onPlay,
  onToggleFavorite,
  onRemoveFromPlaylist,
  onMouseEnter,
}: TrackItemModernProps) {
  const { isAuthenticated } = useAuthStore();
  return (
    <div
      className={`track-item-modern ${isCurrent ? 'active' : ''} ${blurLevel > 0 ? 'blurred' : ''} ${isRemoving ? 'removing' : ''} ${reorder?.isDragging ? 'is-dragging' : ''} ${reorder?.isDropTarget ? 'is-drop-target' : ''}`}
      onClick={() => onPlay(track, index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPlay(track, index);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Play ${track.name} by ${track.artist_name}`}
      onMouseEnter={() => onMouseEnter(track.id)}
      onDragOver={reorder ? (e) => { e.preventDefault(); reorder.onDragOver(index); } : undefined}
      onDrop={reorder ? (e) => { e.preventDefault(); reorder.onDrop(index); } : undefined}
      data-blur-level={blurLevel}
      style={{
        opacity: isRemoving ? 0.5 : blurLevel === 1 ? 0.9 : blurLevel === 2 ? 0.75 : blurLevel >= 3 ? 0.55 : 1,
        filter: blurLevel === 1 ? 'blur(1px)' : blurLevel === 2 ? 'blur(2px)' : blurLevel >= 3 ? 'blur(4px)' : 'none',
        transform: isRemoving ? 'translateX(-10px) scale(0.98)' : blurLevel > 0 ? 'scale(0.99)' : 'translateX(0) scale(1)',
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: isRemoving ? 'none' : 'auto',
      }}
    >
      {reorder && (
        <button
          type="button"
          className="track-reorder-handle"
          draggable
          onClick={(e) => e.stopPropagation()}
          onDragStart={() => reorder.onDragStart(index)}
          onDragEnd={reorder.onDragEnd}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              reorder.onMove(index, index - 1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              reorder.onMove(index, index + 1);
            }
          }}
          aria-label={`Reorder ${track.name}, position ${index + 1} of ${reorder.total}. Use arrow up and arrow down to move it.`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" />
            <circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" />
            <circle cx="15" cy="18" r="1.6" />
          </svg>
        </button>
      )}

      <div className="track-artwork-modern">
        <img
          src={getTrackArtwork(track)}
          alt={`${track.name} by ${track.artist_name}`}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = '/Favicon.png';
            e.currentTarget.onerror = null;
          }}
        />

        {isCurrent && (
          <div className="track-visualizer-overlay">
            <AudioVisualizer isPlaying={isPlaying} size="medium" barCount={5} />
          </div>
        )}
      </div>

      <div className="track-info-modern">
        <h4 className="track-title-modern">{track.name}</h4>
        <p className="track-artist-modern" title={track.artist_name}>
          {formatArtistNames(track.artist_name)}
        </p>
        {track.album_name && <p className="track-album-modern">{track.album_name}</p>}
        <div className="track-metadata-modern">
          <span className="track-duration-modern">{formatDuration(track.duration)}</span>
          {track.musicinfo?.tags?.genres && track.musicinfo.tags.genres.length > 0 && (
            <span className="track-genre-modern">{track.musicinfo.tags.genres[0]}</span>
          )}
        </div>
      </div>

      <div className="track-actions-modern">
        {isAuthenticated && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(track);
            }}
            className={`icon-button ${isFavorite ? 'active' : ''}`}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={isFavorite ? '#e22134' : 'none'}
              stroke={isFavorite ? '#e22134' : 'currentColor'}
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        )}

        {playlistId && isAuthenticated && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromPlaylist(track);
            }}
            className="icon-button remove-button"
            aria-label="Remove from playlist"
            disabled={isRemoving}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}

        <TrackContextMenu
          track={track}
          onPlay={() => onPlay(track, index)}
          showAddToPlaylist={showAddToPlaylist}
          playlistId={playlistId}
          onRemoveFromPlaylist={playlistId ? onRemoveFromPlaylist : undefined}
        />
      </div>
    </div>
  );
});
