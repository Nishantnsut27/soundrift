import { MusicCard } from './MusicCard';
import { TrackContextMenu } from './TrackContextMenu';
import { useTrackPlayback } from '../hooks/useTrackPlayback';
import type { QueueContext, Track } from '../types/types';

interface TrackCardGridProps {
  tracks: Track[];
  /** Numbers the cards, for ranked surfaces such as Trending. */
  showRank?: boolean;
  /**
   * Clamps the grid to a single row at every breakpoint, so a discovery row
   * never ends in one orphaned card on a second line. The phone rail still
   * scrolls through the full set.
   */
  singleRow?: boolean;
  /**
   * Adds a secondary "Explore" action to each card, used by Discover to follow a
   * song outwards. Omitted everywhere else, where the card carries the overflow
   * menu alone.
   */
  onExplore?: (track: Track) => void;
  /**
   * The list Next should walk after a card here is played, and what that list
   * is. Usually the full section, of which `tracks` is the visible row.
   * Without both, a card plays alone and the suggestion engine takes over.
   */
  queue?: Track[];
  queueContext?: QueueContext;
}

/**
 * The grid every card row on Home renders into.
 *
 * It owns layout and the play wiring only — the card itself is MusicCard, and
 * the play gesture is the shared store action. Every card carries the shared
 * overflow menu, whose queue actions work signed in or out; the items that need
 * an account route through the auth gate rather than being hidden.
 */
export function TrackCardGrid({
  tracks,
  showRank = false,
  singleRow = false,
  onExplore,
  queue,
  queueContext,
}: TrackCardGridProps) {
  const { toggleTrack, currentTrackId, isPlaying } = useTrackPlayback(
    queueContext ? queue ?? tracks : undefined,
    queueContext,
  );

  return (
    <div className={`music-card-grid${singleRow ? ' music-card-grid-row' : ''}`}>
      {tracks.map((track, index) => (
        <MusicCard
          key={track.id}
          track={track}
          onPlay={toggleTrack}
          isCurrent={currentTrackId === track.id}
          isPlaying={isPlaying}
          rank={index + 1}
          showRank={showRank}
          menu={
            <>
              {onExplore && (
                <button
                  type="button"
                  className="music-card-explore"
                  onClick={() => onExplore(track)}
                  aria-label={`Explore music related to ${track.name}`}
                >
                  Explore
                </button>
              )}
              <TrackContextMenu track={track} onPlay={toggleTrack} />
            </>
          }
        />
      ))}
    </div>
  );
}
