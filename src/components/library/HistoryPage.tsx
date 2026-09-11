import { useMemo } from 'react';
import { ContentSection } from '../ContentSection';
import { TrackListModern } from '../TrackListModern';
import { EmptyState } from '../EmptyState';
import { usePlayerStore } from '../../store/playerStore';
import type { HistoryEntry, QueueContext } from '../../types/types';

const HISTORY_CONTEXT: QueueContext = { kind: 'section', id: 'history', name: 'Listening History' };

const DAY_MS = 86400000;

interface HistoryDay {
  key: string;
  label: string;
  entries: HistoryEntry[];
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayLabel(dayStart: number, todayStart: number): string {
  if (dayStart === todayStart) return 'Today';
  if (dayStart === todayStart - DAY_MS) return 'Yesterday';

  const date = new Date(dayStart);
  const sameYear = date.getFullYear() === new Date(todayStart).getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
  });
}

function groupByDay(entries: HistoryEntry[]): HistoryDay[] {
  const todayStart = startOfDay(Date.now());
  const days: HistoryDay[] = [];
  const byKey = new Map<string, HistoryDay>();

  for (const entry of [...entries].sort((a, b) => b.playedAt - a.playedAt)) {
    const dayStart = startOfDay(entry.playedAt);
    const key = String(dayStart);
    let day = byKey.get(key);
    if (!day) {
      day = { key, label: dayLabel(dayStart, todayStart), entries: [] };
      byKey.set(key, day);
      days.push(day);
    }
    day.entries.push(entry);
  }

  return days;
}

export function HistoryPage() {
  const listeningHistory = usePlayerStore((state) => state.listeningHistory);
  const setCurrentView = usePlayerStore((state) => state.setCurrentView);
  const playTrack = usePlayerStore((state) => state.playTrack);

  const days = useMemo(() => groupByDay(listeningHistory), [listeningHistory]);

  const playAll = () => {
    if (listeningHistory.length === 0) return;
    const ordered = days.flatMap((day) => day.entries);
    playTrack(ordered[0], ordered, 0, HISTORY_CONTEXT);
  };

  return (
    <div className="library-page">
      <header className="browse-head">
        <p className="t-eyebrow">My Library</p>
        <h1 className="t-h1">Listening History</h1>
        <p className="t-body browse-head-promise">
          {listeningHistory.length === 0
            ? 'Everything you play shows up here, newest first.'
            : `${listeningHistory.length} ${listeningHistory.length === 1 ? 'play' : 'plays'}, newest first.`}
        </p>

        {listeningHistory.length > 0 && (
          <div className="library-head-actions">
            <button type="button" className="sr-btn sr-btn-primary" onClick={playAll}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="6 3 20 12 6 21" />
              </svg>
              Play all
            </button>
          </div>
        )}
      </header>

      {listeningHistory.length === 0 ? (
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 16 14" />
            </svg>
          }
          title="No listening history yet"
          description="Play something and it will appear here, grouped by the day you heard it."
          actionText="Browse music"
          onAction={() => setCurrentView('home')}
        />
      ) : (
        days.map((day) => (
          <ContentSection
            key={day.key}
            title={day.label}
            subtitle={`${day.entries.length} ${day.entries.length === 1 ? 'play' : 'plays'}`}
          >
            <TrackListModern
              tracks={day.entries}
              variant="list"
              showAddToPlaylist
              queueContext={HISTORY_CONTEXT}
              playQueue={day.entries}
            />
          </ContentSection>
        ))
      )}
    </div>
  );
}
