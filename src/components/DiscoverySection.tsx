import { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { MusicAPI } from '../services/musicApi';
import type { Track } from '../types/types';
import { TrackListModern } from './TrackListModern';

export function DiscoverySection() {
  const { recentlyPlayed } = usePlayerStore();
  const { isAuthenticated } = useAuthStore();
  const [recommendedArtists, setRecommendedArtists] = useState<Track[]>([]);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);

  const lastPlayedArtist = recentlyPlayed[0]?.artist_name;
  const lastPlayedGenre = recentlyPlayed[0]?.musicinfo?.tags?.genres?.[0];
  const lastPlayedLanguage = recentlyPlayed[0]?.language;
  const exploreTerm = lastPlayedGenre || lastPlayedLanguage;

  useEffect(() => {
    if (!lastPlayedArtist) return;
    setIsLoadingArtists(true);
    MusicAPI.getArtistTracks(lastPlayedArtist, 8)
      .then(tracks => setRecommendedArtists(tracks.filter(t => t.id !== recentlyPlayed[0]?.id).slice(0, 8)))
      .catch(() => {})
      .finally(() => setIsLoadingArtists(false));
  }, [lastPlayedArtist, recentlyPlayed]);

  if (!isAuthenticated) return null;

  return (
    <div className="discovery-sections">
      {lastPlayedArtist && recommendedArtists.length > 0 && (
        <section className="home-section">
          <div className="section-header-row">
            <h2 className="section-title">Because You Listened To {lastPlayedArtist}...</h2>
          </div>
          <TrackListModern tracks={recommendedArtists} isLoading={isLoadingArtists} showAddToPlaylist />
        </section>
      )}

      {exploreTerm && (
        <section className="home-section">
          <div className="section-header-row">
            <h2 className="section-title">Explore {exploreTerm}</h2>
          </div>
          <GenreExplorer genre={exploreTerm} />
        </section>
      )}
    </div>
  );
}

function GenreExplorer({ genre }: { genre: string }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    MusicAPI.getTracksByGenre(genre, 8)
      .then(setTracks)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [genre]);

  return <TrackListModern tracks={tracks} isLoading={isLoading} showAddToPlaylist />;
}
