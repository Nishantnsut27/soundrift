import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';
import type { QueueContext, Track } from '../types/types';
import { TrackListModern } from './TrackListModern';
import { MusicAPI } from '../services/musicApi';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { CuratedSections } from './CuratedSections';
import { formatArtistNames } from '../utils/formatters';

/** Both shelves on this page play through the list they show. */
const RECENT_CONTEXT: QueueContext = {
  kind: 'section',
  id: 'recently-played',
  name: 'Continue Listening',
};
const TRENDING_CONTEXT: QueueContext = {
  kind: 'section',
  id: 'home-trending',
  name: 'Trending & Recommended',
};

function getPersonalizedGreeting(): string {
  const baseMessages = [
    'Long time no see',
    'We are glad to see you back',
    'Ready to jam',
    'Welcome back to your vibe',
    'Good to see you again',
    'Let the music play'
  ];

  const hour = new Date().getHours();
  if (hour < 12) baseMessages.push('Good morning', 'Morning vibes', 'Start your day right');
  else if (hour < 18) baseMessages.push('Good afternoon', 'Afternoon chill');
  else baseMessages.push('Good evening', 'Evening unwinding', 'Late night tunes');

  // Pick a random message
  return baseMessages[Math.floor(Math.random() * baseMessages.length)];
}

export function PersonalizedHome() {
  const { user } = useAuthStore();
  const {
    recentlyPlayed,
    playTrack,
    setCurrentView,
    results,
    query,
    isLoading,
    error,
    setLoading,
  } = usePlayerStore();

  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [trendingPage, setTrendingPage] = useState(0);
  const [greeting, setGreeting] = useState(() => getPersonalizedGreeting());

  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getPersonalizedGreeting());
    }, 15000); // Rotate the greeting every 15 seconds
    return () => clearInterval(interval);
  }, []);

  const firstName = user?.fullName ? user.fullName.split(' ')[0] : '';

  const isSearching = query.trim().length > 0;
  const sectionRef = useRef<HTMLElement>(null);

  // Auto scroll down to the results section when user searches
  useEffect(() => {
    if (isSearching && sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [query, isSearching]);

  // Compute trending / search tracks to feature
  const featuredTracks = isSearching
    ? results
    : trendingTracks.slice(0, (trendingPage + 1) * 8);

  const hasMoreTracks = !isSearching && trendingTracks.length > (trendingPage + 1) * 8;

  useEffect(() => {
    const loadTrending = async () => {
      if (trendingTracks.length === 0) {
        setLoading(true);
        try {
          const res = await MusicAPI.getTrendingTracks();
          setTrendingTracks(res);
        } catch (err) {
          console.error('Failed to load trending', err);
        } finally {
          setLoading(false);
        }
      }
    };

    loadTrending();
  }, [trendingTracks.length, setLoading]);

  return (
    <div className="personalized-home">
      {/* Mobile Search Bar (Sticky & Transparent just like guest view) */}
      <div className="content-search-container">
        <SearchBar />
      </div>

      {/* Header Hero Banner */}
      <div className="home-hero-banner" style={{
        background: 'linear-gradient(135deg, rgba(29, 185, 84, 0.15) 0%, rgba(18, 18, 18, 0.8) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '20px',
        padding: '1.75rem 2rem',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}>
        <div className="home-hero-user" style={{ display: 'flex', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.5px' }}>
              {greeting}, <span style={{ color: '#1ed760' }}>{firstName}</span>
            </h1>
          </div>
        </div>

        {/* Quick Stats Glass Cards (Without Counts) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          width: '100%'
        }}>
          <div 
            onClick={() => setCurrentView('favorites')} 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.9rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(29, 185, 84, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(29, 185, 84, 0.4)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.18)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>Liked Songs</span>
          </div>

          <div 
            onClick={() => setCurrentView('playlists')} 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.9rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.18)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="3" />
                <line x1="8" y1="9" x2="16" y2="9" />
                <line x1="8" y1="13" x2="16" y2="13" />
              </svg>
            </div>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>Playlists</span>
          </div>

          <div 
            onClick={() => setCurrentView('recent')} 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.9rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(168, 85, 247, 0.18)',
              color: '#a855f7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(168, 85, 247, 0.3)'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>Recently Played</span>
          </div>
        </div>
      </div>


      {/* Continue Listening / Recently Played Carousel Shelf */}
      {recentlyPlayed.length > 0 && (
        <section className="home-section">
          <div className="section-header-row">
            <h2 className="section-title">Continue Listening</h2>
            <button onClick={() => setCurrentView('recent')} className="see-all-btn">
              See All
            </button>
          </div>
          <div className="recent-tracks-grid">
            {recentlyPlayed.slice(0, 6).map((track: Track, index) => (
              <div
                key={`${track.id}-${index}`}
                className="recent-track-card"
                /* The shelf is a list, so Next carries on down it instead of
                   stranding the one card that was clicked. */
                onClick={() => playTrack(track, recentlyPlayed, index, RECENT_CONTEXT)}
              >
                <div className="track-cover-wrapper">
                  <img
                    src={track.image || track.album_image || '/Favicon.png'}
                    alt={track.name}
                    className="track-cover-img"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/Favicon.png';
                    }}
                  />
                  <div className="cover-overlay">
                    <button className="play-overlay-btn" title="Play">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="track-info">
                  <p className="track-title truncate">{track.name}</p>
                  <p className="track-artist truncate" title={track.artist_name}>{formatArtistNames(track.artist_name)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isSearching && <CuratedSections />}

      {/* Trending & Recommended / Search Results Shelf */}
      <section className="home-section" ref={sectionRef}>
        <div className="section-header-row">
          <h2 className="section-title">
            {isSearching ? 'Search Results' : 'Trending & Recommended'}
          </h2>
        </div>
        {isSearching ? (
          <SearchResults tracks={results} query={query} isLoading={isLoading} error={error} />
        ) : (
          <TrackListModern
            tracks={featuredTracks}
            title=""
            isLoading={isLoading}
            error={error}
            queueContext={TRENDING_CONTEXT}
          />
        )}
        
        {!isSearching && hasMoreTracks && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
            <button 
              onClick={() => setTrendingPage(prev => prev + 1)} 
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 28px',
                background: 'linear-gradient(135deg, rgba(29, 185, 84, 0.2) 0%, rgba(30, 215, 96, 0.1) 100%)',
                color: '#1ed760',
                border: '1px solid rgba(29, 185, 84, 0.4)',
                borderRadius: '100px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(29, 185, 84, 0.3) 0%, rgba(30, 215, 96, 0.2) 100%)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(29, 185, 84, 0.25)';
                e.currentTarget.style.borderColor = 'rgba(29, 185, 84, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(29, 185, 84, 0.2) 0%, rgba(30, 215, 96, 0.1) 100%)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(29, 185, 84, 0.4)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translateY(1px)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
              Load More
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
