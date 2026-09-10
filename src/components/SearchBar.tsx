import { useMemo, useState } from 'react';
import { clearSearchHistory, removeSearch, useSearchHistory } from '../services/searchHistory';
import { usePlayerStore } from '../store/playerStore';
import type { SearchScope, Track } from '../types/types';

type DropdownItem = { label: string; kind: 'Song' | 'Artist' | 'Album' | 'Recent'; track: Track | null };

/** The scopes, in the order they appear in the selector. Songs is the default. */
const SCOPES: { value: SearchScope; label: string; placeholder: string }[] = [
  { value: 'songs', label: 'Songs', placeholder: 'Search songs…' },
  { value: 'artists', label: 'Artists', placeholder: 'Search artists…' },
  { value: 'albums', label: 'Albums', placeholder: 'Search albums…' },
];

/**
 * The search field.
 *
 * It is an input, not a search engine: the query lives in the store and
 * useSearchEngine performs the search. That is what lets the mobile header field
 * and the search page show the same text, and it is why submitting from anywhere
 * lands on /search?q=... instead of searching in place.
 */
const makeSuggestions = (tracks: Track[]): DropdownItem[] => {
  const used = new Set<string>();
  const add = (label: string, kind: DropdownItem['kind'], track: Track): DropdownItem | undefined => {
    const key = `${kind}:${label.toLowerCase()}`;
    if (!label || used.has(key)) return undefined;
    used.add(key);
    return { label, kind, track };
  };
  return tracks
    .flatMap((track) => [
      add(track.name, 'Song', track),
      add(track.artist_name, 'Artist', track),
      add(track.album_name, 'Album', track),
    ])
    .filter((item): item is DropdownItem => Boolean(item))
    .slice(0, 7);
};

export function SearchBar() {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  const searchInput = usePlayerStore((state) => state.searchInput);
  const results = usePlayerStore((state) => state.results);
  const searchScope = usePlayerStore((state) => state.searchScope);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const setSearchInput = usePlayerStore((state) => state.setSearchInput);
  const setSearchScope = usePlayerStore((state) => state.setSearchScope);
  const clearResults = usePlayerStore((state) => state.clearResults);
  const history = useSearchHistory();

  const hasInput = searchInput.trim().length > 0;
  const scope = SCOPES.find((item) => item.value === searchScope) ?? SCOPES[0];
  /* Suggestions are built from song results, so they only exist in the Songs
     scope. In the other two the field falls back to recent searches, which is
     right: there are no song titles to suggest for an artist lookup. */
  const suggestions = useMemo(() => (hasInput ? makeSuggestions(results) : []), [hasInput, results]);
  const dropdownItems: DropdownItem[] = suggestions.length
    ? suggestions
    : history.map((item) => ({ label: item.query, kind: 'Recent' as const, track: null }));

  /** Hands the query to the engine, which navigates to the search page and runs it. */
  const submitQuery = (value: string) => {
    const clean = value.trim();
    setIsOpen(false);
    setActiveIndex(-1);
    if (!clean) return;
    window.dispatchEvent(new CustomEvent('music-search', { detail: clean }));
  };

  return (
    <form
      className="search-bar-form"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submitQuery(searchInput);
      }}
    >
      <div className="search-bar-shell" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}>
        <div className="search-bar-container">
          <div className="search-bar-icon-badge" aria-hidden="true">
            {isLoading && hasInput ? (
              <svg className="search-bar-loading-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="8" strokeOpacity="0.3" />
                <path d="M20 12a8 8 0 0 1-8 8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            )}
          </div>

          <input
            type="text"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setIsOpen(true);
                setActiveIndex((index) => Math.min(index + 1, dropdownItems.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' && activeIndex >= 0 && dropdownItems[activeIndex]) {
                event.preventDefault();
                submitQuery(dropdownItems[activeIndex].label);
              } else if (event.key === 'Escape') {
                setIsOpen(false);
                event.currentTarget.blur();
              } else if (event.key === 'Tab') {
                setIsOpen(false);
              }
            }}
            placeholder={scope.placeholder}
            className="search-bar-input"
            aria-label={`Search ${scope.label.toLowerCase()}`}
            aria-autocomplete="list"
            aria-expanded={isOpen && dropdownItems.length > 0}
            aria-controls="search-suggestions"
            aria-activedescendant={activeIndex >= 0 ? `search-suggestion-${activeIndex}` : undefined}
            autoComplete="off"
          />

          {/* Native on purpose: keyboard, touch and screen-reader behaviour for
              free, and on a phone it opens the OS picker rather than a menu we
              would have to reimplement. */}
          <div className="search-scope">
            <select
              value={searchScope}
              onChange={(event) => setSearchScope(event.target.value as SearchScope)}
              className="search-scope-select"
              aria-label="What to search for"
            >
              {SCOPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <svg className="search-scope-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>

          {searchInput && (
            <button
              type="button"
              onClick={() => {
                clearResults();
                setIsOpen(true);
              }}
              className="search-bar-clear-btn"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {isOpen && dropdownItems.length > 0 && (
          <div
            id="search-suggestions"
            className="search-suggestions"
            role="listbox"
            aria-label={suggestions.length ? 'Search suggestions' : 'Recent searches'}
          >
            {!suggestions.length && (
              <div className="search-suggestions-heading">
                <span>Recent searches</span>
                <button type="button" onClick={() => void clearSearchHistory()}>Clear</button>
              </div>
            )}

            {dropdownItems.map((item, index) => (
              <div
                key={`${item.kind}-${item.label}`}
                id={`search-suggestion-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={`search-suggestion ${activeIndex === index ? 'active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  submitQuery(item.label);
                }}
              >
                {item.track && <img src={item.track.image || item.track.album_image || '/Favicon.png'} alt="" />}
                <span>
                  <strong>{highlight(item.label, searchInput)}</strong>
                  <small>{item.kind}</small>
                </span>
                {item.kind === 'Recent' && (
                  <button
                    type="button"
                    aria-label={`Remove ${item.label} from recent searches`}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      void removeSearch(item.label);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

function highlight(value: string, query: string) {
  const index = value.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index < 0 || !query.trim()) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark>{value.slice(index, index + query.trim().length)}</mark>
      {value.slice(index + query.trim().length)}
    </>
  );
}
