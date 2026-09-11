import { useEffect, useRef, useState } from 'react';
import { MusicAPI } from '../services/musicApi';
import type { Album, CuratedSection, Track } from '../types/types';

/** How many featured artists to pull latest albums from. Each is one request. */
const ARTIST_FANOUT = 6;
/** Albums kept per artist, from the top of their latest-first list. */
const ALBUMS_PER_ARTIST = 4;

export interface NewReleasesState {
  /** Albums, newest year first. Ordering within a year is the provider's own. */
  albums: Album[];
  /** Songs from the curated fresh-releases section. */
  songs: Track[];
  isLoadingAlbums: boolean;
  albumsError: string | null;
}

/**
 * Distinct artist ids from the freshest curated material, in order.
 *
 * These are the artists Soundrift is currently featuring, so their latest
 * albums are the closest thing the catalogue offers to a real arrivals feed —
 * there is no global new-releases endpoint upstream.
 */
function featuredArtistIds(sections: CuratedSection[]): string[] {
  const ordered = ['fresh_releases', 'trending', 'editors_picks'];
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const sectionId of ordered) {
    const section = sections.find((s) => s.sectionId === sectionId);
    if (!section) continue;
    for (const track of section.tracks) {
      const id = track.artist_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= ARTIST_FANOUT) return ids;
    }
  }

  return ids;
}

/** The album's year as a number, or null when the provider did not send one. */
function albumYearValue(album: Album): number | null {
  if (typeof album.year === 'number' && Number.isFinite(album.year)) return album.year;
  if (typeof album.year === 'string') {
    const parsed = Number.parseInt(album.year, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (album.releasedate) {
    const parsed = new Date(album.releasedate).getFullYear();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * The data behind New Releases.
 *
 * Songs come from the curated `fresh_releases` section, which is already in the
 * cached payload — no request, and no date is claimed for them because the
 * provider sends none on search results.
 *
 * Albums are fetched per featured artist with the provider's own `sortBy=latest`
 * ordering, which is preserved rather than re-derived. They are then grouped by
 * the real `year` field, newest first; albums with no year sort last rather
 * than being given an invented one.
 */
export function useNewReleases(
  sections: CuratedSection[],
  freshSongs: Track[],
  isCuratedLoading: boolean,
): NewReleasesState {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true);
  const [albumsError, setAlbumsError] = useState<string | null>(null);

  const sequenceRef = useRef(0);
  const artistIds = featuredArtistIds(sections);
  /* Stable across renders that did not change the artist set. */
  const artistKey = artistIds.join(',');

  useEffect(() => {
    if (!artistKey) {
      /* Still waiting on the curated payload: the skeleton is honest. */
      if (isCuratedLoading) return;

      /* Curated has settled and carries no featured artist, so there is nothing
         to request. That is an absence of data, not a failed request, so the
         page falls through to its own empty state rather than an error. */
      ++sequenceRef.current;
      setAlbums([]);
      setAlbumsError(null);
      setIsLoadingAlbums(false);
      return;
    }

    const requestId = ++sequenceRef.current;
    const ids = artistKey.split(',');
    setIsLoadingAlbums(true);
    setAlbumsError(null);

    Promise.all(
      ids.map((id) =>
        MusicAPI.getArtistAlbums(id, 0, 'latest')
          .then((page) => page.items.slice(0, ALBUMS_PER_ARTIST))
          .catch(() => [] as Album[])
      )
    )
      .then((groups) => {
        if (requestId !== sequenceRef.current) return;

        const seen = new Set<string>();
        const merged: Album[] = [];
        for (const group of groups) {
          for (const album of group) {
            if (!album?.id || seen.has(album.id)) continue;
            seen.add(album.id);
            merged.push(album);
          }
        }

        /*
         * Year is the only real recency signal on an album, so it is the only
         * thing sorted on. Ties keep the provider's latest-first order, and a
         * missing year sinks rather than guessing.
         */
        merged.sort((a, b) => {
          const ay = albumYearValue(a);
          const by = albumYearValue(b);
          if (ay === by) return 0;
          if (ay === null) return 1;
          if (by === null) return -1;
          return by - ay;
        });

        setAlbums(merged);
        if (merged.length === 0) setAlbumsError('No recent albums could be loaded.');
      })
      .catch(() => {
        if (requestId !== sequenceRef.current) return;
        setAlbums([]);
        setAlbumsError('No recent albums could be loaded.');
      })
      .finally(() => {
        if (requestId !== sequenceRef.current) return;
        setIsLoadingAlbums(false);
      });
  }, [artistKey, isCuratedLoading]);

  return { albums, songs: freshSongs, isLoadingAlbums, albumsError };
}

export { albumYearValue };
