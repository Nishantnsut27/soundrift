import { useCuratedSections } from '../hooks/useCuratedSections';
import { TrackListModern } from './TrackListModern';

/**
 * Reads the shared curated payload rather than fetching its own. This used to
 * run a second 60s timer against the same endpoint, so authenticated Home polled
 * it twice a minute; the hook already holds one refcounted timer and dedupes
 * concurrent loads for every other surface that shows this material.
 */
export function CuratedSections() {
  const { sections, isLoading } = useCuratedSections();
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
            playQueue={section.tracks}
            queueContext={{ kind: 'section', id: section.sectionId, name: section.title }}
            isLoading={isLoading}
            showAddToPlaylist
          />
        </section>
      ))}
    </>
  );
}
