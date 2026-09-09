import React, { memo } from 'react';
import type { Track } from '../types/types';
import { formatDuration, formatArtistNames } from '../utils/formatters';
import { AudioVisualizer } from './AudioVisualizer';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';

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
  showPlaylistMenu: boolean;
  playlists: Array<{ id: string; name: string }>;
  addingToPlaylist: string | null;
  newPlaylistName: string;
  showCreatePlaylist: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onPlay: (track: Track, index: number) => void;
  onToggleFavorite: (track: Track) => void;
  onRemoveFromPlaylist: (track: Track) => void;
  onMouseEnter: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onCreatePlaylist: (track?: Track) => void;
  onShowCreatePlaylist: (show: boolean) => void;
  onNewPlaylistNameChange: (name: string) => void;
  isTrackInPlaylist: (track: Track, playlistId: string) => boolean;
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
  showPlaylistMenu,
  playlists,
  addingToPlaylist,
  newPlaylistName,
  showCreatePlaylist,
  menuRef,
  onPlay,
  onToggleFavorite,
  onRemoveFromPlaylist,
  onMouseEnter,
  onToggleMenu,
  onAddToPlaylist,
  onCreatePlaylist,
  onShowCreatePlaylist,
  onNewPlaylistNameChange,
  isTrackInPlaylist,
}: TrackItemModernProps) {
  const { isAuthenticated } = useAuthStore();
  return (
    <div
      className={`track-item-modern ${isCurrent ? 'active' : ''} ${blurLevel > 0 ? 'blurred' : ''} ${isRemoving ? 'removing' : ''} ${showPlaylistMenu ? 'menu-open' : ''}`}
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
      data-blur-level={blurLevel}
      style={{
        opacity: isRemoving ? 0.5 : blurLevel === 1 ? 0.9 : blurLevel === 2 ? 0.75 : blurLevel >= 3 ? 0.55 : 1,
        filter: blurLevel === 1 ? 'blur(1px)' : blurLevel === 2 ? 'blur(2px)' : blurLevel >= 3 ? 'blur(4px)' : 'none',
        transform: isRemoving ? 'translateX(-10px) scale(0.98)' : blurLevel > 0 ? 'scale(0.99)' : 'translateX(0) scale(1)',
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: isRemoving ? 'none' : 'auto',
      }}
    >
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
        <p className="track-artist-modern">
          <button
            type="button"
            className="artist-link-modern"
            title={track.artist_name}
            onClick={(e) => {
              e.stopPropagation();
              if (track.artist_id) {
                usePlayerStore.getState().openArtist(track.artist_id);
              }
            }}
          >
            {formatArtistNames(track.artist_name)}
          </button>
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

        {showAddToPlaylist && isAuthenticated && (
          <div className="playlist-menu-container-modern">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu(track.id);
              }}
              className={`icon-button playlist-add-trigger ${showPlaylistMenu ? 'active' : ''}`}
              aria-label="Add to playlist"
              title="Add to playlist"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {showPlaylistMenu && (
              <div
                ref={menuRef}
                className="playlist-dropdown-modern"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="playlist-dropdown-header-modern">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  <span>Add to Playlist</span>
                </div>

                <div className="playlist-dropdown-list-modern">
                  {playlists.length === 0 ? (
                    <div className="playlist-dropdown-empty-modern">
                      No playlists created yet
                    </div>
                  ) : (
                    playlists.map((playlist) => {
                      const inPlaylist = isTrackInPlaylist(track, playlist.id);
                      const isAdding = addingToPlaylist === playlist.id;

                      return (
                        <button
                          key={playlist.id}
                          onClick={() => onAddToPlaylist(playlist.id, track)}
                          className={`playlist-dropdown-item-modern ${inPlaylist ? 'added' : ''}`}
                          disabled={inPlaylist || isAdding}
                        >
                          <div className="playlist-item-left">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 18V5l12-2v13" />
                              <circle cx="6" cy="18" r="3" />
                              <circle cx="18" cy="16" r="3" />
                            </svg>
                            <span className="playlist-name-text">{playlist.name}</span>
                          </div>
                          {inPlaylist ? (
                            <span className="added-badge-modern">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Added
                            </span>
                          ) : (
                            <span className="add-plus-badge">+</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="playlist-dropdown-footer-modern">
                  {!showCreatePlaylist ? (
                    <button
                      onClick={() => onShowCreatePlaylist(true)}
                      className="create-playlist-btn-modern"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Create Playlist
                    </button>
                  ) : (
                    <form 
                      className="create-playlist-form-modern" 
                      onSubmit={(e) => { 
                        e.preventDefault(); 
                        onCreatePlaylist(track); 
                      }}
                    >
                      <input
                        type="text"
                        value={newPlaylistName}
                        onChange={(e) => onNewPlaylistNameChange(e.target.value)}
                        placeholder="Playlist name..."
                        className="create-playlist-input-modern"
                        autoFocus
                      />
                      <div className="create-playlist-actions-modern">
                        <button 
                          type="submit" 
                          className="btn-save-modern" 
                          disabled={!newPlaylistName.trim()}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => onShowCreatePlaylist(false)}
                          className="btn-cancel-modern"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
