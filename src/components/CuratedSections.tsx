import { useEffect, useState } from 'react';
import { MusicAPI } from '../services/musicApi';
import type { CuratedSection } from '../types/types';
import { TrackListModern } from './TrackListModern';

const REFRESH_INTERVAL_MS = 60_000;

export function CuratedSections() {
  const [sections, setSections] = useState<CuratedSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let refreshInFlight = false;

    const loadSections = async (): Promise<void> => {
      if (refreshInFlight) return;
      refreshInFlight = true;

      try {
        const nextSections = await MusicAPI.getCuratedSections();
        if (!cancelled) setSections(nextSections);
      } catch (error) {
        console.warn('[CuratedSections] Failed to load curated sections', error);
      } finally {
        refreshInFlight = false;
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadSections();
    const refreshTimer = window.setInterval(() => void loadSections(), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  if (!isLoading && sections.length === 0) return null;

  return (
    <>
      {sections.map(section => (
        <section className="home-section" key={section.sectionId}>
          <div className="section-header-row">
            <h2 className="section-title">{section.title}</h2>
          </div>
          <TrackListModern
            tracks={section.tracks.slice(0, section.initialVisibleCount)}
            isLoading={isLoading}
            showAddToPlaylist
          />
        </section>
      ))}
    </>
  );
}
