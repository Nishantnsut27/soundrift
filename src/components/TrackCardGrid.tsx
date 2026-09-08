import { MusicCard } from './MusicCard';
import { useTrackPlayback } from '../hooks/useTrackPlayback';
import type { Track } from '../types/types';

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
}

/**
 * The grid every card row on Home renders into.
 *
 * It owns layout and the play wiring only — the card itself is MusicCard, and
 * the play gesture is the shared store action. No overflow menu is passed:
 * favorites and playlists are authenticated features, and a menu of things a
 * guest cannot do is worse than no menu.
 */
export function TrackCardGrid({ tracks, showRank = false, singleRow = false }: TrackCardGridProps) {
  const { toggleTrack, currentTrackId, isPlaying } = useTrackPlayback();

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
        />
      ))}
    </div>
  );
}
