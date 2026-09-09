import { GuestHome } from './GuestHome';
import { SearchPage } from './SearchPage';
import { DiscoverPage } from './DiscoverPage';
import { TrendingPage } from './TrendingPage';
import { GuestRoutePreview } from './GuestRoutePreview';
import { usePlayerStore } from '../store/playerStore';
import { isGuestPreviewRoute } from '../config/guestRoutes';

/**
 * Routes the guest experience.
 *
 * One place decides what each guest route renders, so the six navigation items
 * cannot silently become six copies of Home again. Today: Home answers "what
 * should I listen to", Search is the dedicated search page shared with signed-in
 * listeners, Discover is the exploration surface, Trending is the ranking, and
 * the remaining routes show an honest preview. Building any of them later means
 * swapping one branch here.
 */
export function GuestExperience() {
  const currentView = usePlayerStore((state) => state.currentView);

  if (currentView === 'search') return <SearchPage />;
  if (currentView === 'discover') return <DiscoverPage />;
  if (currentView === 'trending') return <TrendingPage />;
  if (isGuestPreviewRoute(currentView)) return <GuestRoutePreview view={currentView} />;
  return <GuestHome />;
}
