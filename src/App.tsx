import { useEffect, useState, lazy, Suspense } from 'react';
import { SearchBar } from './components/SearchBar';
import { PlayerControls } from './components/PlayerControls';
import { QueuePanel } from './components/QueuePanel';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { withChunkReload } from './utils/chunkReload';

const PersonalizedHome = lazy(withChunkReload(() => import('./components/PersonalizedHome').then(m => ({ default: m.PersonalizedHome }))));
const GuestExperience = lazy(withChunkReload(() => import('./components/GuestExperience').then(m => ({ default: m.GuestExperience }))));
const SearchPage = lazy(withChunkReload(() => import('./components/SearchPage').then(m => ({ default: m.SearchPage }))));
const RelatedMusic = lazy(withChunkReload(() => import('./components/RelatedMusic').then(m => ({ default: m.RelatedMusic }))));
const DiscoverySection = lazy(withChunkReload(() => import('./components/DiscoverySection').then(m => ({ default: m.DiscoverySection }))));
const AlbumPage = lazy(withChunkReload(() => import('./components/AlbumPage').then(m => ({ default: m.AlbumPage }))));
const GenresPage = lazy(withChunkReload(() => import('./components/GenresPage').then(m => ({ default: m.GenresPage }))));
const GenrePage = lazy(withChunkReload(() => import('./components/GenrePage').then(m => ({ default: m.GenrePage }))));
const NewReleasesPage = lazy(withChunkReload(() => import('./components/NewReleasesPage').then(m => ({ default: m.NewReleasesPage }))));
const DiscoverPage = lazy(withChunkReload(() => import('./components/DiscoverPage').then(m => ({ default: m.DiscoverPage }))));
const TrendingPage = lazy(withChunkReload(() => import('./components/TrendingPage').then(m => ({ default: m.TrendingPage }))));
const FavoritesPage = lazy(withChunkReload(() => import('./components/library/FavoritesPage').then(m => ({ default: m.FavoritesPage }))));
const PlaylistsPage = lazy(withChunkReload(() => import('./components/library/PlaylistsPage').then(m => ({ default: m.PlaylistsPage }))));
const PlaylistPage = lazy(withChunkReload(() => import('./components/library/PlaylistPage').then(m => ({ default: m.PlaylistPage }))));
const HistoryPage = lazy(withChunkReload(() => import('./components/library/HistoryPage').then(m => ({ default: m.HistoryPage }))));
import { usePlayerStore, type AppView } from './store/playerStore';
import { useToastStore } from './store/toastStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useRecommendations } from './hooks/useRecommendations';
import { useSearchEngine } from './hooks/useSearchEngine';
import { MusicAPI } from './services/musicApi';

import { UserAvatar } from './components/auth/UserAvatar';
import { UserDropdown } from './components/auth/UserDropdown';
import { AuthModal, type AuthMode } from './components/auth/AuthModal';
import { useAuthStore } from './store/authStore';
import { InstallButton } from './pwa/InstallButton';
import { OfflinePage } from './pwa/OfflinePage';

import './styles/variables.css';
import './styles/foundation.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/player.css';
import './styles/shell.css';
import './styles/animations.css';
import './styles/auth.css';
import './styles/legal.css';
import { LegalPage } from './pages/LegalPage';

/**
 * A catalogue id out of the address bar. Percent-encoding that a person typed or
 * a link mangled is not worth losing the router over, so a segment that will not
 * decode is used as written and simply fails to match anything.
 */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Views only a signed-in listener has. Each one is somebody's own data, so a
 * guest reaching them is sent home with an explanation rather than shown an
 * empty page that looks broken.
 */
const PROTECTED_VIEWS: AppView[] = ['favorites', 'playlists', 'playlist', 'history'];

/**
 * The one listen-log page. Recently Played was a second view over the same
 * plays, so its two old paths now land on History instead of showing a
 * near-duplicate list. Nothing is deleted: the `recentlyPlayed` slice still
 * feeds Home's Continue Listening shelf.
 */
const HISTORY_ALIASES = ['/recent', '/recently-played'];

