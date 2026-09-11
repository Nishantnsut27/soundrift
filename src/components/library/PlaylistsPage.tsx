import { useState, type FormEvent } from 'react';
import { PlaylistMenu } from '../PlaylistMenu';
import { ConfirmModal } from '../ConfirmModal';
import { EmptyPlaylists } from '../EmptyState';
import { usePlayerStore } from '../../store/playerStore';
import { useToastStore } from '../../store/toastStore';
import type { Playlist } from '../../types/types';

const FALLBACK_ART = '/Favicon.png';

function playlistArtwork(playlist: Playlist): string {
  const withArt = playlist.tracks.find((track) => track.album_image || track.image);
  return withArt?.album_image || withArt?.image || FALLBACK_ART;
}

export function PlaylistsPage() {
  const playlists = usePlayerStore((state) => state.playlists);
  const openPlaylist = usePlayerStore((state) => state.openPlaylist);
  const createPlaylist = usePlayerStore((state) => state.createPlaylist);
  const deletePlaylist = usePlayerStore((state) => state.deletePlaylist);
  const renamePlaylist = usePlayerStore((state) => state.renamePlaylist);
  const exportPlaylist = usePlayerStore((state) => state.exportPlaylist);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const pauseTrack = usePlayerStore((state) => state.pauseTrack);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const queueContext = usePlayerStore((state) => state.queueContext);
  const addToast = useToastStore((state) => state.addToast);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [playlistToRename, setPlaylistToRename] = useState<Playlist | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);

  const activeId = queueContext.kind === 'playlist' ? queueContext.id : null;

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createPlaylist(name);
    addToast({ type: 'success', title: 'Playlist Created', message: `Created "${name}"` });
    setNewName('');
    setIsCreating(false);
  };

  const handlePlay = (playlist: Playlist) => {
    if (playlist.tracks.length === 0) {
      addToast({
        type: 'info',
        title: 'Playlist is empty',
        message: `Add songs to "${playlist.name}" before playing it.`,
      });
      return;
    }

    if (activeId === playlist.id) {
      if (isPlaying) pauseTrack();
      else setIsPlaying(true);
      return;
    }

    playTrack(playlist.tracks[0], playlist.tracks, 0, {
      kind: 'playlist',
      id: playlist.id,
      name: playlist.name,
    });
  };

  const handleExport = (id: string) => {
    const playlist = playlists.find((p) => p.id === id);
    if (!playlist) return;

    const blob = new Blob([exportPlaylist(id)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${playlist.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_playlist.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast({
      type: 'info',
      title: 'Playlist Exported',
      message: `Exported "${playlist.name}" JSON file`,
    });
    setOpenMenuId(null);
  };

  const confirmRename = () => {
    if (!playlistToRename || !renameInput.trim()) return;
    renamePlaylist(playlistToRename.id, renameInput.trim());
    addToast({
      type: 'success',
      title: 'Playlist Renamed',
      message: `Renamed to "${renameInput.trim()}"`,
    });
    setPlaylistToRename(null);
    setRenameInput('');
  };

  const confirmDelete = () => {
    if (!playlistToDelete) return;
    const { id, name } = playlistToDelete;
    deletePlaylist(id);
    addToast({ type: 'info', title: 'Playlist Deleted', message: `Deleted "${name}"` });
    setPlaylistToDelete(null);
  };

  return (
    <div className="library-page">
      <header className="browse-head">
        <p className="t-eyebrow">My Library</p>
        <h1 className="t-h1">Playlists</h1>
        <p className="t-body browse-head-promise">
          {playlists.length === 0
            ? 'Collections you build yourself, in the order you want them.'
            : `${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}.`}
        </p>

        <div className="library-head-actions">
          {isCreating ? (
            <form className="library-create-form" onSubmit={handleCreate}>
              <input
                type="text"
                className="input input-sm"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Playlist name"
                aria-label="New playlist name"
                autoFocus
              />
              <button type="submit" className="sr-btn sr-btn-primary sr-btn-sm" disabled={!newName.trim()}>
                Create
              </button>
              <button
                type="button"
                className="sr-btn sr-btn-quiet sr-btn-sm"
                onClick={() => {
                  setIsCreating(false);
                  setNewName('');
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" className="sr-btn sr-btn-primary" onClick={() => setIsCreating(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New playlist
            </button>
          )}
        </div>
      </header>

      {playlists.length === 0 ? (
        <EmptyPlaylists onCreate={() => setIsCreating(true)} />
      ) : (
        <div className="browse-card-grid">
          {playlists.map((playlist) => {
            const isActive = activeId === playlist.id;
            const showPause = isActive && isPlaying;

            return (
              <article key={playlist.id} className={`browse-card${isActive ? ' is-current' : ''}`}>
                <div className="browse-card-art">
                  <button
                    type="button"
                    className="browse-card-open"
                    onClick={() => openPlaylist(playlist.id)}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <img
                      src={playlistArtwork(playlist)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        const image = event.currentTarget;
                        if (image.src.endsWith(FALLBACK_ART)) return;
                        image.src = FALLBACK_ART;
                      }}
                    />
                  </button>

                  <button
                    type="button"
                    className="browse-card-play"
                    onClick={() => handlePlay(playlist)}
                    aria-label={showPause ? `Pause ${playlist.name}` : `Play ${playlist.name}`}
                  >
                    {showPause ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="6 3 20 12 6 21" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="library-card-foot">
                  <button
                    type="button"
                    className="browse-card-label"
                    onClick={() => openPlaylist(playlist.id)}
                    aria-label={`Open the playlist ${playlist.name}`}
                  >
                    <span className="browse-card-name truncate" title={playlist.name}>{playlist.name}</span>
                    <span className="browse-card-meta t-micro truncate">
                      {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
                    </span>
                  </button>

                  <div className="library-card-menu">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => setOpenMenuId(openMenuId === playlist.id ? null : playlist.id)}
                      aria-label={`More options for ${playlist.name}`}
                      aria-expanded={openMenuId === playlist.id}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="12" cy="5" r="1" />
                        <circle cx="12" cy="19" r="1" />
                      </svg>
                    </button>

                    <PlaylistMenu
                      playlist={playlist}
                      isOpen={openMenuId === playlist.id}
                      onClose={() => setOpenMenuId(null)}
                      onRename={(target: Playlist) => {
                        setPlaylistToRename(target);
                        setRenameInput(target.name);
                      }}
                      onExport={handleExport}
                      onDelete={(target: Playlist) => setPlaylistToDelete(target)}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {playlistToRename && (
        <ConfirmModal
          isOpen={!!playlistToRename}
          title="Rename Playlist"
          message={`Enter a new name for "${playlistToRename.name}":`}
          confirmText="Save Name"
          cancelText="Cancel"
          variant="primary"
          showInput
          inputValue={renameInput}
          inputPlaceholder="Playlist name"
          onInputChange={setRenameInput}
          onConfirm={confirmRename}
          onCancel={() => {
            setPlaylistToRename(null);
            setRenameInput('');
          }}
        />
      )}

      {playlistToDelete && (
        <ConfirmModal
          isOpen={!!playlistToDelete}
          title="Delete Playlist"
          message={`Are you sure you want to delete "${playlistToDelete.name}"? This action cannot be undone.`}
          confirmText="Delete Playlist"
          cancelText="Cancel"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setPlaylistToDelete(null)}
        />
      )}
    </div>
  );
}
