import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { formatDuration, formatArtistNames } from '../utils/formatters';
import type { QueueContext, QueueEntry } from '../types/types';

const FALLBACK_ART = '/Favicon.png';

function contextLabel(context: QueueContext): string {
  switch (context.kind) {
    case 'album':
      return `Playing from album · ${context.name}`;
    case 'playlist':
      return `Playing from playlist · ${context.name}`;
    case 'section':
      return `Playing from ${context.name}`;
    default:
      return 'Playing a single track';
  }
}

export function QueuePanel() {
  const isQueueOpen = usePlayerStore((state) => state.isQueueOpen);
  const closeQueue = usePlayerStore((state) => state.closeQueue);
  const queue = usePlayerStore((state) => state.queue);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const queueContext = usePlayerStore((state) => state.queueContext);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const reorderQueue = usePlayerStore((state) => state.reorderQueue);
  const clearQueue = usePlayerStore((state) => state.clearQueue);

  const panelRef = useRef<HTMLElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!isQueueOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeQueue();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQueueOpen, closeQueue]);

  useEffect(() => {
    if (!isQueueOpen) return;
    panelRef.current?.focus();
  }, [isQueueOpen]);

  if (!isQueueOpen) return null;

  const nowPlaying = currentIndex >= 0 ? queue[currentIndex] : undefined;
  const upNext = currentIndex >= 0 ? queue.slice(currentIndex + 1) : queue;

  const move = (entry: QueueEntry, direction: -1 | 1) => {
    const from = queue.findIndex((item) => item.queueEntryId === entry.queueEntryId);
    const to = from + direction;
    if (from === -1 || to <= currentIndex || to >= queue.length) return;

    reorderQueue(from, to);
    setAnnouncement(`${entry.name} moved to position ${to - currentIndex} of ${queue.length - currentIndex - 1}`);
  };

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDropTargetId(null);
      return;
    }

    const from = queue.findIndex((item) => item.queueEntryId === draggingId);
    const to = queue.findIndex((item) => item.queueEntryId === targetId);

    if (from !== -1 && to !== -1 && to > currentIndex) {
      reorderQueue(from, to);
      setAnnouncement(`${queue[from].name} moved to position ${to - currentIndex} of ${queue.length - currentIndex - 1}`);
    }

    setDraggingId(null);
    setDropTargetId(null);
  };

  return (
    <>
      <div className="queue-scrim" onClick={closeQueue} aria-hidden="true" />

      <aside
        id="queue-panel"
        ref={panelRef}
        className="queue-panel"
        role="dialog"
        aria-label="Playback queue"
        tabIndex={-1}
      >
        <header className="queue-panel-head">
          <div className="queue-panel-titles">
            <h2 className="queue-panel-title">Queue</h2>
            <p className="queue-panel-context truncate">{contextLabel(queueContext)}</p>
          </div>

          <div className="queue-panel-head-actions">
            <button
              type="button"
              className="sr-btn sr-btn-quiet sr-btn-sm"
              onClick={clearQueue}
              disabled={upNext.length === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="queue-panel-close"
              onClick={closeQueue}
              aria-label="Close queue"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="queue-panel-body">
          {!currentTrack && upNext.length === 0 ? (
            <p className="queue-panel-empty">
              Nothing is queued. Play a song, or use the ⋮ menu on any track to add one.
            </p>
          ) : (
            <>
              {nowPlaying && (
                <section className="queue-group" aria-labelledby="queue-now-playing">
                  <h3 className="queue-group-title" id="queue-now-playing">Now playing</h3>
                  <div className="queue-row is-current">
                    <span className="queue-row-handle-slot" aria-hidden="true">
                      <span className={`queue-row-bars${isPlaying ? ' is-playing' : ''}`}>
                        <i /><i /><i />
                      </span>
                    </span>
                    <img
                      className="queue-row-art"
                      src={nowPlaying.image || nowPlaying.album_image || FALLBACK_ART}
                      alt=""
                      loading="lazy"
                    />
                    <span className="queue-row-text">
                      <span className="queue-row-title truncate">{nowPlaying.name}</span>
                      <span className="queue-row-artist truncate">{formatArtistNames(nowPlaying.artist_name)}</span>
                    </span>
                    <span className="queue-row-duration">{formatDuration(nowPlaying.duration)}</span>
                  </div>
                </section>
              )}

              <section className="queue-group" aria-labelledby="queue-up-next">
                <h3 className="queue-group-title" id="queue-up-next">
                  Up next{upNext.length > 0 ? ` · ${upNext.length}` : ''}
                </h3>

                {upNext.length === 0 ? (
                  <p className="queue-panel-empty">Nothing queued after this track.</p>
                ) : (
                  <ol className="queue-list">
                    {upNext.map((entry, position) => (
                      <li
                        key={entry.queueEntryId}
                        className={`queue-row${draggingId === entry.queueEntryId ? ' is-dragging' : ''}${dropTargetId === entry.queueEntryId ? ' is-drop-target' : ''}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDropTargetId(entry.queueEntryId);
                        }}
                        onDragLeave={() => setDropTargetId((id) => (id === entry.queueEntryId ? null : id))}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleDrop(entry.queueEntryId);
                        }}
                      >
                        <button
                          type="button"
                          className="queue-row-handle"
                          draggable
                          onDragStart={() => setDraggingId(entry.queueEntryId)}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDropTargetId(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowUp') {
                              event.preventDefault();
                              move(entry, -1);
                            } else if (event.key === 'ArrowDown') {
                              event.preventDefault();
                              move(entry, 1);
                            }
                          }}
                          aria-label={`Reorder ${entry.name}, position ${position + 1} of ${upNext.length}. Use arrow up and arrow down to move it.`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="9" cy="6" r="1.6" />
                            <circle cx="15" cy="6" r="1.6" />
                            <circle cx="9" cy="12" r="1.6" />
                            <circle cx="15" cy="12" r="1.6" />
                            <circle cx="9" cy="18" r="1.6" />
                            <circle cx="15" cy="18" r="1.6" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="queue-row-play"
                          onClick={() => playTrack(entry, queue, queue.indexOf(entry), queueContext)}
                          aria-label={`Play ${entry.name}`}
                        >
                          <img
                            className="queue-row-art"
                            src={entry.image || entry.album_image || FALLBACK_ART}
                            alt=""
                            loading="lazy"
                          />
                          <span className="queue-row-text">
                            <span className="queue-row-title truncate">{entry.name}</span>
                            <span className="queue-row-artist truncate">{formatArtistNames(entry.artist_name)}</span>
                          </span>
                        </button>

                        <span className="queue-row-duration">{formatDuration(entry.duration)}</span>

                        <button
                          type="button"
                          className="queue-row-remove"
                          onClick={() => {
                            removeFromQueue(entry.queueEntryId);
                            setAnnouncement(`${entry.name} removed from the queue`);
                          }}
                          aria-label={`Remove ${entry.name} from the queue`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>

        <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
      </aside>
    </>
  );
}
