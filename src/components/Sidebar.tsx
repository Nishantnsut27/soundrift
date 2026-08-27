import React, { useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { ConfirmModal } from './ConfirmModal';
import { PlaylistMenu } from './PlaylistMenu';
import type { Playlist } from '../types/types';

export function Sidebar() {
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showImportExport, setShowImportExport] = useState<string | null>(null);
  const addToast = useToastStore((state) => state.addToast);

  // Custom modal states
  const [playlistToDelete, setPlaylistToDelete] = useState<{ id: string; name: string } | null>(null);
  const [playlistToRename, setPlaylistToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const { isAuthenticated, user } = useAuthStore();
  const {
    currentView,
    setCurrentView,
    playlists,
    favorites,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    exportPlaylist,
    importPlaylist,
    isSidebarOpen,
    toggleSidebar,
    closeSidebar,
  } = usePlayerStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen && window.innerWidth <= 768) {
        closeSidebar();
      }
    };

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (!isSidebarOpen || window.innerWidth > 768) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.sidebar') || target.closest('.mobile-menu-toggle')) {
        return;
      }
      closeSidebar();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isSidebarOpen, closeSidebar]);

  const handleNavClick = (view: 'search' | 'favorites' | 'playlists' | 'recent') => {
    setCurrentView(view);
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlaylistName.trim()) {
      createPlaylist(newPlaylistName.trim());
      addToast({
        type: 'success',
        title: 'Playlist Created',
        message: `Created "${newPlaylistName.trim()}"`,
      });
      setNewPlaylistName('');
      setShowCreatePlaylist(false);
    }
  };

  const handleExportPlaylist = (id: string) => {
    const data = exportPlaylist(id);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playlist-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({
      type: 'info',
      title: 'Playlist Exported',
      message: 'Downloaded playlist JSON file',
    });
    setShowImportExport(null);
  };

  const handleImportPlaylist = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isJsonExtension = file.name.toLowerCase().endsWith('.json');
      const isJsonMime = !file.type || file.type === 'application/json' || file.type === 'text/json';

      if (!isJsonExtension || !isJsonMime) {
        addToast({
          type: 'error',
          title: 'Import Failed',
          message: 'Only .json playlist files are supported.',
        });
        e.target.value = '';
        setShowImportExport(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          try {
            importPlaylist(result);
            addToast({
              type: 'success',
              title: 'Playlist Imported',
              message: 'Successfully imported playlist.',
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to import playlist.';
            addToast({
              type: 'error',
              title: 'Import Failed',
              message: errorMsg,
            });
          }
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
    setShowImportExport(null);
  };

  const confirmDeletePlaylist = () => {
    if (playlistToDelete) {
      deletePlaylist(playlistToDelete.id);
      addToast({
        type: 'info',
        title: 'Playlist Deleted',
        message: `Deleted "${playlistToDelete.name}"`,
      });
      setPlaylistToDelete(null);
    }
  };

  const confirmRenamePlaylist = () => {
    if (playlistToRename && renameInput.trim()) {
      renamePlaylist(playlistToRename.id, renameInput.trim());
      addToast({
        type: 'success',
        title: 'Playlist Renamed',
        message: `Renamed to "${renameInput.trim()}"`,
      });
      setPlaylistToRename(null);
      setRenameInput('');
    }
  };

  return (
    <>
      {isSidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar} />}

      <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img
              src="/Favicon.png"
              alt="Soundrift Logo"
              width="32"
              height="32"
              className="sidebar-logo-icon"
            />
            <h2 className="sidebar-title" style={{ color: '#ffffff !important' }}>
              Soundrift
            </h2>
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="sidebar-nav">
          <ul className="sidebar-nav-list">
            <li>
              <button
                onClick={() => handleNavClick('search')}
                className={`sidebar-nav-item ${currentView === 'search' ? 'sidebar-nav-item-active' : ''}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                {isAuthenticated ? 'Home' : 'Discover & Search'}
              </button>
            </li>

            {isAuthenticated && (
              <>
                <li>
                  <button
                    onClick={() => handleNavClick('favorites')}
                    className={`sidebar-nav-item ${currentView === 'favorites' ? 'sidebar-nav-item-active' : ''}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={currentView === 'favorites' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    Favorites
                  </button>
                </li>

                <li>
                  <button
                    onClick={() => handleNavClick('recent')}
                    className={`sidebar-nav-item ${currentView === 'recent' ? 'sidebar-nav-item-active' : ''}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Recently Played
                  </button>
                </li>

              </>
            )}
          </ul>
        </nav>

        {/* Collapsible Library Section for Authenticated Users */}
        {isAuthenticated ? (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <button
                onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                className="library-toggle-btn"
                title="Toggle Library"
              >
                <span className="toggle-chevron" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isLibraryOpen ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  )}
                </span>
                <h3 className="sidebar-section-title" style={{ marginLeft: '4px' }}>Your Library</h3>
              </button>
              <button
                onClick={() => setShowCreatePlaylist(true)}
                className="btn btn-ghost btn-icon btn-sm"
                aria-label="Create playlist"
                title="Create new playlist"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {/* Create Playlist Inline Form */}
            {showCreatePlaylist && (
              <form onSubmit={handleCreatePlaylist} className="sidebar-create-form">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Playlist name"
                  className="input input-sm"
                  autoFocus
                />
                <div className="sidebar-form-actions">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!newPlaylistName.trim()}>
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreatePlaylist(false);
                      setNewPlaylistName('');
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Collapsible Playlist Items */}
            {isLibraryOpen && (
              <div className="sidebar-playlists">
                {playlists.length === 0 ? (
                  <p className="sidebar-empty">No custom playlists yet</p>
                ) : (
                  <ul className="sidebar-playlist-list">
                    {playlists.map((playlist) => (
                      <li key={playlist.id} className="sidebar-playlist-item">
                        <button
                          onClick={() => handleNavClick('playlists')}
                          className="sidebar-playlist-button"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <line x1="9" y1="9" x2="15" y2="9" />
                            <line x1="9" y1="13" x2="15" y2="13" />
                          </svg>
                          <span className="truncate">{playlist.name}</span>
                        </button>

                        <div className="sidebar-playlist-actions" style={{ position: 'relative' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowImportExport(showImportExport === playlist.id ? null : playlist.id);
                            }}
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label="More options"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>

                          <PlaylistMenu
                            playlist={playlist}
                            isOpen={showImportExport === playlist.id}
                            onClose={() => setShowImportExport(null)}
                            onRename={(p: Playlist) => {
                              setPlaylistToRename(p);
                              setRenameInput(p.name);
                            }}
                            onExport={(id: string) => handleExportPlaylist(id)}
                            onDelete={(p: Playlist) => setPlaylistToDelete(p)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Import Playlist button inside collapsible library */}
                <div className="sidebar-import" style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="sidebar-import-playlist" className="btn btn-secondary btn-sm w-full" style={{ fontSize: '0.8rem', gap: '0.4rem', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14,2 14,8 20,8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Import Playlist (JSON)
                  </label>
                  <input
                    id="sidebar-import-playlist"
                    type="file"
                    accept=".json"
                    onChange={handleImportPlaylist}
                    className="visually-hidden"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Guest Mode CTA Box */
          <div className="guest-sidebar-cta">
            <div className="cta-icon" role="img" aria-label="Music Note">🎵</div>
            <h4>Sync Your Music</h4>
            <p>Log in to save favorite tracks, create playlists, and sync across devices.</p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }))}
              className="btn btn-primary btn-sm w-full mt-2"
            >
              Sign In / Register
            </button>
          </div>
        )}

        {/* Dynamic Sidebar Footer & User Profile Stats */}
        <div className="sidebar-footer">
          {isAuthenticated && user ? (
            <div className="sidebar-user-stats-card">
              <div className="user-stats-header">
                <div className="stats-avatar-sm">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.fullName} className="stats-avatar-img" />
                  ) : (
                    <span>{user.fullName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="user-stats-info truncate">
                  <p className="user-stats-name truncate">{user.fullName}</p>
                </div>
              </div>
              <div className="user-stats-counters">
                <span>
                  <span role="img" aria-label="Favorites">❤️</span> {favorites.length} Favorites
                </span>
                <span>
                  <span role="img" aria-label="Playlists">📂</span> {playlists.length} Playlists
                </span>
              </div>
            </div>
          ) : (
            <p className="sidebar-attribution">
              Powered by <span style={{ color: '#1ed760', fontWeight: 600 }}>Soundrift Engine</span>
              <br />
              <span className="text-muted">(Guest Discovery Mode)</span>
            </p>
          )}
        </div>
      </aside>

      {/* Delete Playlist Confirmation */}
      {playlistToDelete && (
        <ConfirmModal
          isOpen={!!playlistToDelete}
          title="Delete Playlist"
          message={`Are you sure you want to delete "${playlistToDelete.name}"? This action cannot be undone.`}
          confirmText="Delete Playlist"
          cancelText="Cancel"
          variant="danger"
          onConfirm={confirmDeletePlaylist}
          onCancel={() => setPlaylistToDelete(null)}
        />
      )}

      {/* Rename Playlist Modal */}
      {playlistToRename && (
        <ConfirmModal
          isOpen={!!playlistToRename}
          title="Rename Playlist"
          message="Enter a new name for your playlist:"
          confirmText="Save Name"
          cancelText="Cancel"
          variant="primary"
          showInput={true}
          inputValue={renameInput}
          inputPlaceholder="Playlist name"
          onInputChange={setRenameInput}
          onConfirm={confirmRenamePlaylist}
          onCancel={() => {
            setPlaylistToRename(null);
            setRenameInput('');
          }}
        />
      )}
    </>
  );
}
