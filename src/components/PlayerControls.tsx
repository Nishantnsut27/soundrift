import React, { useState, useRef, useCallback, useEffect } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { formatDuration, formatArtistNames } from '../utils/formatters';
import { requireAuth } from '../utils/requireAuth';
import { AudioVisualizer } from './AudioVisualizer';

export function PlayerControls() {
  const [showVolume, setShowVolume] = useState(false);
  const [hoverProgress, setHoverProgress] = useState(0);
  const [hoverVolume, setHoverVolume] = useState(0);
  const [volumeChangeIndicator, setVolumeChangeIndicator] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addToast = useToastStore(state => state.addToast);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!showVolume) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      
      if (target.closest('.volume') || target.closest('.volume_button')) {
        return;
      }
      
      setShowVolume(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showVolume]);
  
  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    isBuffering,
    playbackError,
    isShuffling,
    repeatMode,
    togglePlayPause,
    nextTrack,
    previousTrack,
    seek,
    changeVolume,
    mute,
    retry,
  } = usePlayer();

  const {
    currentTime,
    duration,
    addToFavorites,
    removeFromFavorites,
    favorites,
    toggleShuffle,
    setRepeatMode,
    isQueueOpen,
    toggleQueue,
  } = usePlayerStore();

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const isDraggingProgress = useRef(false);
  const isDraggingVolume = useRef(false);

  const effectiveDuration = (duration && !isNaN(duration) && duration > 0)
    ? duration
    : (currentTrack?.duration || 0);

  const progress = effectiveDuration > 0 && !isNaN(currentTime) ? 
    Math.max(0, Math.min(100, (currentTime / effectiveDuration) * 100)) : 0;
  const volumePercent = isMuted ? 0 : volume;

  const isFavorite = currentTrack ? favorites.some(f => f.id === currentTrack.id) : false;

  const handleVolumeMouseEnter = useCallback(() => {
    if (isMobile) return;
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
      volumeTimeoutRef.current = null;
    }
    setShowVolume(true);
  }, [isMobile]);

  const handleVolumeMouseLeave = useCallback(() => {
    if (isMobile) return;
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }
    volumeTimeoutRef.current = setTimeout(() => {
      setShowVolume(false);
    }, 250);
  }, [isMobile]);

  const updateProgressFromPointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!progressRef.current || effectiveDuration === 0 || !currentTrack) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percent * effectiveDuration;
    seek(newTime);
    setHoverProgress(percent * 100);
  }, [effectiveDuration, seek, currentTrack]);

  const handleProgressPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!currentTrack || effectiveDuration === 0) return;
    isDraggingProgress.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateProgressFromPointer(e);
  }, [currentTrack, effectiveDuration, updateProgressFromPointer]);

  const handleProgressPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!progressRef.current || effectiveDuration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (hoverX / rect.width) * 100));
    setHoverProgress(percent);
    if (isDraggingProgress.current) {
      updateProgressFromPointer(e);
    }
  }, [effectiveDuration, updateProgressFromPointer]);

  const handleProgressPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingProgress.current) {
      isDraggingProgress.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {
        void err;
      }
    }
  }, []);

  const updateVolumeFromPointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    let percent = 0;
    if (window.innerWidth <= 768) {
      const distFromBottom = rect.bottom - e.clientY;
      percent = Math.max(0, Math.min(100, (distFromBottom / rect.height) * 100));
    } else {
      const clickX = e.clientX - rect.left;
      percent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    }
    changeVolume(percent);
  }, [changeVolume]);

  const handleVolumePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingVolume.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateVolumeFromPointer(e);
    setVolumeChangeIndicator(true);
  }, [updateVolumeFromPointer]);

  const handleVolumePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingVolume.current) {
      updateVolumeFromPointer(e);
    } else if (volumeRef.current) {
      const rect = volumeRef.current.getBoundingClientRect();
      let percent = 0;
      if (window.innerWidth <= 768) {
        const distFromBottom = rect.bottom - e.clientY;
        percent = Math.max(0, Math.min(100, (distFromBottom / rect.height) * 100));
      } else {
        const clickX = e.clientX - rect.left;
        percent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
      }
      setHoverVolume(percent);
    }
  }, [updateVolumeFromPointer]);

  const handleVolumePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingVolume.current) {
      isDraggingVolume.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {
        void err;
      }
      setTimeout(() => setVolumeChangeIndicator(false), 800);
    }
  }, []);

  const handleToggleFavorite = () => {
    if (!currentTrack) return;

    // Guests get the auth flow, never a local write. A favourite that silently
    // lives in one browser and vanishes on the next device is a broken promise.
    if (!requireAuth('login')) return;

    if (isFavorite) {
      removeFromFavorites(currentTrack.id);
      addToast({
        type: 'info',
        title: 'Removed from Favorites',
        message: `"${currentTrack.name}" removed from favorites`,
      });
    } else {
      addToFavorites(currentTrack);
      addToast({
        type: 'success',
        title: 'Added to Favorites',
        message: `"${currentTrack.name}" added to favorites`,
      });
    }
  };

  /** Same cycle as the R keyboard shortcut, so the two never disagree. */
  const handleCycleRepeat = () => {
    setRepeatMode(repeatMode === 'none' ? 'all' : repeatMode === 'all' ? 'one' : 'none');
  };

  const repeatLabel =
    repeatMode === 'one' ? 'Repeat one' : repeatMode === 'all' ? 'Repeat all' : 'Repeat off';

  const handleVolumeClick = () => {
    if (isMobile) {
      setShowVolume((prev) => !prev);
    } else {
      mute();
    }
  };

  const handleClosePlayer = () => {
    const store = usePlayerStore.getState();
    store.pauseTrack();
    store.stopPlayback();
  };

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      );
    } else if (volume < 50) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
          <path d="M15.54,8.46 a5,5 0 0,1 0,7.07"/>
        </svg>
      );
    } else {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/>
          <path d="M19.07,4.93 a10,10 0 0,1 0,14.14M15.54,8.46 a5,5 0 0,1 0,7.07"/>
        </svg>
      );
    }
  };

  if (!currentTrack) {
    return (
      <div className="spotify-player-card">
        <div className="player-empty">
          <div className="pfp">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div className="track-info-empty">
            <div className="title-1">No track selected</div>
            <div className="title-2">Choose a song to start playing</div>
          </div>
        </div>
      </div>
    );
  }

  const seekBar = (
    <div
      className="progress-bar-container"
      ref={progressRef}
      onPointerDown={handleProgressPointerDown}
      onPointerMove={handleProgressPointerMove}
      onPointerUp={handleProgressPointerUp}
      role="slider"
      aria-label="Seek track"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(e) => {
        if (!currentTrack || effectiveDuration === 0) return;
        if (e.key === 'ArrowRight') {
          seek(Math.min(effectiveDuration, currentTime + 5));
        } else if (e.key === 'ArrowLeft') {
          seek(Math.max(0, currentTime - 5));
        }
      }}
    >
      <div className="progress-bar-hover" style={{ width: `${hoverProgress}%` }} />
      <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      <div className="progress-bar-thumb" style={{ left: `${progress}%` }} />
    </div>
  );

  return (
    <div className="spotify-player-card">
      {playbackError && (
        <div className="playback-error" role="alert">
          <span>{playbackError}</span>
          <button type="button" onClick={retry}>Retry</button>
        </div>
      )}

      {/* Region 1 — now playing */}
      <div className="top">
        <div className="pfp">
          {currentTrack.image ? (
            <img src={currentTrack.image} alt="" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          )}
        </div>

        <div className="track-info">
          <div className="title-1 truncate" title={currentTrack.name}>{currentTrack.name}</div>
          <div className="title-2 truncate" title={currentTrack.artist_name}>{formatArtistNames(currentTrack.artist_name)}</div>
        </div>

        {(isPlaying || isBuffering) && (
          <AudioVisualizer isPlaying={isPlaying} size="small" />
        )}
      </div>

      {/* Region 2 — transport + seek. Shuffle and repeat are real buttons here so
          touch users, who never receive the S/R keyboard shortcuts, can reach them. */}
      <div className="player-center">
        <div className="controls">
          <button
            className={`control-btn shuffle-btn ${isShuffling ? 'is-on' : ''}`}
            onClick={toggleShuffle}
            title={isShuffling ? 'Shuffle on' : 'Shuffle off'}
            aria-label={isShuffling ? 'Turn shuffle off' : 'Turn shuffle on'}
            aria-pressed={isShuffling}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>

          <button className="control-btn" onClick={previousTrack} title="Previous track" aria-label="Previous track">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="19,20 9,12 19,4" />
              <rect x="4" y="4.5" width="2.2" height="15" rx="1" />
            </svg>
          </button>

          <button
            className="control-btn play-btn"
            onClick={togglePlayPause}
            title={isBuffering ? 'Pause while buffering' : (isPlaying ? 'Pause' : 'Play')}
            aria-label={isBuffering ? 'Pause while buffering' : (isPlaying ? 'Pause' : 'Play')}
          >
            {isBuffering ? (
              <span className="player-buffering-spinner" aria-hidden="true" />
            ) : isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,3 20,12 6,21" />
              </svg>
            )}
          </button>

          <button className="control-btn" onClick={nextTrack} title="Next track" aria-label="Next track">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,4 15,12 5,20" />
              <rect x="17.8" y="4.5" width="2.2" height="15" rx="1" />
            </svg>
          </button>

          <button
            className={`control-btn repeat-btn ${repeatMode !== 'none' ? 'is-on' : ''}`}
            onClick={handleCycleRepeat}
            title={repeatLabel}
            aria-label={`${repeatLabel}. Activate to change.`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            {repeatMode === 'one' && <span className="repeat-one-badge" aria-hidden="true">1</span>}
          </button>
        </div>

        <div className="player-seek">
          <span className="timetext time_now">{formatDuration(currentTime)}</span>
          {seekBar}
          <span className="timetext time_full">{formatDuration(effectiveDuration)}</span>
        </div>
      </div>

      {/* Region 3 — track and session actions */}
      <div className="player-actions">
        <button
          className={`control-btn queue-btn ${isQueueOpen ? 'is-on' : ''}`}
          onClick={toggleQueue}
          title="Queue"
          aria-label="Queue"
          aria-expanded={isQueueOpen}
          aria-controls="queue-panel"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="15" y2="6" />
            <line x1="3" y1="12" x2="15" y2="12" />
            <line x1="3" y1="18" x2="11" y2="18" />
            <polygon points="18,7 18,17 23,12" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <button
          className={`control-btn favorite-btn ${isFavorite ? 'is-favorite' : ''}`}
          onClick={handleToggleFavorite}
          title={
            !isAuthenticated
              ? 'Sign in to save favorites'
              : isFavorite ? 'Remove from Favorites' : 'Add to Favorites'
          }
          aria-label={
            !isAuthenticated
              ? 'Sign in to save favorites'
              : isFavorite ? 'Remove from Favorites' : 'Add to Favorites'
          }
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        <div className="volume-control">
          <button
            className="control-btn volume_button"
            onClick={handleVolumeClick}
            onMouseEnter={handleVolumeMouseEnter}
            onMouseLeave={handleVolumeMouseLeave}
            title={isMobile ? 'Adjust volume' : (isMuted ? 'Unmute' : 'Mute')}
            aria-label={isMobile ? 'Adjust volume' : (isMuted ? 'Unmute audio' : 'Mute audio')}
          >
            {getVolumeIcon()}
          </button>

          <div
            className={`volume ${showVolume ? 'show' : ''} ${volumeChangeIndicator ? 'volume-changing' : ''}`}
            onMouseEnter={handleVolumeMouseEnter}
            onMouseLeave={handleVolumeMouseLeave}
          >
            <div className="volume-header">
              <span className="volume-label">Volume</span>
              <span className="volume-text">{Math.round(volumePercent)}%</span>
            </div>
            <div
              className="slider volume-slider"
              ref={volumeRef}
              onPointerDown={handleVolumePointerDown}
              onPointerMove={handleVolumePointerMove}
              onPointerUp={handleVolumePointerUp}
              role="slider"
              aria-label="Volume slider"
              aria-valuenow={Math.round(volumePercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                  changeVolume(Math.min(100, volume + 5));
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                  changeVolume(Math.max(0, volume - 5));
                }
              }}
            >
              <div className="volume-track">
                {!isMobile && (
                  <div className="volume-hover" style={{ width: `${hoverVolume}%` }} />
                )}
                <div
                  className="green volume-fill"
                  style={isMobile ? { height: `${volumePercent}%`, bottom: 0, top: 'auto', width: '100%' } : { width: `${volumePercent}%` }}
                />
                <div
                  className="circle volume-thumb"
                  style={isMobile ? { bottom: `${volumePercent}%`, left: '50%', top: 'auto' } : { left: `${volumePercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <button
          className="control-btn close-btn"
          onClick={handleClosePlayer}
          title="Close player"
          aria-label="Close music player"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
