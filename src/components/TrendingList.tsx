import { TrendingRow } from './TrendingRow';
import { useTrackPlayback } from '../hooks/useTrackPlayback';
import type { QueueContext, Track } from '../types/types';

interface TrendingListProps {
  tracks: Track[];
}

/** The ranking is the queue: playing #4 means #5 follows it. */
const TRENDING_CONTEXT: QueueContext = { kind: 'section', id: 'trending', name: 'Trending' };

/**
 * The ranking.
 *
 * An ordered list, not a grid — `<ol>` so the order reaches assistive technology
 * as structure rather than as a decorative number in the corner of a card, and
 * so the ranking survives with images off.
 *
 * Position is the index in the list the backend returned. That is all it claims
 * to be: no rank field exists on the payload, so nothing here presents the
 * number as a chart position or a proprietary score.
 */
export function TrendingList({ tracks }: TrendingListProps) {
  const { toggleTrack, currentTrackId, isPlaying } = useTrackPlayback(tracks, TRENDING_CONTEXT);

  return (
    /* role="list" is not redundant here: Safari drops list semantics from any
       list with list-style: none, and the order is the content on this page. */
    <ol className="trending-list" role="list" aria-label="Trending songs, in order">
      {tracks.map((track, index) => (
        <TrendingRow
          key={`${track.id}-${index}`}
          track={track}
          rank={index + 1}
          isCurrent={currentTrackId === track.id}
          isPlaying={isPlaying}
          onPlay={toggleTrack}
        />
      ))}
    </ol>
  );
}
