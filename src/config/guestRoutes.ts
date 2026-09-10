import type { AppView } from '../store/playerStore';

/**
 * Information architecture for the guest experience.
 *
 * Each surface answers exactly one question. This map is the written-down
 * version of that split, so the routes cannot quietly collapse back into five
 * copies of the same page: Home is built, and the rest declare their purpose
 * here while their dedicated experiences are still to come.
 */
export interface GuestRouteMeta {
  view: GuestRouteView;
  label: string;
  /** The single question this surface exists to answer. */
  question: string;
  /** What the finished surface will do, in the user's terms. */
  promise: string;
}

/** The routes reachable from guest navigation. */
export type GuestRouteView = Extract<
  AppView,
  'home' | 'discover' | 'search' | 'trending' | 'new-releases' | 'genres'
>;

export const GUEST_ROUTES: Record<GuestRouteView, GuestRouteMeta> = {
  home: {
    view: 'home',
    label: 'Home',
    question: 'What should I listen to?',
    promise: 'A curated starting point: what is hot, what is new and what is worth hearing.',
  },
  discover: {
    view: 'discover',
    label: 'Discover',
    question: 'I want to explore music.',
    promise: 'Open-ended exploration that keeps widening rather than ranking.',
  },
  search: {
    view: 'search',
    label: 'Search',
    question: 'I know what I am looking for.',
    promise: 'Direct lookup by song, artist or album name.',
  },
  trending: {
    view: 'trending',
    label: 'Trending',
    question: 'What is popular right now?',
    promise: 'The full ranked picture of what listeners are playing today.',
  },
  'new-releases': {
    view: 'new-releases',
    label: 'New Releases',
    question: 'What was released recently?',
    promise: 'Recent arrivals, ordered by when they landed.',
  },
  genres: {
    view: 'genres',
    label: 'Genres',
    question: 'What type of music do I want?',
    promise: 'Entry points by genre, so a mood can lead the way.',
  },
};

/**
 * Every guest route now has its own surface, so there is no preview fallback
 * left to declare. If a future route ships before its page does, reintroduce a
 * narrow preview type here rather than pointing it at another route's data.
 */