function App() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>('login');
  const [legalPage, setLegalPage] = useState<'terms' | 'privacy' | null>(null);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const { isAuthenticated, checkAuth } = useAuthStore();
  const { addToast } = useToastStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('auth') || params.has('code') || params.has('error')) return;
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    let mounted = true;
    const { completeOAuth } = useAuthStore.getState();
    completeOAuth().then((result) => {
      if (!mounted) return;
      if (result.status === 'success') {
        addToast({ message: 'Signed in with Google.', type: 'success' });
      } else if (result.status === 'error') {
        const reason = result.reason;
        if (reason && reason !== 'cancelled') {
          const message =
            reason === 'google' || reason === 'state'
              ? 'Unable to sign in with Google. Please try again.'
              : `Google sign-in failed: ${reason}`;
          addToast({ message, type: 'error' });
        }
        setIsAuthModalOpen(true);
        setAuthModalMode('login');
      }
    });
    return () => {
      mounted = false;
    };
  }, [addToast]);

  useEffect(() => {
    const handleOpenAuth = (e: Event) => {
      const customEvent = e as CustomEvent<AuthMode>;
      if (customEvent.detail) {
        setAuthModalMode(customEvent.detail);
      }
      setIsAuthModalOpen(true);
    };

    window.addEventListener('open-auth-modal', handleOpenAuth);
    return () => window.removeEventListener('open-auth-modal', handleOpenAuth);
  }, []);

  const detailEntity = usePlayerStore((state) => state.detailEntity);

  const {
    currentView,
    setCurrentView,
    isSidebarOpen,
    trending,
    setTrending,
    setLoading,
    setError,
    toggleSidebar,
  } = usePlayerStore();

  useKeyboardShortcuts();
  useRecommendations();
  // Mounted once, at the top: one debounce, one in-flight request, one listener
  // for the 'music-search' event no matter how many search fields are on screen.
  useSearchEngine();

  useEffect(() => {
    const handleUrlRouting = () => {
      const rawPath = window.location.pathname;
      const path = rawPath.toLowerCase();
      const isAuth = useAuthStore.getState().isAuthenticated;

      if (path === '/terms' || path === '/privacy') {
        setLegalPage(path === '/terms' ? 'terms' : 'privacy');
        return;
      }
      setLegalPage(null);

      /* Entity routes carry an id, so they are matched exactly and before the
         prefix chain below — `path.includes('/album')` would otherwise swallow
         the id and open the wrong view. Matched against the raw path because
         catalogue ids are case-sensitive; only the prefix is lower-cased. */
      const entityMatch = rawPath.match(/^\/(album|genre|playlist)\/([^/]+)$/i);
      if (entityMatch) {
        const id = safeDecode(entityMatch[2]);
        const kind = entityMatch[1].toLowerCase();
        const store = usePlayerStore.getState();
        if (kind === 'playlist' && !isAuth) {
          store.setCurrentView('home');
          try {
            window.history.replaceState(null, '', '/');
          } catch (e) {
            void e;
          }
          return;
        }
        if (kind === 'album') store.openAlbum(id);
        else if (kind === 'genre') store.openGenre(id);
        else store.openPlaylist(id);
        return;
      }

      const isProtectedRoute =
        path.includes('/favorites') ||
        path.includes('/playlists') ||
        path.includes('/history') ||
        HISTORY_ALIASES.includes(path);

      if (!isAuth && isProtectedRoute) {
        usePlayerStore.getState().setCurrentView('home');
        try {
          window.history.replaceState(null, '', '/');
        } catch {
        }
        return;
      }

      if (path.includes('/favorites')) {
        usePlayerStore.getState().setCurrentView('favorites');
      } else if (path.includes('/playlists')) {
        usePlayerStore.getState().setCurrentView('playlists');
      } else if (path.includes('/history') || HISTORY_ALIASES.includes(path)) {
        usePlayerStore.getState().setCurrentView('history');
      } else if (path === '/') {
        usePlayerStore.getState().setCurrentView('home');
      } else if (path.includes('/discover')) {
        usePlayerStore.getState().setCurrentView('discover');
      } else if (path.includes('/search')) {
        usePlayerStore.getState().setCurrentView('search');
      } else if (path.includes('/trending')) {
        usePlayerStore.getState().setCurrentView('trending');
      } else if (path.includes('/new-releases')) {
        usePlayerStore.getState().setCurrentView('new-releases');
      } else if (path.includes('/genres')) {
        usePlayerStore.getState().setCurrentView('genres');
      }
    };

    handleUrlRouting();
    window.addEventListener('popstate', handleUrlRouting);
    return () => window.removeEventListener('popstate', handleUrlRouting);
  }, []);

  useEffect(() => {
    if (!isAuthenticated && PROTECTED_VIEWS.includes(currentView)) {
      setCurrentView('home');
      addToast({
        type: 'info',
        title: 'Sign In Required',
        message: 'Please log in to access your personal library, favorites, and history.',
      });
      setIsAuthModalOpen(true);
      setAuthModalMode('login');
    }
  }, [isAuthenticated, currentView, setCurrentView, addToast]);

  useEffect(() => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/terms' || path === '/privacy') return;
    if (legalPage) return;

    /* Read the store rather than this render's values. On first mount the URL
       parser above runs in an earlier effect of the same commit, so the closure
       here still holds the pre-parse defaults — writing those would push a "/"
       over a deep link before React re-rendered with the real view. The deps
       stay on the rendered values, which is what makes this re-run at all. */
    const { currentView: view, detailEntity: entity } = usePlayerStore.getState();

    let targetPath = '/';
    // Entity views need their id in the path, so a reload or a shared link lands
    // back on the same album, genre or playlist rather than on a bare /album.
    if (entity) {
      targetPath = `/${entity.kind}/${encodeURIComponent(entity.id)}`;
    } else if (view === 'recent' || view === 'recently-played') {
      targetPath = '/history';
    } else if (view !== 'home') {
      targetPath = `/${view}`;
    }
    if (window.location.pathname !== targetPath) {
      try {
        window.history.pushState(null, '', targetPath);
      } catch (e) {
        void e;
      }
    }
  }, [currentView, detailEntity, legalPage]);

  useEffect(() => {
    const loadTrending = async () => {
      if (trending.length === 0) {
        setLoading(true);
        setError(null);
        try {
          if (import.meta.env.DEV) console.log('🎵 Loading trending music tracks...');
          const tracks = await MusicAPI.getTrendingTracks(25);
          setTrending(tracks);
          if (import.meta.env.DEV) console.log('✅ Loaded trending tracks:', tracks.length);
        } catch (error) {
          console.error('❌ Failed to load trending tracks:', error);
          const errorMsg =
            error instanceof Error
              ? error.message
              : '🎪 Trending tracks are temporarily unavailable. Try searching for specific genres like rap, electronic, or jazz.';
          setError(errorMsg);
        } finally {
          setLoading(false);
        }
      }
    };

    loadTrending();
  }, [trending.length, setTrending, setLoading, setError]);

  const theme = usePlayerStore(state => state.theme);
  useEffect(() => {
    // Soundrift is dark-only. This only mirrors the stored theme onto the root so
    // the CSS ramp in variables.css stays authoritative; the values below must
    // match --surface-0 / --text-1 or the shell and the header show a seam.
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.backgroundColor = '#08090a';
    document.body.style.color = '#ffffff';
  }, [theme]);

  useEffect(() => {
    if (window.innerWidth <= 768) {
      usePlayerStore.getState().closeSidebar();
    }
  }, [currentView]);

  const renderMainContent = () => {
    switch (currentView) {
      // Search is one surface for everyone. It is the only view where the
      // authenticated and guest experiences are identical, because a result list
      // is a result list — there is no personalisation to add to it.
      case 'search':
        return (
          <div className="view-container">
            <Suspense fallback={null}><SearchPage /></Suspense>
          </div>
        );

      // Album and genres are the same surface for everyone: an album page is the
      // album's track list, and there is no personalisation to layer onto it.
      // They sit outside the home group so a signed-in listener opening an album
      // from a track row gets the album, not their own home.
      case 'album':
        return (
          <div className="view-container">
            {detailEntity?.kind === 'album' ? (
              <Suspense fallback={null}><AlbumPage albumId={detailEntity.id} /></Suspense>
            ) : null}
          </div>
        );

      case 'genres':
        return (
          <div className="view-container">
            <Suspense fallback={null}><GenresPage /></Suspense>
          </div>
        );

      case 'genre':
        return (
          <div className="view-container">
            {detailEntity?.kind === 'genre' ? (
              <Suspense fallback={null}><GenrePage genreId={detailEntity.id} /></Suspense>
            ) : null}
          </div>
        );

      // New Releases is the catalogue's arrivals feed, not a personalised one, so
      // it renders the same page for everyone. It used to fall through to the
      // home group, which meant a signed-in listener clicking it got their own
      // home instead of the releases.
      case 'new-releases':
        return (
          <div className="view-container">
            <Suspense fallback={null}><NewReleasesPage /></Suspense>
          </div>
        );

      // Discover and Trending answer questions about the catalogue, not about the
      // listener, so signing in must not swap them for Home. They used to share
      // the home case, which is why every signed-in click on either landed back
      // on the personalised page.
      case 'discover':
        return (
          <div className="view-container">
            <Suspense fallback={null}><DiscoverPage /></Suspense>
          </div>
        );

      case 'trending':
        return (
          <div className="view-container">
            <Suspense fallback={null}><TrendingPage /></Suspense>
          </div>
        );

      case 'home':
        if (isAuthenticated) {
          return (
            <div className="view-container">
              <Suspense fallback={null}><PersonalizedHome /></Suspense>
              <Suspense fallback={null}><DiscoverySection /></Suspense>
              <Suspense fallback={null}><RelatedMusic /></Suspense>
            </div>
          );
        }
        return (
          <div className="view-container">
            <Suspense fallback={null}><GuestExperience /></Suspense>
          </div>
        );

      case 'favorites':
        return (
          <div className="view-container">
            <Suspense fallback={null}><FavoritesPage /></Suspense>
          </div>
        );

      case 'playlists':
        return (
          <div className="view-container">
            <Suspense fallback={null}><PlaylistsPage /></Suspense>
          </div>
        );

      case 'playlist':
        return (
          <div className="view-container">
            {detailEntity?.kind === 'playlist' ? (
              <Suspense fallback={null}><PlaylistPage playlistId={detailEntity.id} /></Suspense>
            ) : null}
          </div>
        );

      case 'history':
      case 'recent':
      case 'recently-played':
        return (
          <div className="view-container">
            <Suspense fallback={null}><HistoryPage /></Suspense>
          </div>
        );

      default:
        return (
          <div className="view-container">
            <Suspense fallback={null}>
              {isAuthenticated ? <PersonalizedHome /> : <GuestExperience />}
            </Suspense>
          </div>
        );
    }
  };

  if (legalPage) {
    return <LegalPage page={legalPage} />;
  }

  if (isOffline) {
    return <OfflinePage />;
  }

  return (
    <div className="app">
      <Sidebar />

      <main className={`app-main ${isSidebarOpen ? 'app-main-with-sidebar' : 'app-main-full'}`}>
        <header className="app-header">
          <button
            onClick={toggleSidebar}
            className="btn btn-ghost btn-icon mobile-menu-toggle"
            aria-label="Toggle menu"
            aria-expanded={isSidebarOpen}
            aria-controls="app-sidebar"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <h1 className="app-title">Soundrift</h1>

          <div className="header-search-container">
            <SearchBar />
          </div>

          <div className="header-actions">
            <InstallButton />
            <div className="header-avatar-wrap">
              <UserAvatar
                isOpen={isUserDropdownOpen}
                onToggle={() => setIsUserDropdownOpen((prev) => !prev)}
              />
              <UserDropdown
                isOpen={isUserDropdownOpen}
                onClose={() => setIsUserDropdownOpen(false)}
                onOpenAuthModal={(mode) => {
                  setAuthModalMode(mode);
                  setIsAuthModalOpen(true);
                }}
              />
            </div>
          </div>
        </header>

        <div className="app-content">
          {renderMainContent()}
        </div>
      </main>

      <PlayerControls />
      <QueuePanel />

      <AuthModal
        isOpen={isAuthModalOpen}
        mode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onModeChange={(newMode) => setAuthModalMode(newMode)}
        onAuthSuccess={(email) => {
          setIsAuthModalOpen(false);
          addToast({ message: `Authenticated successfully! Welcome ${email}`, type: 'success' });
        }}
      />

      <ToastContainer />
    </div>
  );
}

export default function RootApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
