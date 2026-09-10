import { useState } from 'react';
import { TrackListModern } from '../TrackListModern';
import { ConfirmModal } from '../ConfirmModal';
import { EmptyFavorites } from '../EmptyState';
import { usePlayerStore } from '../../store/playerStore';
import { useToastStore } from '../../store/toastStore';
import type { QueueContext } from '../../types/types';

const FAVORITES_CONTEXT: QueueContext = { kind: 'playlist', id: 'favorites', name: 'Favorites' };

export function FavoritesPage() {
  const favorites = usePlayerStore((state) => state.favorites);
  const clearFavorites = usePlayerStore((state) => state.clearFavorites);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const setCurrentView = usePlayerStore((state) => state.setCurrentView);
  const addToast = useToastStore((state) => state.addToast);

  const [isClearOpen, setIsClearOpen] = useState(false);

  const playAll = () => {
    if (favorites.length === 0) return;
    playTrack(favorites[0], favorites, 0, FAVORITES_CONTEXT);
  };

  const confirmClear = () => {
    clearFavorites();
    addToast({
      type: 'info',
      title: 'Favorites Cleared',
      message: 'Removed all tracks from your favorites.',
    });
    setIsClearOpen(false);
  };

  return (
    <div className="library-page">
      <header className="browse-head">
        <p className="t-eyebrow">My Library</p>
        <h1 className="t-h1">Favorites</h1>
        <p className="t-body browse-head-promise">
          {favorites.length === 0
            ? 'Songs you save with the heart land here.'
            : `${favorites.length} ${favorites.length === 1 ? 'song' : 'songs'} you saved.`}
        </p>

        {favorites.length > 0 && (
          <div className="library-head-actions">
            <button type="button" className="sr-btn sr-btn-primary" onClick={playAll}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="6 3 20 12 6 21" />
              </svg>
              Play all
            </button>
            <button
              type="button"
              className="sr-btn sr-btn-quiet"
              onClick={() => setIsClearOpen(true)}
            >
              Clear all
            </button>
          </div>
        )}
      </header>

      {favorites.length === 0 ? (
        <EmptyFavorites onBrowse={() => setCurrentView('home')} />
      ) : (
        <TrackListModern
          tracks={favorites}
          variant="list"
          showAddToPlaylist
          queueContext={FAVORITES_CONTEXT}
        />
      )}

      {isClearOpen && (
        <ConfirmModal
          isOpen={isClearOpen}
          title="Clear All Favorites"
          message="Are you sure you want to remove all tracks from your favorites?"
          confirmText="Clear All"
          cancelText="Cancel"
          variant="danger"
          onConfirm={confirmClear}
          onCancel={() => setIsClearOpen(false)}
        />
      )}
    </div>
  );
}
