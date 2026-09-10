import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Track } from '../types/types';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useQueueActions } from '../hooks/useQueueActions';
import { requireAuth } from '../utils/requireAuth';
import { formatArtistNames } from '../utils/formatters';

const MOBILE_BREAKPOINT = 768;

interface TrackContextMenuProps {
  track: Track;
  onPlay?: (track: Track) => void;
  onExplore?: (track: Track) => void;
  showAddToPlaylist?: boolean;
  playlistId?: string;
  onRemoveFromPlaylist?: (track: Track) => void;
  align?: 'left' | 'right';
}

export function TrackContextMenu({
  track,
  onPlay,
  onExplore,
  showAddToPlaylist = true,
  playlistId,
  onRemoveFromPlaylist,
  align = 'right',
}: TrackContextMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isPlaylistsOpen, setIsPlaylistsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false,
  );

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const playlists = usePlayerStore((state) => state.playlists);
  const favorites = usePlayerStore((state) => state.favorites);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const addToFavorites = usePlayerStore((state) => state.addToFavorites);
  const removeFromFavorites = usePlayerStore((state) => state.removeFromFavorites);
  const addTrackToPlaylist = usePlayerStore((state) => state.addTrackToPlaylist);
  const createPlaylist = usePlayerStore((state) => state.createPlaylist);
  const addToast = useToastStore((state) => state.addToast);
  const { addToQueue, playNext } = useQueueActions();

  const isFavorite = favorites.some((item) => String(item.id) === String(track.id));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const dismiss = () => {
      setIsOpen(false);
      setIsPlaylistsOpen(false);
      setIsCreating(false);
      setNewPlaylistName('');
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      dismiss();
      triggerRef.current?.focus();
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      dismiss();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isMobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isMobile]);

  useEffect(() => {
    if (!isOpen) return;
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[data-menu-item]');
    firstItem?.focus();
  }, [isOpen, isPlaylistsOpen]);

  function close() {
    setIsOpen(false);
    setIsPlaylistsOpen(false);
    setIsCreating(false);
    setNewPlaylistName('');
  }

  function closeAndRestoreFocus() {
    close();
    triggerRef.current?.focus();
  }

  function run(action: () => void) {
    action();
    closeAndRestoreFocus();
  }

  function handlePlay() {
    if (onPlay) onPlay(track);
    else playTrack(track);
  }

  function handleToggleFavorite() {
    if (!requireAuth('login')) return;

    if (isFavorite) {
      removeFromFavorites(track.id);
      addToast({ type: 'info', message: `Removed from favorites: ${track.name}` });
      return;
    }

    addToFavorites(track);
    addToast({ type: 'success', message: `Added to favorites: ${track.name}` });
  }

  function handleAddToPlaylist(targetId: string, targetName: string) {
    addTrackToPlaylist(targetId, track);
    addToast({ type: 'success', message: `Added to ${targetName}: ${track.name}` });
    closeAndRestoreFocus();
  }

  function handleCreatePlaylist() {
    const name = newPlaylistName.trim();
    if (!name) return;

    const created = createPlaylist(name);
    if (created) {
      addTrackToPlaylist(created.id, track);
      addToast({ type: 'success', message: `Created ${created.name} with ${track.name}` });
    }
    closeAndRestoreFocus();
  }

  function openPlaylists() {
    if (!requireAuth('login')) {
      close();
      return;
    }
    setIsPlaylistsOpen(true);
  }

  const items = (
    <div className="action-menu-body" role="menu" aria-label={`Actions for ${track.name}`}>
      {!isPlaylistsOpen ? (
        <>
          <button type="button" role="menuitem" data-menu-item className="action-menu-item" onClick={() => run(handlePlay)}>
            <PlayIcon />
            <span>Play</span>
          </button>

          <button type="button" role="menuitem" data-menu-item className="action-menu-item" onClick={() => run(() => playNext(track))}>
            <PlayNextIcon />
            <span>Play next</span>
          </button>

          <button type="button" role="menuitem" data-menu-item className="action-menu-item" onClick={() => run(() => addToQueue(track))}>
            <QueueIcon />
            <span>Add to queue</span>
          </button>

          {onExplore && (
            <button type="button" role="menuitem" data-menu-item className="action-menu-item" onClick={() => run(() => onExplore(track))}>
              <ExploreIcon />
              <span>Explore similar</span>
            </button>
          )}

          <div className="action-menu-divider" role="separator" />

          <button type="button" role="menuitem" data-menu-item className="action-menu-item" onClick={() => run(handleToggleFavorite)}>
            <HeartIcon filled={isAuthenticated && isFavorite} />
            <span>{isAuthenticated && isFavorite ? 'Remove from favorites' : 'Add to favorites'}</span>
          </button>

          {showAddToPlaylist && (
            <button
              type="button"
              role="menuitem"
              data-menu-item
              className="action-menu-item action-menu-item-submenu"
              aria-haspopup="menu"
              aria-expanded={isPlaylistsOpen}
              onClick={openPlaylists}
            >
              <PlusIcon />
              <span>Add to playlist</span>
              <ChevronIcon />
            </button>
          )}

          {playlistId && onRemoveFromPlaylist && (
            <button
              type="button"
              role="menuitem"
              data-menu-item
              className="action-menu-item action-menu-item-danger"
              onClick={() => run(() => onRemoveFromPlaylist(track))}
            >
              <MinusIcon />
              <span>Remove from this playlist</span>
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            data-menu-item
            className="action-menu-item action-menu-back"
            onClick={() => {
              setIsPlaylistsOpen(false);
              setIsCreating(false);
              setNewPlaylistName('');
            }}
          >
            <BackIcon />
            <span>Add to playlist</span>
          </button>

          <div className="action-menu-divider" role="separator" />

          <div className="action-menu-scroll">
            {playlists.length === 0 && !isCreating && (
              <p className="action-menu-empty">No playlists yet.</p>
            )}

            {playlists.map((playlist) => {
              const alreadyIn = playlist.tracks.some((item) => String(item.id) === String(track.id));
              return (
                <button
                  key={playlist.id}
                  type="button"
                  role="menuitem"
                  className="action-menu-item"
                  disabled={alreadyIn}
                  onClick={() => handleAddToPlaylist(playlist.id, playlist.name)}
                >
                  <span className="truncate">{playlist.name}</span>
                  {alreadyIn && <span className="action-menu-tag">Added</span>}
                </button>
              );
            })}
          </div>

          <div className="action-menu-divider" role="separator" />

          {isCreating ? (
            <form
              className="action-menu-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreatePlaylist();
              }}
            >
              <input
                type="text"
                className="action-menu-input"
                value={newPlaylistName}
                onChange={(event) => setNewPlaylistName(event.target.value)}
                placeholder="Playlist name"
                aria-label="New playlist name"
                autoFocus
              />
              <button type="submit" className="sr-btn sr-btn-primary sr-btn-sm" disabled={!newPlaylistName.trim()}>
                Create
              </button>
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="action-menu-item"
              onClick={() => setIsCreating(true)}
            >
              <PlusIcon />
              <span>New playlist</span>
            </button>
          )}
        </>
      )}
    </div>
  );

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className={`action-menu-trigger${isOpen ? ' is-open' : ''}`}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={isOpen ? menuId : undefined}
      aria-label={`More actions for ${track.name}`}
      onClick={(event) => {
        event.stopPropagation();
        setIsOpen((open) => !open);
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="12" cy="19" r="1.8" />
      </svg>
    </button>
  );

  return (
    <div
      className="action-menu-root"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {trigger}

      {isOpen && !isMobile && (
        <div
          ref={menuRef}
          id={menuId}
          className={`action-menu action-menu-${align}`}
        >
          {items}
        </div>
      )}

      {isOpen && isMobile && createPortal(
        <div className="action-menu-sheet-overlay" onClick={closeAndRestoreFocus}>
          <div
            ref={menuRef}
            id={menuId}
            className="action-menu-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="action-menu-sheet-handle" aria-hidden="true" />
            <div className="action-menu-sheet-header">
              <img
                className="action-menu-sheet-art"
                src={track.image || track.album_image || '/Favicon.png'}
                alt=""
              />
              <div className="action-menu-sheet-text">
                <p className="action-menu-sheet-title truncate">{track.name}</p>
                <p className="action-menu-sheet-artist truncate">{formatArtistNames(track.artist_name)}</p>
              </div>
            </div>
            {items}
            <button type="button" className="sr-btn sr-btn-quiet sr-btn-block" onClick={closeAndRestoreFocus}>
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="6 3 20 12 6 21" />
    </svg>
  );
}

function PlayNextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polygon points="4 4 13 12 4 20" fill="currentColor" stroke="none" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="3" y1="6" x2="15" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="11" y2="18" />
      <line x1="18" y1="14" x2="18" y2="22" />
      <line x1="14" y1="18" x2="22" y2="18" />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polygon points="15.5 8.5 10.5 10.5 8.5 15.5 13.5 13.5" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="action-menu-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
