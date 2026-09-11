/**
 * The browsable categories on the Genres surface.
 *
 * Soundrift has no genre taxonomy to browse: not one track in the catalogue
 * carries genre metadata, and the upstream API exposes no genre endpoint. What
 * it does have are the curation engine's own themed sections, which are real
 * categories with real tracks behind them. Those are what this page browses.
 *
 * Deliberately excluded: `trending` is popularity and `fresh_releases` is
 * recency — each already has its own surface — and `editors_picks` is a
 * selection rather than a category. Listing them here would turn Genres into a
 * second copy of Home.
 *
 * Every id here must exist in the backend's CURATED_SECTION_IDS. A category
 * whose section has not been generated yet is dropped at render time rather
 * than shown empty, so this list is the maximum set, not a promise.
 */
export interface GenreCategory {
  /** Matches the backend curated sectionId. */
  id: string;
  /** Fallback label. The section's own title from the API wins when present. */
  label: string;
  /** What the category is. Describes the music, never invents a statistic. */
  blurb: string;
}

export const GENRE_CATEGORIES: readonly GenreCategory[] = [
  {
    id: 'old_hindi_gold',
    label: 'Golden Era Hindi',
    blurb: 'Playback classics from the 1950s through the 1970s.',
  },
  {
    id: 'nineties_bollywood',
    label: '90s Bollywood',
    blurb: 'Film songs from across the nineties.',
  },
  {
    id: 'monsoon',
    label: 'Monsoon',
    blurb: 'Rain, clouds and the season they belong to.',
  },
  {
    id: 'late_night',
    label: 'After Midnight',
    blurb: 'Slow, quiet listening for the small hours.',
  },
  {
    id: 'morning_commute',
    label: 'Morning Drive',
    blurb: 'Bright and awake, for the drive in.',
  },
  {
    id: 'kpop',
    label: 'K-Pop',
    blurb: 'Pop from Korea, across the current wave.',
  },
  {
    id: 'worldwide',
    label: 'Worldwide',
    blurb: 'Music from beyond the subcontinent.',
  },
];

export function findGenreCategory(id: string): GenreCategory | null {
  return GENRE_CATEGORIES.find((category) => category.id === id) ?? null;
}
