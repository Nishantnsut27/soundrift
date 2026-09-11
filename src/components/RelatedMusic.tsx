import { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { MusicAPI } from '../services/musicApi';
import { TrackListModern } from './TrackListModern';

export function RelatedMusic() {
  const { currentTrack, relatedMusic, setRelatedMusic } = usePlayerStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTrack) {
      setRelatedMusic(null);
      return;
    }

    const loadRelated = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await MusicAPI.getRelatedMusic(currentTrack);
        setRelatedMusic(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load related music');
        setRelatedMusic(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadRelated();
  }, [currentTrack, setRelatedMusic]);

  if (!currentTrack || (!relatedMusic && !isLoading)) return null;

  if (isLoading) {
    return (
      <div className="related-music">
        <div className="skeleton-shimmer" style={{ height: 24, width: 180, marginBottom: 16, borderRadius: 4 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton-shimmer" style={{ width: 140, height: 140, borderRadius: 8, flexShrink: 0 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) return null;

  return (
    <div className="related-music">
      {relatedMusic?.moreFromArtist && relatedMusic.moreFromArtist.length > 0 && (
        <section>
          <h2 className="section-title">More from {currentTrack.artist_name}</h2>
          <TrackListModern
            tracks={relatedMusic.moreFromArtist}
            showAddToPlaylist
            queueContext={{
              kind: 'section',
              id: `related-artist:${currentTrack.artist_name}`,
              name: `More from ${currentTrack.artist_name}`,
            }}
          />
        </section>
      )}

      {relatedMusic?.moreFromAlbum && relatedMusic.moreFromAlbum.length > 0 && currentTrack.album_name && (
        <section>
          <div className="section-header-row">
            <h2 className="section-title">More from {currentTrack.album_name}</h2>
          </div>
          <TrackListModern
            tracks={relatedMusic.moreFromAlbum}
            showAddToPlaylist
            queueContext={{
              kind: 'section',
              id: `related-album:${currentTrack.album_name}`,
              name: `More from ${currentTrack.album_name}`,
            }}
          />
        </section>
      )}

      {relatedMusic?.similarSongs && relatedMusic.similarSongs.length > 0 && (
        <section>
          <h2 className="section-title">Similar Songs</h2>
          <TrackListModern
            tracks={relatedMusic.similarSongs}
            showAddToPlaylist
            queueContext={{ kind: 'section', id: 'related-similar', name: 'Similar Songs' }}
          />
        </section>
      )}
    </div>
  );
}