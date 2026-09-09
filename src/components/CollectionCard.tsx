import { formatRelativeTime } from '../utils/formatters';
import type { CuratedSection } from '../types/types';

const FALLBACK_ART = '/Favicon.png';

/** Four covers make a square mosaic; fewer than four falls back to one cover. */
const MOSAIC_SIZE = 4;

interface CollectionCardProps {
  section: CuratedSection;
  isOpen: boolean;
  onOpen: () => void;
  /** Id of the panel this card discloses, for aria-controls. */
  panelId: string;
}

/**
 * One curated collection, presented as a thing you choose rather than a row you
 * scroll past. That is the difference between this and Home: Home spends a
 * section per collection and shows its songs; Discover puts the collections
 * side by side so picking between them is the interaction.
 *
 * Everything on the face of the card is real: the backend's own title, the real
 * number of tracks it holds, the timestamp of the last curation run, and the
 * covers of the first few tracks inside it. The backend stores no description
 * for a collection, so none is written here — a card carrying an invented
 * "a curated Soundrift mix" strapline would be fiction on every one of them.
 */
export function CollectionCard({ section, isOpen, onOpen, panelId }: CollectionCardProps) {
  const covers = section.tracks
    .map((track) => track.image || track.album_image)
    .filter(Boolean)
    .slice(0, MOSAIC_SIZE);

  const updated = formatRelativeTime(section.updatedAt || section.generatedAt);
  const count = section.totalTracks || section.tracks.length;

  return (
    <button
      type="button"
      className={`discover-collection${isOpen ? ' is-open' : ''}`}
      onClick={onOpen}
      aria-expanded={isOpen}
      aria-controls={panelId}
    >
      <span
        className={`discover-collection-art${covers.length >= MOSAIC_SIZE ? ' is-mosaic' : ''}`}
        aria-hidden="true"
      >
        {(covers.length >= MOSAIC_SIZE ? covers : covers.slice(0, 1)).map((cover, index) => (
          <img
            key={`${cover}-${index}`}
            src={cover || FALLBACK_ART}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              const img = event.currentTarget;
              if (img.src.endsWith(FALLBACK_ART)) return;
              img.src = FALLBACK_ART;
            }}
          />
        ))}
      </span>

      <span className="discover-collection-meta">
        <span className="discover-collection-title truncate">{section.title}</span>
        <span className="discover-collection-facts">
          {count} {count === 1 ? 'song' : 'songs'}
          {updated && (
            <>
              <span className="discover-dot" aria-hidden="true">
                ·
              </span>
              Updated {updated}
            </>
          )}
        </span>
      </span>
    </button>
  );
}
