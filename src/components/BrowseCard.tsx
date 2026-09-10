import { useCollectionPlayback, type CollectionKind } from '../hooks/useCollectionPlayback';

const FALLBACK_ART = '/Favicon.png';

interface BrowseCardProps {
  kind: CollectionKind;
  id: string;
  name: string;
  image?: string;
  /** One line under the name — a year, an artist, a song count. Never invented. */
  meta?: string | null;
  /** Opens the collection's own page. */
  onOpen: () => void;
}

/**
 * The card used for every album and catalogue playlist grid.
 *
 * The artwork opens the collection. A cover is a destination, and starting
 * playback from it meant a listener who only wanted to look inside was already
 * hearing track 1 before the page loaded. Playing the whole thing is still one
 * click, but a deliberate one: a small button in the corner of the cover, which
 * appears on hover and stays visible on touch, where there is no hover to
 * reveal it.
 *
 * Sizing matches {@link MusicCard} by construction: a 1:1 artwork box above a
 * fixed two-row caption, so every card in a row is the same height whatever the
 * title length.
 */
export function BrowseCard({ kind, id, name, image, meta, onOpen }: BrowseCardProps) {
  const { playCollection, pendingId, activeId, isPlaying } = useCollectionPlayback();

  const isActive = activeId === id;
  const showPause = isActive && isPlaying;
  const isPending = pendingId === id;
  const noun = kind === 'album' ? 'album' : 'playlist';

  return (
    <article className={`browse-card${isActive ? ' is-current' : ''}`}>
      <div className="browse-card-art">
        {/* The same action as the caption below, offered as a larger target for
            a pointer. Kept out of the tab order and hidden from assistive tech
            so the card is not two identical "Open …" controls. */}
        <button
          type="button"
          className="browse-card-open"
          onClick={onOpen}
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={image || FALLBACK_ART}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.endsWith(FALLBACK_ART)) return;
              img.src = FALLBACK_ART;
            }}
          />
        </button>

        <button
          type="button"
          className={`browse-card-play${isPending ? ' is-pending' : ''}`}
          onClick={() => void playCollection(kind, id, name)}
          aria-label={showPause ? `Pause the ${noun} ${name}` : `Play the ${noun} ${name}`}
          aria-busy={isPending}
        >
          {isPending ? (
            <svg className="browse-card-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
              <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
            </svg>
          ) : showPause ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21" />
            </svg>
          )}
        </button>
      </div>

      <button
        type="button"
        className="browse-card-label"
        onClick={onOpen}
        aria-label={`Open the ${noun} ${name}`}
      >
        <span className="browse-card-name truncate" title={name}>{name}</span>
        <span className="browse-card-meta t-micro truncate">{meta || ' '}</span>
      </button>
    </article>
  );
}
