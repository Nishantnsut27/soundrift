import { useEffect, useState } from 'react';
import { MusicAPI } from '../services/musicApi';
import type { CuratedSection } from '../types/types';
import { TrackListModern } from './TrackListModern';

export function CuratedSections() {
  const [sections, setSections] = useState<CuratedSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    MusicAPI.getCuratedSections()
      .then(sections => {
        if (!cancelled) setSections(sections);
      })
      .catch(error => console.warn('[CuratedSections] Failed to load curated sections', error))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
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
