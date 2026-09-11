import { GuestHome } from './GuestHome';
import { SearchPage } from './SearchPage';
import { DiscoverPage } from './DiscoverPage';
import { TrendingPage } from './TrendingPage';
import { NewReleasesPage } from './NewReleasesPage';
import { GenresPage } from './GenresPage';
import { GenrePage } from './GenrePage';
import { AlbumPage } from './AlbumPage';
import { usePlayerStore } from '../store/playerStore';

/**
 * Routes the guest experience.
 *
 * One place decides what each guest route renders, so the navigation items
 * cannot silently become copies of Home again. Home answers "what should I
 * listen to", Search is the dedicated search page shared with signed-in
 * listeners, Discover is the exploration surface, Trending is the ranking, New
 * Releases is freshness, and Genres is category browsing.
 *
 * Album and genre are entity routes rather than navigation items: they carry an
 * id in `detailEntity` and are reached by opening something, so they fall back to
 * Home if that slot is somehow empty.
 */
export function GuestExperience() {
  const currentView = usePlayerStore((state) => state.currentView);
  const detailEntity = usePlayerStore((state) => state.detailEntity);

  if (currentView === 'search') return <SearchPage />;
  if (currentView === 'discover') return <DiscoverPage />;
  if (currentView === 'trending') return <TrendingPage />;
  if (currentView === 'new-releases') return <NewReleasesPage />;
  if (currentView === 'genres') return <GenresPage />;
  if (currentView === 'genre' && detailEntity?.kind === 'genre') {
    return <GenrePage genreId={detailEntity.id} />;
  }
  if (currentView === 'album' && detailEntity?.kind === 'album') {
    return <AlbumPage albumId={detailEntity.id} />;
  }
  return <GuestHome />;
}
